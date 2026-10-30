import {
  OfflineError,
  SyncAuthError,
  SyncClientError,
  SyncNetworkError,
  SyncUpdateRequiredError,
} from "./errors";
import type { SyncStore } from "./store";
import type { SyncTransport } from "./transport";
import type { PulledRow } from "./wire";

// Sync loop (docs/local-first/sync-protocol.md §5): push the outbox, then pull
// until caught up. It runs on start, when the device comes back online, when the
// app returns to the foreground, periodically, and shortly after local writes.

export type SyncPhase =
  | "idle"
  | "syncing"
  | "offline"
  | "error"
  | "auth_required"
  | "update_required";

export interface SyncStatus {
  phase: SyncPhase;
  // Records with local changes the server hasn't accepted yet.
  pending_count: number;
  // Rolled-back changes the user hasn't dismissed yet.
  rejection_count: number;
  last_synced_at: string | null;
  last_error: string | null;
}

export interface SyncEnvironment {
  isOnline(): boolean;
  setTimer(callback: () => void, delay_ms: number): unknown;
  clearTimer(timer_handle: unknown): void;
  random(): number;
  // Calls the listener when the device comes back online or the app returns
  // to the foreground. Returns the unsubscribe function.
  onWake(listener: () => void): () => void;
  // Calls the listener when the device loses its connection, so online-only
  // edits can be disabled right away. Returns the unsubscribe function.
  onOffline(listener: () => void): () => void;
}

export function browserSyncEnvironment(): SyncEnvironment {
  return {
    isOnline: () => navigator.onLine,
    setTimer: (callback, delay_ms) => window.setTimeout(callback, delay_ms),
    clearTimer: (timer_handle) => window.clearTimeout(timer_handle as number),
    random: Math.random,
    onWake: (listener) => {
      const onVisibilityChange = () => {
        if (document.visibilityState === "visible") listener();
      };
      window.addEventListener("online", listener);
      document.addEventListener("visibilitychange", onVisibilityChange);
      return () => {
        window.removeEventListener("online", listener);
        document.removeEventListener("visibilitychange", onVisibilityChange);
      };
    },
    onOffline: (listener) => {
      window.addEventListener("offline", listener);
      return () => window.removeEventListener("offline", listener);
    },
  };
}

export interface SyncEngineOptions {
  store: SyncStore;
  transport: SyncTransport;
  environment?: SyncEnvironment;
  periodic_interval_ms?: number;
  local_write_debounce_ms?: number;
  backoff_base_ms?: number;
  backoff_max_ms?: number;
  pull_page_limit?: number;
}

// Guards against a server that keeps answering without making progress.
const MAX_PUSH_ROUNDS_PER_SYNC = 50;
const MAX_PULL_PAGES_PER_SYNC = 10_000;

export class SyncEngine {
  private readonly store: SyncStore;
  private readonly transport: SyncTransport;
  private readonly environment: SyncEnvironment;
  private readonly periodic_interval_ms: number;
  private readonly local_write_debounce_ms: number;
  private readonly backoff_base_ms: number;
  private readonly backoff_max_ms: number;
  private readonly pull_page_limit: number;

  private status: SyncStatus = {
    phase: "idle",
    pending_count: 0,
    rejection_count: 0,
    last_synced_at: null,
    last_error: null,
  };
  private readonly status_listeners = new Set<(status: SyncStatus) => void>();
  private running_sync: Promise<void> | null = null;
  private rerun_requested = false;
  private started = false;
  // Set by errors that retrying can't fix; cleared only by start().
  private halted = false;
  private failed_attempts = 0;
  private scheduled_timer: unknown = null;
  private teardown_callbacks: (() => void)[] = [];

  constructor(options: SyncEngineOptions) {
    this.store = options.store;
    this.transport = options.transport;
    this.environment = options.environment ?? browserSyncEnvironment();
    this.periodic_interval_ms = options.periodic_interval_ms ?? 5 * 60_000;
    this.local_write_debounce_ms = options.local_write_debounce_ms ?? 2_000;
    this.backoff_base_ms = options.backoff_base_ms ?? 2_000;
    this.backoff_max_ms = options.backoff_max_ms ?? 5 * 60_000;
    this.pull_page_limit = options.pull_page_limit ?? 500;
  }

  // Arrow properties, so React can pass them to useSyncExternalStore unbound.
  getStatus = (): SyncStatus => this.status;

  subscribe = (listener: (status: SyncStatus) => void): (() => void) => {
    this.status_listeners.add(listener);
    return () => this.status_listeners.delete(listener);
  };

  private updateStatus(status_changes: Partial<SyncStatus>): void {
    this.status = { ...this.status, ...status_changes };
    for (const listener of this.status_listeners) listener(this.status);
  }

  // Starts syncing for the signed-in user. A database holding another user's
  // data is reset first. Resolves once the database is bound to the user; the
  // first sync runs in the background (await syncNow() to wait for it).
  async start(user_id: number): Promise<void> {
    this.stop();
    this.started = true;
    this.halted = false;
    this.failed_attempts = 0;
    await this.store.bindUser(user_id);
    const sync_state = await this.store.readSyncState();
    this.updateStatus({
      phase: "idle",
      last_error: null,
      last_synced_at: sync_state.last_synced_at,
    });
    this.teardown_callbacks.push(
      this.environment.onWake(() => void this.syncNow()),
      this.environment.onOffline(() => void this.refreshCounts({ phase: "offline" })),
      this.store.subscribe((change_event) => {
        if (change_event.source !== "local") return;
        this.scheduleSync(this.local_write_debounce_ms);
        void this.refreshCounts({});
      })
    );
    void this.syncNow();
  }

  stop(): void {
    this.started = false;
    this.clearScheduledSync();
    for (const teardown of this.teardown_callbacks) teardown();
    this.teardown_callbacks = [];
  }

  // Stops and waits for a sync in progress, so the database can be closed.
  async shutdown(): Promise<void> {
    this.stop();
    this.halted = true;
    await this.running_sync;
  }

  private clearScheduledSync(): void {
    if (this.scheduled_timer !== null) this.environment.clearTimer(this.scheduled_timer);
    this.scheduled_timer = null;
  }

  // One timer at a time: the earliest wanted sync replaces a later one, except
  // that a pending backoff isn't shortened by local writes.
  private scheduleSync(delay_ms: number, replace_existing = true): void {
    if (!this.started || this.halted) return;
    if (this.scheduled_timer !== null && !replace_existing) return;
    this.clearScheduledSync();
    this.scheduled_timer = this.environment.setTimer(() => {
      this.scheduled_timer = null;
      void this.syncNow();
    }, delay_ms);
  }

  // Runs a sync now, or once more after the one in progress, and resolves when
  // the outbox has been pushed and pull has caught up (or the attempt failed;
  // the status tells which).
  syncNow(): Promise<void> {
    if (this.running_sync) {
      this.rerun_requested = true;
      return this.running_sync;
    }
    this.running_sync = (async () => {
      try {
        do {
          this.rerun_requested = false;
          await this.runSyncOnce();
        } while (this.rerun_requested && !this.halted);
      } finally {
        this.running_sync = null;
      }
    })();
    return this.running_sync;
  }

  private async runSyncOnce(): Promise<void> {
    if (this.halted) return;
    this.clearScheduledSync();
    if (!this.environment.isOnline()) {
      await this.refreshCounts({ phase: "offline" });
      return;
    }
    this.updateStatus({ phase: "syncing" });
    try {
      await this.pushOutbox();
      await this.pullUntilCaughtUp();
      const last_synced_at = await this.store.markSynced();
      this.failed_attempts = 0;
      await this.refreshCounts({ phase: "idle", last_error: null, last_synced_at });
      this.scheduleSync(this.periodic_interval_ms);
    } catch (sync_error) {
      await this.handleSyncError(sync_error);
    }
  }

  // Removes rejections the user has seen and updates the count.
  async dismissRejections(rejection_ids: number[]): Promise<void> {
    await this.store.dismissRejections(rejection_ids);
    await this.refreshCounts({});
  }

  // Re-reads the counts, e.g. after rejections were recorded outside a sync.
  async refreshStatus(): Promise<void> {
    await this.refreshCounts({});
  }

  private async refreshCounts(status_changes: Partial<SyncStatus>): Promise<void> {
    const pending_count = await this.store.countPendingRecords();
    const rejection_count = (await this.store.listRejections()).length;
    this.updateStatus({ ...status_changes, pending_count, rejection_count });
  }

  private async handleSyncError(sync_error: unknown): Promise<void> {
    const error_message = sync_error instanceof Error ? sync_error.message : String(sync_error);
    if (sync_error instanceof SyncAuthError) {
      this.halted = true;
      await this.refreshCounts({ phase: "auth_required", last_error: error_message });
      return;
    }
    if (sync_error instanceof SyncUpdateRequiredError) {
      this.halted = true;
      await this.refreshCounts({ phase: "update_required", last_error: error_message });
      return;
    }
    if (sync_error instanceof SyncClientError) {
      // A bug on this side: stop instead of hammering the server.
      this.halted = true;
      await this.refreshCounts({ phase: "error", last_error: error_message });
      return;
    }
    const phase: SyncPhase =
      sync_error instanceof SyncNetworkError && !this.environment.isOnline() ? "offline" : "error";
    await this.refreshCounts({ phase, last_error: error_message });
    this.scheduleSync(this.nextBackoffMs());
  }

  // Exponential backoff with jitter: half the step plus up to the other half.
  private nextBackoffMs(): number {
    const backoff_step_ms = Math.min(
      this.backoff_max_ms,
      this.backoff_base_ms * 2 ** this.failed_attempts
    );
    this.failed_attempts += 1;
    return Math.round(backoff_step_ms / 2 + (this.environment.random() * backoff_step_ms) / 2);
  }

  private async pushOutbox(): Promise<void> {
    for (let push_round = 0; push_round < MAX_PUSH_ROUNDS_PER_SYNC; push_round++) {
      const push_batch = await this.store.buildPushBatch();
      if (!push_batch) return;
      const push_results = await this.transport.push(push_batch.changes);
      await this.store.applyPushResults(push_batch, push_results);
    }
  }

  private async pullUntilCaughtUp(): Promise<void> {
    let ledger_reset_done = false;
    for (let pull_page_count = 0; pull_page_count < MAX_PULL_PAGES_PER_SYNC; pull_page_count++) {
      const sync_state = await this.store.readSyncState();
      const pull_page = await this.transport.pull(sync_state.since, this.pull_page_limit);
      const { ledger_changed } = await this.store.applyPullPage(pull_page);
      if (ledger_changed) {
        if (ledger_reset_done) throw new Error("台帳の切り替えが完了しませんでした");
        // Joined or left a household: push what is pending, then start over.
        await this.pushOutbox();
        await this.store.resetForLedger(pull_page.ledger_id);
        ledger_reset_done = true;
        continue;
      }
      if (!pull_page.has_more) return;
    }
  }

  // Runs an online-only edit (a ledger command), applies the row it returns,
  // then syncs so the cache catches up with everything the command touched.
  async runCommand(send: () => Promise<PulledRow>): Promise<PulledRow> {
    if (this.status.phase === "update_required") throw new SyncUpdateRequiredError();
    if (!this.environment.isOnline()) throw new OfflineError();
    let written_row: PulledRow;
    try {
      written_row = await send();
    } catch (command_error) {
      if (
        command_error instanceof SyncAuthError ||
        command_error instanceof SyncUpdateRequiredError
      ) {
        await this.handleSyncError(command_error);
      }
      throw command_error;
    }
    await this.store.applyCommandRow(written_row);
    await this.syncNow();
    return written_row;
  }
}
