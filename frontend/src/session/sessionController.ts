import { api, AuthError, clearRuntimeCaches, setApiAccessTokenProvider } from "../api/client";
import type { components } from "../api/types";
import { LocalDbBusyError, LocalDbInitError, openLocalDb, type LocalDb } from "../db/client";
import { AuthSession, type KeyValueStorage } from "../sync/authSession";
import type { SyncEnvironment } from "../sync/engine";
import { SyncAuthError } from "../sync/errors";
import { createSyncClient, type SyncClient } from "../sync/index";
import { pushOutboxAndRecreate, type RejectedRecoveryChange } from "../sync/recovery";
import { HttpSyncTransport } from "../sync/transport";

// App session lifecycle (#201): sign-in, opening the local database, starting
// the sync engine, and sign-out. It lives outside React so that the database,
// which takes an exclusive Web Lock, is opened exactly once per session even
// when effects run twice (StrictMode).

export type UserProfile = components["schemas"]["UserResponse"];

export interface AppServices {
  api_base_url: string;
  auth_session: AuthSession;
  openDb(): Promise<LocalDb>;
  // Last known profile, so the app starts offline with the user's name.
  profile_storage: KeyValueStorage;
  sync_environment?: SyncEnvironment;
}

export function createBrowserAppServices(): AppServices {
  const api_base_url = import.meta.env.VITE_API_URL;
  return {
    api_base_url,
    auth_session: new AuthSession({ api_base_url }),
    openDb: openLocalDb,
    profile_storage: localStorage,
  };
}

export interface AppSession {
  user: UserProfile;
  local_db: LocalDb;
  sync_client: SyncClient;
}

export type SessionState =
  | { status: "checking" }
  | { status: "anonymous"; notice: string | null }
  // The local database can't be opened here (another tab, no OPFS, ...).
  | { status: "unavailable"; message: string }
  | { status: "ready"; session: AppSession };

const PROFILE_STORAGE_KEY = "atoikura.user_profile";

function errorMessage(caught_error: unknown, fallback_message: string): string {
  return caught_error instanceof Error && caught_error.message
    ? caught_error.message
    : fallback_message;
}

export class SessionController {
  private readonly services: AppServices;
  private state: SessionState = { status: "checking" };
  private readonly state_listeners = new Set<() => void>();
  private initialized = false;
  private session_teardown: (() => Promise<void>) | null = null;
  // Rejections from a reset and re-sync, recorded once the new database is open.
  private pending_recovery_rejections: RejectedRecoveryChange[] = [];

  // No side effects here: React may construct a controller it then discards.
  constructor(services: AppServices) {
    this.services = services;
  }

  getState = (): SessionState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.state_listeners.add(listener);
    return () => this.state_listeners.delete(listener);
  };

  private setState(next_state: SessionState): void {
    this.state = next_state;
    for (const listener of this.state_listeners) listener();
  }

  // Resumes a stored session, or shows the login screen. Runs once.
  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    setApiAccessTokenProvider(this.services.auth_session);
    const stored_user_id = this.services.auth_session.user_id;
    if (!this.services.auth_session.hasSession() || stored_user_id === null) {
      this.setState({ status: "anonymous", notice: null });
      return;
    }
    await this.startSession(stored_user_id, null);
  }

  // Throws AuthError for wrong credentials, so the login screen can say so.
  async login(email: string, password: string): Promise<void> {
    let user_id: number;
    try {
      user_id = await this.services.auth_session.login(email, password);
    } catch (login_error) {
      if (login_error instanceof SyncAuthError) throw new AuthError(login_error.message);
      throw login_error;
    }
    const user_profile = await api.getCurrentUser();
    await this.startSession(user_id, user_profile);
  }

  async signup(email: string, password: string, display_name: string | null): Promise<void> {
    await api.signup({ email, password, display_name });
    await this.login(email, password);
  }

  // Signs out. Local data stays on the device until another user signs in;
  // pending changes are pushed when the same user comes back.
  async logout(notice: string | null = null): Promise<void> {
    await this.closeSession();
    await this.services.auth_session.logout();
    this.services.profile_storage.removeItem(PROFILE_STORAGE_KEY);
    void clearRuntimeCaches();
    this.setState({ status: "anonymous", notice });
  }

  private async closeSession(): Promise<void> {
    const teardown = this.session_teardown;
    this.session_teardown = null;
    if (!teardown) return;
    await teardown();
    if (this.state.status === "ready") {
      try {
        await this.state.session.local_db.close();
      } catch {
        // Closing is best-effort; the worker goes away with the page anyway.
      }
    }
  }

  private async openDatabase(): Promise<LocalDb> {
    try {
      return await this.services.openDb();
    } catch (open_error) {
      if (!(open_error instanceof LocalDbInitError) || !open_error.recovery) throw open_error;
      // The database can't be migrated: push what is pending, start over empty,
      // and keep what the server refused so the user still sees it.
      const recovery_transport = new HttpSyncTransport({
        api_base_url: this.services.api_base_url,
        auth: this.services.auth_session,
      });
      const { local_db, recovery_report } = await pushOutboxAndRecreate(
        open_error.recovery,
        recovery_transport
      );
      this.pending_recovery_rejections = recovery_report.rejected_changes;
      return local_db;
    }
  }

  private async loadProfile(
    user_id: number,
    known_profile: UserProfile | null
  ): Promise<UserProfile> {
    if (known_profile) return known_profile;
    try {
      return await api.getCurrentUser();
    } catch (profile_error) {
      if (profile_error instanceof AuthError) throw profile_error;
      // Offline start: fall back to the last profile seen on this device.
      const cached_profile_json = this.services.profile_storage.getItem(PROFILE_STORAGE_KEY);
      if (cached_profile_json) {
        try {
          const cached_profile = JSON.parse(cached_profile_json) as UserProfile;
          if (cached_profile.id === user_id) return cached_profile;
        } catch {
          // Unreadable cache: use the placeholder below.
        }
      }
      return { id: user_id, email: "", display_name: null, last_login_at: null };
    }
  }

  private async startSession(user_id: number, known_profile: UserProfile | null): Promise<void> {
    await this.closeSession();
    this.setState({ status: "checking" });

    let local_db: LocalDb;
    try {
      local_db = await this.openDatabase();
    } catch (open_error) {
      const message =
        open_error instanceof LocalDbBusyError
          ? "atoikuraは別のタブで開かれています。そちらのタブを閉じてから再読み込みしてください。"
          : `端末のデータを開けませんでした: ${errorMessage(open_error, "不明なエラー")}`;
      this.setState({ status: "unavailable", message });
      return;
    }

    let user_profile: UserProfile;
    try {
      user_profile = await this.loadProfile(user_id, known_profile);
    } catch {
      await local_db.close();
      await this.services.auth_session.logout();
      this.setState({ status: "anonymous", notice: "再度ログインしてください" });
      return;
    }
    this.services.profile_storage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(user_profile));

    const sync_client = createSyncClient({
      local_db,
      api_base_url: this.services.api_base_url,
      auth_session: this.services.auth_session,
      environment: this.services.sync_environment,
    });
    const unsubscribe_status = sync_client.engine.subscribe((sync_status) => {
      if (sync_status.phase === "auth_required") {
        void this.logout("ログインの有効期限が切れました。再度ログインしてください");
      }
    });
    this.session_teardown = async () => {
      unsubscribe_status();
      await sync_client.engine.shutdown();
    };
    await sync_client.engine.start(user_id);
    if (this.pending_recovery_rejections.length > 0) {
      await sync_client.store.recordRejections(this.pending_recovery_rejections);
      this.pending_recovery_rejections = [];
      await sync_client.engine.refreshStatus();
    }
    this.setState({ status: "ready", session: { user: user_profile, local_db, sync_client } });
  }
}
