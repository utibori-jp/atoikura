import type { SqlStatement } from "../db/protocol";
import type { SqlRow, SqlValue } from "../db/types";
import {
  DELETED_FIELD,
  isOfflineCollection,
  isOnlineOnlyCollection,
  OFFLINE_COLLECTIONS,
  offlineFieldKind,
  offlineFieldNames,
  ONLINE_ONLY_COLLECTIONS,
  toLocalValue,
  toWireValue,
  type OfflineCollectionName,
} from "./collections";
import { SyncNotReadyError } from "./errors";
import { HlcClock, hlcDevicePart } from "./hlc";
import { uuidv7 } from "./uuid";
import {
  MAX_CHANGES_PER_PUSH,
  MAX_PUSH_BODY_BYTES,
  type PullPage,
  type PulledRow,
  type PushChange,
  type PushResult,
} from "./wire";

// Device-side half of the sync protocol (docs/local-first/sync-protocol.md §5):
// local writes with their outbox, building pushes, and applying push results and
// pulled rows to SQLite.
//
// Every operation runs under one mutex and does its reads first, then commits
// all of its writes in a single atomic batch. A crash or a closed tab therefore
// never leaves a row without its outbox entry, or a pulled page applied without
// its cursor.
//
// Table and column names in SQL come only from the collection constants or from
// the local schema (PRAGMA table_info); every value is bound.

// The subset of LocalDb the store needs, so tests can run it on in-memory SQLite.
export interface SyncDb {
  select(sql: string, bind?: SqlValue[]): Promise<SqlRow[]>;
  batch(statements: SqlStatement[]): Promise<void>;
}

export interface SyncState {
  device_id: string;
  user_id: number | null;
  ledger_id: string | null;
  since: number;
  last_synced_at: string | null;
}

export interface SyncRejection {
  rejection_id: number;
  collection: string;
  record_id: string;
  reason: string;
  message: string;
  rejected_at: string;
}

export interface StoreChangeEvent {
  source: "local" | "remote";
  collections: string[];
}

interface SentField {
  hlc: string;
  value: SqlValue;
}

// A push request plus what was sent, to match the results against the outbox.
export interface PushBatch {
  changes: PushChange[];
  sent_fields_by_id: Map<string, Map<string, SentField>>;
}

export type BindUserOutcome = "unchanged" | "bound" | "reset";

const OUTBOX_UPSERT_SQL = `INSERT INTO _outbox (collection, record_id, field, hlc) VALUES (?, ?, ?, ?)
  ON CONFLICT (collection, record_id, field) DO UPDATE SET hlc = excluded.hlc`;
const SHADOW_UPSERT_SQL = `INSERT INTO _shadow (collection, record_id, field, value, hlc) VALUES (?, ?, ?, ?, ?)
  ON CONFLICT (collection, record_id, field) DO UPDATE SET value = excluded.value, hlc = excluded.hlc`;
const OUTBOX_DELETE_FIELD_SQL =
  "DELETE FROM _outbox WHERE collection = ? AND record_id = ? AND field = ?";
const SHADOW_DELETE_FIELD_SQL =
  "DELETE FROM _shadow WHERE collection = ? AND record_id = ? AND field = ?";
const OUTBOX_DELETE_RECORD_SQL = "DELETE FROM _outbox WHERE collection = ? AND record_id = ?";
const SHADOW_DELETE_RECORD_SQL = "DELETE FROM _shadow WHERE collection = ? AND record_id = ?";

// Envelope values of a pulled row come from the row itself, never from its data.
const PULLED_ENVELOPE_COLUMNS = new Set([
  "id",
  "ledger_id",
  "owner_id",
  "seq",
  "deleted",
  "field_hlc",
]);

// SQLite's default limit on bound parameters is far above this; it keeps IN lists short.
const IN_LIST_CHUNK_SIZE = 200;

const SYNCED_TABLES: string[] = [...ONLINE_ONLY_COLLECTIONS, ...Object.keys(OFFLINE_COLLECTIONS)];

class AsyncMutex {
  private queue_tail: Promise<void> = Promise.resolve();

  run<TResult>(task: () => Promise<TResult>): Promise<TResult> {
    const task_result = this.queue_tail.then(task);
    this.queue_tail = task_result.then(
      () => undefined,
      () => undefined
    );
    return task_result;
  }
}

function placeholders(value_count: number): string {
  return Array.from({ length: value_count }, () => "?").join(", ");
}

function chunked<TItem>(items: TItem[], chunk_size: number): TItem[][] {
  const item_chunks: TItem[][] = [];
  for (let chunk_start = 0; chunk_start < items.length; chunk_start += chunk_size) {
    item_chunks.push(items.slice(chunk_start, chunk_start + chunk_size));
  }
  return item_chunks;
}

function parseFieldHlc(field_hlc_json: SqlValue): Record<string, string> {
  if (typeof field_hlc_json !== "string") return {};
  try {
    const parsed_field_hlc: unknown = JSON.parse(field_hlc_json);
    return parsed_field_hlc && typeof parsed_field_hlc === "object"
      ? (parsed_field_hlc as Record<string, string>)
      : {};
  } catch {
    return {};
  }
}

function upsertStatement(
  table_name: string,
  column_values: Record<string, SqlValue>
): SqlStatement {
  const column_names = Object.keys(column_values);
  return {
    sql: `INSERT OR REPLACE INTO ${table_name} (${column_names.join(", ")}) VALUES (${placeholders(column_names.length)})`,
    bind: column_names.map((column_name) => column_values[column_name]),
  };
}

function requireOfflineCollection(collection_name: string): OfflineCollectionName {
  if (!isOfflineCollection(collection_name)) {
    throw new Error(`${collection_name} is not an offline-writable collection`);
  }
  return collection_name;
}

function requireKnownFields(
  collection_name: OfflineCollectionName,
  field_values: Record<string, SqlValue>
) {
  for (const field_name of Object.keys(field_values)) {
    if (offlineFieldKind(collection_name, field_name) === undefined) {
      throw new Error(`${collection_name}.${field_name} is not a writable field`);
    }
  }
}

export interface SyncStoreOptions {
  now?: () => number;
  createId?: () => string;
}

export class SyncStore {
  private readonly db: SyncDb;
  private readonly now: () => number;
  private readonly createId: () => string;
  private readonly mutex = new AsyncMutex();
  private readonly table_columns_cache = new Map<string, Set<string>>();
  private readonly change_listeners = new Set<(change_event: StoreChangeEvent) => void>();
  private hlc_clock: HlcClock | null = null;

  constructor(db: SyncDb, options: SyncStoreOptions = {}) {
    this.db = db;
    this.now = options.now ?? Date.now;
    this.createId = options.createId ?? (() => uuidv7(this.now));
  }

  subscribe(listener: (change_event: StoreChangeEvent) => void): () => void {
    this.change_listeners.add(listener);
    return () => this.change_listeners.delete(listener);
  }

  private emitChange(change_event: StoreChangeEvent): void {
    if (change_event.collections.length === 0) return;
    for (const listener of this.change_listeners) listener(change_event);
  }

  private nowIso(): string {
    return new Date(this.now()).toISOString();
  }

  // ---------------------------------------------------------------------------
  // Sync state

  readSyncState(): Promise<SyncState> {
    return this.mutex.run(() => this.loadSyncState());
  }

  private async loadSyncState(): Promise<SyncState> {
    const [state_row] = await this.db.select(
      "SELECT device_id, user_id, ledger_id, since, last_synced_at FROM _sync_state WHERE singleton_id = 1"
    );
    if (!state_row) throw new Error("_sync_state is missing; the database was not initialized");
    return {
      device_id: String(state_row.device_id),
      user_id: state_row.user_id === null ? null : Number(state_row.user_id),
      ledger_id: state_row.ledger_id === null ? null : String(state_row.ledger_id),
      since: Number(state_row.since),
      last_synced_at: state_row.last_synced_at === null ? null : String(state_row.last_synced_at),
    };
  }

  // Ties the database to the signed-in user. A database that holds another
  // user's data is wiped, pending changes included, because they can't be pushed
  // with this user's token.
  bindUser(user_id: number): Promise<BindUserOutcome> {
    return this.mutex.run(async () => {
      const sync_state = await this.loadSyncState();
      if (sync_state.user_id === user_id) return "unchanged";
      if (sync_state.user_id === null) {
        await this.db.batch([{ sql: "UPDATE _sync_state SET user_id = ?", bind: [user_id] }]);
        return "bound";
      }
      await this.db.batch([
        ...this.clearSyncedDataStatements(),
        { sql: "DELETE FROM _sync_rejections" },
        {
          sql: "UPDATE _sync_state SET user_id = ?, ledger_id = NULL, since = 0, last_synced_at = NULL",
          bind: [user_id],
        },
      ]);
      this.emitChange({ source: "remote", collections: SYNCED_TABLES });
      return "reset";
    });
  }

  // Starts over in another ledger (the user joined or left a household): the
  // cached rows belong to the old ledger, and pull restarts from 0. The engine
  // pushes the outbox before calling this; whatever is still pending was written
  // against the old ledger and is dropped.
  resetForLedger(ledger_id: string): Promise<void> {
    return this.mutex.run(async () => {
      await this.db.batch([
        ...this.clearSyncedDataStatements(),
        { sql: "UPDATE _sync_state SET ledger_id = ?, since = 0", bind: [ledger_id] },
      ]);
      this.emitChange({ source: "remote", collections: SYNCED_TABLES });
    });
  }

  private clearSyncedDataStatements(): SqlStatement[] {
    return [
      ...SYNCED_TABLES.map((table_name) => ({ sql: `DELETE FROM ${table_name}` })),
      { sql: "DELETE FROM _outbox" },
      { sql: "DELETE FROM _shadow" },
    ];
  }

  markSynced(): Promise<string> {
    return this.mutex.run(async () => {
      const synced_at = this.nowIso();
      await this.db.batch([
        { sql: "UPDATE _sync_state SET last_synced_at = ?", bind: [synced_at] },
      ]);
      return synced_at;
    });
  }

  // Number of records with changes not yet accepted by the server.
  countPendingRecords(): Promise<number> {
    return this.mutex.run(async () => {
      const [count_row] = await this.db.select(
        "SELECT COUNT(*) AS pending_count FROM (SELECT DISTINCT collection, record_id FROM _outbox)"
      );
      return Number(count_row?.pending_count ?? 0);
    });
  }

  listRejections(): Promise<SyncRejection[]> {
    return this.mutex.run(async () => {
      const rejection_rows = await this.db.select(
        "SELECT rejection_id, collection, record_id, reason, message, rejected_at FROM _sync_rejections ORDER BY rejection_id"
      );
      return rejection_rows.map((rejection_row) => ({
        rejection_id: Number(rejection_row.rejection_id),
        collection: String(rejection_row.collection),
        record_id: String(rejection_row.record_id),
        reason: String(rejection_row.reason),
        message: String(rejection_row.message),
        rejected_at: String(rejection_row.rejected_at),
      }));
    });
  }

  dismissRejections(rejection_ids: number[]): Promise<void> {
    return this.mutex.run(async () => {
      if (rejection_ids.length === 0) return;
      await this.db.batch(
        chunked(rejection_ids, IN_LIST_CHUNK_SIZE).map((id_chunk) => ({
          sql: `DELETE FROM _sync_rejections WHERE rejection_id IN (${placeholders(id_chunk.length)})`,
          bind: id_chunk,
        }))
      );
    });
  }

  // ---------------------------------------------------------------------------
  // Local writes (offline-writable collections only)

  private async getClock(): Promise<HlcClock> {
    if (this.hlc_clock) return this.hlc_clock;
    const sync_state = await this.loadSyncState();
    const hlc_clock = new HlcClock(hlcDevicePart(sync_state.device_id), this.now);
    // The wall clock may have gone backwards since the last write; never issue an
    // HLC below one that is still pending.
    const [max_hlc_row] = await this.db.select("SELECT MAX(hlc) AS max_hlc FROM _outbox");
    if (typeof max_hlc_row?.max_hlc === "string") hlc_clock.observe(max_hlc_row.max_hlc);
    this.hlc_clock = hlc_clock;
    return hlc_clock;
  }

  // Creates a record owned by the signed-in user in the current ledger and
  // returns its ID. Values use the SQLite representation (booleans as 0/1).
  createRecord(collection_name: string, field_values: Record<string, SqlValue>): Promise<string> {
    const offline_collection = requireOfflineCollection(collection_name);
    requireKnownFields(offline_collection, field_values);
    return this.mutex.run(async () => {
      const sync_state = await this.loadSyncState();
      if (sync_state.user_id === null || sync_state.ledger_id === null) {
        throw new SyncNotReadyError();
      }
      const write_hlc = (await this.getClock()).tick();
      const record_id = this.createId();
      const written_at = this.nowIso();
      const field_names = Object.keys(field_values);
      const field_hlc: Record<string, string> = {};
      for (const field_name of field_names) field_hlc[field_name] = write_hlc;

      await this.db.batch([
        upsertStatement(offline_collection, {
          ...field_values,
          id: record_id,
          ledger_id: sync_state.ledger_id,
          owner_id: sync_state.user_id,
          seq: null,
          deleted: 0,
          created_at: written_at,
          updated_at: written_at,
          field_hlc: JSON.stringify(field_hlc),
        }),
        ...field_names.map((field_name) => ({
          sql: OUTBOX_UPSERT_SQL,
          bind: [offline_collection, record_id, field_name, write_hlc],
        })),
      ]);
      this.emitChange({ source: "local", collections: [offline_collection] });
      return record_id;
    });
  }

  // Changes fields of a live record. Unchanged values are skipped.
  updateRecord(
    collection_name: string,
    record_id: string,
    changed_values: Record<string, SqlValue>
  ): Promise<void> {
    const offline_collection = requireOfflineCollection(collection_name);
    requireKnownFields(offline_collection, changed_values);
    return this.mutex.run(async () => {
      const [record_row] = await this.db.select(
        `SELECT * FROM ${offline_collection} WHERE id = ? AND deleted = 0`,
        [record_id]
      );
      if (!record_row) throw new Error(`${offline_collection} ${record_id} not found`);

      const changed_field_names = Object.keys(changed_values).filter(
        (field_name) => changed_values[field_name] !== record_row[field_name]
      );
      if (changed_field_names.length === 0) return;
      const immutable_fields: string[] = OFFLINE_COLLECTIONS[offline_collection].immutable;
      const immutable_change = changed_field_names.find((field_name) =>
        immutable_fields.includes(field_name)
      );
      if (immutable_change)
        throw new Error(`${offline_collection}.${immutable_change} can't change`);

      const pending_fields = await this.loadPendingFields(offline_collection, record_id);
      const write_hlc = (await this.getClock()).tick();
      const record_field_hlc = parseFieldHlc(record_row.field_hlc);
      const write_statements: SqlStatement[] = [];
      for (const field_name of changed_field_names) {
        // The first pending change of a server-known field remembers the confirmed
        // value, so a rejection can restore it.
        if (record_row.seq !== null && !pending_fields.has(field_name)) {
          write_statements.push({
            sql: SHADOW_UPSERT_SQL,
            bind: [
              offline_collection,
              record_id,
              field_name,
              record_row[field_name],
              record_field_hlc[field_name] ?? null,
            ],
          });
        }
        record_field_hlc[field_name] = write_hlc;
        write_statements.push({
          sql: OUTBOX_UPSERT_SQL,
          bind: [offline_collection, record_id, field_name, write_hlc],
        });
      }
      write_statements.push({
        sql: `UPDATE ${offline_collection} SET ${changed_field_names
          .map((field_name) => `${field_name} = ?`)
          .join(", ")}, field_hlc = ?, updated_at = ? WHERE id = ?`,
        bind: [
          ...changed_field_names.map((field_name) => changed_values[field_name]),
          JSON.stringify(record_field_hlc),
          this.nowIso(),
          record_id,
        ],
      });
      await this.db.batch(write_statements);
      this.emitChange({ source: "local", collections: [offline_collection] });
    });
  }

  // Deletes a record. The tombstone wins over every concurrent field edit.
  deleteRecord(collection_name: string, record_id: string): Promise<void> {
    const offline_collection = requireOfflineCollection(collection_name);
    return this.mutex.run(async () => {
      const [record_row] = await this.db.select(
        `SELECT id FROM ${offline_collection} WHERE id = ? AND deleted = 0`,
        [record_id]
      );
      if (!record_row) return;
      const write_hlc = (await this.getClock()).tick();
      const deleted_at = this.nowIso();
      await this.db.batch([
        {
          sql: `UPDATE ${offline_collection} SET deleted = 1, deleted_at = ?, updated_at = ? WHERE id = ?`,
          bind: [deleted_at, deleted_at, record_id],
        },
        { sql: OUTBOX_UPSERT_SQL, bind: [offline_collection, record_id, DELETED_FIELD, write_hlc] },
      ]);
      this.emitChange({ source: "local", collections: [offline_collection] });
    });
  }

  private async loadPendingFields(
    collection_name: string,
    record_id: string
  ): Promise<Map<string, string>> {
    const outbox_rows = await this.db.select(
      "SELECT field, hlc FROM _outbox WHERE collection = ? AND record_id = ?",
      [collection_name, record_id]
    );
    return new Map(
      outbox_rows.map((outbox_row) => [String(outbox_row.field), String(outbox_row.hlc)])
    );
  }

  // ---------------------------------------------------------------------------
  // Push

  // Builds the next push request from the outbox, or returns null when nothing
  // is pending. Values are read from the record, so each field is sent with its
  // latest value and the HLC of its latest pending change.
  buildPushBatch(): Promise<PushBatch | null> {
    return this.mutex.run(async () => {
      const outbox_rows = await this.db.select(
        "SELECT collection, record_id, field, hlc FROM _outbox ORDER BY collection, record_id, field"
      );
      const pending_by_record = new Map<
        string,
        { collection: string; record_id: string; hlc_by_field: Map<string, string> }
      >();
      for (const outbox_row of outbox_rows) {
        const collection_name = String(outbox_row.collection);
        const record_id = String(outbox_row.record_id);
        const record_key = `${collection_name}/${record_id}`;
        let pending_record = pending_by_record.get(record_key);
        if (!pending_record) {
          pending_record = { collection: collection_name, record_id, hlc_by_field: new Map() };
          pending_by_record.set(record_key, pending_record);
        }
        pending_record.hlc_by_field.set(String(outbox_row.field), String(outbox_row.hlc));
      }

      const push_batch: PushBatch = { changes: [], sent_fields_by_id: new Map() };
      const orphan_statements: SqlStatement[] = [];
      const text_encoder = new TextEncoder();
      let batch_bytes = 0;
      for (const pending_record of pending_by_record.values()) {
        if (push_batch.changes.length >= MAX_CHANGES_PER_PUSH) break;
        if (!isOfflineCollection(pending_record.collection)) {
          orphan_statements.push({
            sql: OUTBOX_DELETE_RECORD_SQL,
            bind: [pending_record.collection, pending_record.record_id],
          });
          continue;
        }
        const offline_collection = pending_record.collection;
        const [record_row] = await this.db.select(
          `SELECT * FROM ${offline_collection} WHERE id = ?`,
          [pending_record.record_id]
        );
        if (!record_row) {
          orphan_statements.push({
            sql: OUTBOX_DELETE_RECORD_SQL,
            bind: [offline_collection, pending_record.record_id],
          });
          continue;
        }

        const push_change: PushChange = {
          collection: offline_collection,
          id: pending_record.record_id,
          fields: {},
        };
        const sent_fields = new Map<string, SentField>();
        for (const [field_name, field_hlc] of pending_record.hlc_by_field) {
          if (field_name === DELETED_FIELD) {
            push_change.deleted_hlc = field_hlc;
            sent_fields.set(field_name, { hlc: field_hlc, value: null });
            continue;
          }
          const field_kind = offlineFieldKind(offline_collection, field_name);
          if (field_kind === undefined) {
            orphan_statements.push({
              sql: OUTBOX_DELETE_FIELD_SQL,
              bind: [offline_collection, pending_record.record_id, field_name],
            });
            continue;
          }
          push_change.fields[field_name] = {
            value: toWireValue(field_kind, record_row[field_name]),
            hlc: field_hlc,
          };
          sent_fields.set(field_name, { hlc: field_hlc, value: record_row[field_name] });
        }
        if (sent_fields.size === 0) continue;

        const change_bytes = text_encoder.encode(JSON.stringify(push_change)).length + 1;
        if (push_batch.changes.length > 0 && batch_bytes + change_bytes > MAX_PUSH_BODY_BYTES)
          break;
        batch_bytes += change_bytes;
        push_batch.changes.push(push_change);
        push_batch.sent_fields_by_id.set(push_change.id, sent_fields);
      }
      if (orphan_statements.length > 0) await this.db.batch(orphan_statements);
      return push_batch.changes.length > 0 ? push_batch : null;
    });
  }

  // Applies the server's per-change results. An outbox entry is dropped only if
  // it still holds the HLC that was sent: a field edited again while the request
  // was in flight stays pending and goes out with the next push.
  applyPushResults(push_batch: PushBatch, push_results: PushResult[]): Promise<void> {
    return this.mutex.run(async () => {
      const changes_by_id = new Map(
        push_batch.changes.map((push_change) => [push_change.id, push_change])
      );
      const result_statements: SqlStatement[] = [];
      const touched_collections = new Set<string>();
      const rejected_at = this.nowIso();

      for (const push_result of push_results) {
        const push_change = changes_by_id.get(push_result.id);
        const sent_fields = push_batch.sent_fields_by_id.get(push_result.id);
        if (!push_change || !sent_fields || !isOfflineCollection(push_change.collection)) continue;
        changes_by_id.delete(push_result.id);
        const offline_collection = push_change.collection;
        const record_id = push_change.id;
        const pending_fields = await this.loadPendingFields(offline_collection, record_id);
        const [record_row] = await this.db.select(
          `SELECT * FROM ${offline_collection} WHERE id = ?`,
          [record_id]
        );
        const unchanged_sent_fields = [...sent_fields].filter(
          ([field_name, sent_field]) => pending_fields.get(field_name) === sent_field.hlc
        );
        touched_collections.add(offline_collection);

        if (push_result.status === "applied") {
          const superseded_fields = new Set(push_result.superseded ?? []);
          for (const [field_name, sent_field] of sent_fields) {
            if (pending_fields.get(field_name) === sent_field.hlc) {
              result_statements.push(
                { sql: OUTBOX_DELETE_FIELD_SQL, bind: [offline_collection, record_id, field_name] },
                { sql: SHADOW_DELETE_FIELD_SQL, bind: [offline_collection, record_id, field_name] }
              );
            } else if (
              pending_fields.has(field_name) &&
              field_name !== DELETED_FIELD &&
              !superseded_fields.has(field_name)
            ) {
              // Edited again in flight: the server now holds the sent value.
              result_statements.push({
                sql: SHADOW_UPSERT_SQL,
                bind: [offline_collection, record_id, field_name, sent_field.value, sent_field.hlc],
              });
            }
          }
          if (!record_row) continue;

          if (push_result.merged_into && push_result.merged_into !== record_id) {
            result_statements.push(
              ...(await this.rekeyMergedRecord(offline_collection, record_id, push_result))
            );
            continue;
          }
          const never_stored =
            record_row.seq === null &&
            push_result.seq === undefined &&
            sent_fields.has(DELETED_FIELD);
          if (never_stored) {
            // Created and deleted before the server ever saw it: nothing to keep.
            result_statements.push(...this.dropRecordStatements(offline_collection, record_id));
            continue;
          }
          // seq marks the record as known to the server; its real value arrives by pull.
          result_statements.push({
            sql: `UPDATE ${offline_collection} SET seq = COALESCE(seq, ?) WHERE id = ?`,
            bind: [push_result.seq ?? 0, record_id],
          });
          continue;
        }

        // Rejected: record it for the user and roll the change back.
        result_statements.push({
          sql: `INSERT INTO _sync_rejections (collection, record_id, reason, message, rejected_at)
                VALUES (?, ?, ?, ?, ?)`,
          bind: [
            offline_collection,
            record_id,
            push_result.reason ?? "UNKNOWN",
            push_result.message ?? "サーバーに保存できませんでした",
            rejected_at,
          ],
        });
        if (!record_row) {
          for (const [field_name] of unchanged_sent_fields) {
            result_statements.push({
              sql: OUTBOX_DELETE_FIELD_SQL,
              bind: [offline_collection, record_id, field_name],
            });
          }
          continue;
        }
        if (record_row.seq === null) {
          // The server never accepted this record: remove it.
          result_statements.push(...this.dropRecordStatements(offline_collection, record_id));
          continue;
        }
        result_statements.push(
          ...(await this.revertFieldsStatements(
            offline_collection,
            record_row,
            unchanged_sent_fields.map(([field_name]) => field_name)
          ))
        );
      }

      if (result_statements.length > 0) await this.db.batch(result_statements);
      this.emitChange({ source: "remote", collections: [...touched_collections] });
    });
  }

  private dropRecordStatements(collection_name: string, record_id: string): SqlStatement[] {
    return [
      { sql: `DELETE FROM ${collection_name} WHERE id = ?`, bind: [record_id] },
      { sql: OUTBOX_DELETE_RECORD_SQL, bind: [collection_name, record_id] },
      { sql: SHADOW_DELETE_RECORD_SQL, bind: [collection_name, record_id] },
    ];
  }

  // Restores rejected fields of a server-known record to their last confirmed
  // values and drops their outbox entries.
  private async revertFieldsStatements(
    collection_name: OfflineCollectionName,
    record_row: SqlRow,
    reverted_field_names: string[]
  ): Promise<SqlStatement[]> {
    const record_id = String(record_row.id);
    const shadow_rows = await this.db.select(
      "SELECT field, value, hlc FROM _shadow WHERE collection = ? AND record_id = ?",
      [collection_name, record_id]
    );
    const shadow_by_field = new Map(
      shadow_rows.map((shadow_row) => [String(shadow_row.field), shadow_row])
    );
    const record_field_hlc = parseFieldHlc(record_row.field_hlc);
    const restored_values: Record<string, SqlValue> = {};
    for (const field_name of reverted_field_names) {
      if (field_name === DELETED_FIELD) {
        restored_values.deleted = 0;
        restored_values.deleted_at = null;
        continue;
      }
      const shadow_row = shadow_by_field.get(field_name);
      if (!shadow_row) continue;
      restored_values[field_name] = shadow_row.value;
      if (shadow_row.hlc === null) delete record_field_hlc[field_name];
      else record_field_hlc[field_name] = String(shadow_row.hlc);
    }

    const revert_statements: SqlStatement[] = [];
    const restored_columns = Object.keys(restored_values);
    if (restored_columns.length > 0) {
      revert_statements.push({
        sql: `UPDATE ${collection_name} SET ${restored_columns
          .map((column_name) => `${column_name} = ?`)
          .join(", ")}, field_hlc = ? WHERE id = ?`,
        bind: [
          ...restored_columns.map((column_name) => restored_values[column_name]),
          JSON.stringify(record_field_hlc),
          record_id,
        ],
      });
    }
    for (const field_name of reverted_field_names) {
      revert_statements.push(
        { sql: OUTBOX_DELETE_FIELD_SQL, bind: [collection_name, record_id, field_name] },
        { sql: SHADOW_DELETE_FIELD_SQL, bind: [collection_name, record_id, field_name] }
      );
    }
    return revert_statements;
  }

  // The server folded this note into an existing one with the same natural key
  // (sync-protocol.md §3.2). The local record takes the existing ID, so later
  // edits and the merged text from pull land on the same row. If that row is
  // already here, the local duplicate is dropped instead.
  private async rekeyMergedRecord(
    collection_name: OfflineCollectionName,
    record_id: string,
    push_result: PushResult
  ): Promise<SqlStatement[]> {
    const merged_into = push_result.merged_into as string;
    const [existing_row] = await this.db.select(`SELECT id FROM ${collection_name} WHERE id = ?`, [
      merged_into,
    ]);
    if (existing_row) return this.dropRecordStatements(collection_name, record_id);
    return [
      {
        sql: `UPDATE ${collection_name} SET id = ?, seq = COALESCE(seq, ?) WHERE id = ?`,
        bind: [merged_into, push_result.seq ?? 0, record_id],
      },
      {
        sql: "UPDATE _outbox SET record_id = ? WHERE collection = ? AND record_id = ?",
        bind: [merged_into, collection_name, record_id],
      },
      {
        sql: "UPDATE _shadow SET record_id = ? WHERE collection = ? AND record_id = ?",
        bind: [merged_into, collection_name, record_id],
      },
    ];
  }

  // ---------------------------------------------------------------------------
  // Pull

  // Applies one pull page and advances the cursor in the same transaction. If
  // the page is for another ledger than the one stored, nothing is applied and
  // the caller resets (resetForLedger) and pulls again from 0.
  applyPullPage(pull_page: PullPage): Promise<{ ledger_changed: boolean }> {
    return this.mutex.run(async () => {
      const sync_state = await this.loadSyncState();
      if (sync_state.ledger_id !== null && sync_state.ledger_id !== pull_page.ledger_id) {
        return { ledger_changed: true };
      }
      const page_statements = await this.mergePulledRows(pull_page.ledger_id, pull_page.rows);
      page_statements.push({
        sql: "UPDATE _sync_state SET ledger_id = ?, since = ?",
        bind: [pull_page.ledger_id, Math.max(sync_state.since, pull_page.next_since)],
      });
      await this.db.batch(page_statements);
      this.observePulledHlcs(pull_page.rows);
      this.emitChange({
        source: "remote",
        collections: [...new Set(pull_page.rows.map((pulled_row) => pulled_row.collection))],
      });
      return { ledger_changed: false };
    });
  }

  // Applies the row a ledger command returned, so the screen reflects the edit
  // before the next pull. The cursor doesn't move: rows between it and this one
  // haven't been pulled yet.
  applyCommandRow(pulled_row: PulledRow): Promise<void> {
    return this.mutex.run(async () => {
      const sync_state = await this.loadSyncState();
      if (sync_state.ledger_id === null) return;
      const row_statements = await this.mergePulledRows(sync_state.ledger_id, [pulled_row]);
      await this.db.batch(row_statements);
      this.observePulledHlcs([pulled_row]);
      this.emitChange({ source: "remote", collections: [pulled_row.collection] });
    });
  }

  private observePulledHlcs(pulled_rows: PulledRow[]): void {
    if (!this.hlc_clock) return;
    for (const pulled_row of pulled_rows) {
      for (const remote_hlc of Object.values(pulled_row.field_hlc ?? {})) {
        this.hlc_clock.observe(remote_hlc);
      }
    }
  }

  private async tableColumns(table_name: string): Promise<Set<string>> {
    const cached_columns = this.table_columns_cache.get(table_name);
    if (cached_columns) return cached_columns;
    const column_rows = await this.db.select(`PRAGMA table_info(${table_name})`);
    const column_names = new Set(column_rows.map((column_row) => String(column_row.name)));
    this.table_columns_cache.set(table_name, column_names);
    return column_names;
  }

  // The local row a pulled row becomes, before any merge with local changes.
  private async pulledRowValues(
    ledger_id: string,
    pulled_row: PulledRow
  ): Promise<Record<string, SqlValue>> {
    const table_columns = await this.tableColumns(pulled_row.collection);
    const row_values: Record<string, SqlValue> = {};
    for (const [column_name, wire_value] of Object.entries(pulled_row.data)) {
      if (PULLED_ENVELOPE_COLUMNS.has(column_name) || !table_columns.has(column_name)) continue;
      row_values[column_name] = toLocalValue(wire_value);
    }
    const envelope_values: Record<string, SqlValue> = {
      id: pulled_row.id,
      ledger_id,
      owner_id: pulled_row.owner_id,
      seq: pulled_row.seq,
      deleted: pulled_row.deleted ? 1 : 0,
      field_hlc: JSON.stringify(pulled_row.field_hlc ?? {}),
    };
    for (const [column_name, envelope_value] of Object.entries(envelope_values)) {
      if (table_columns.has(column_name)) row_values[column_name] = envelope_value;
    }
    return row_values;
  }

  private async mergePulledRows(
    ledger_id: string,
    pulled_rows: PulledRow[]
  ): Promise<SqlStatement[]> {
    const merge_statements: SqlStatement[] = [];
    const offline_rows_by_collection = new Map<OfflineCollectionName, PulledRow[]>();
    for (const pulled_row of pulled_rows) {
      if (isOfflineCollection(pulled_row.collection)) {
        const collection_rows = offline_rows_by_collection.get(pulled_row.collection) ?? [];
        collection_rows.push(pulled_row);
        offline_rows_by_collection.set(pulled_row.collection, collection_rows);
        continue;
      }
      // Unknown collections (a newer server) are skipped rather than failing the page.
      if (!isOnlineOnlyCollection(pulled_row.collection)) continue;
      const row_values = await this.pulledRowValues(ledger_id, pulled_row);
      if (pulled_row.deleted && !("deleted" in row_values)) {
        merge_statements.push({
          sql: `DELETE FROM ${pulled_row.collection} WHERE id = ?`,
          bind: [pulled_row.id],
        });
      } else {
        merge_statements.push(upsertStatement(pulled_row.collection, row_values));
      }
    }
    for (const [offline_collection, collection_rows] of offline_rows_by_collection) {
      merge_statements.push(
        ...(await this.mergeOfflineRows(ledger_id, offline_collection, collection_rows))
      );
    }
    return merge_statements;
  }

  // Field-level LWW against pending local changes: a field keeps its local value
  // only while it has a pending change with a higher HLC than the server's.
  private async mergeOfflineRows(
    ledger_id: string,
    collection_name: OfflineCollectionName,
    pulled_rows: PulledRow[]
  ): Promise<SqlStatement[]> {
    const record_ids = pulled_rows.map((pulled_row) => pulled_row.id);
    const local_rows_by_id = new Map<string, SqlRow>();
    const pending_by_id = new Map<string, Map<string, string>>();
    for (const id_chunk of chunked(record_ids, IN_LIST_CHUNK_SIZE)) {
      const local_rows = await this.db.select(
        `SELECT * FROM ${collection_name} WHERE id IN (${placeholders(id_chunk.length)})`,
        id_chunk
      );
      for (const local_row of local_rows) local_rows_by_id.set(String(local_row.id), local_row);
      const outbox_rows = await this.db.select(
        `SELECT record_id, field, hlc FROM _outbox WHERE collection = ? AND record_id IN (${placeholders(id_chunk.length)})`,
        [collection_name, ...id_chunk]
      );
      for (const outbox_row of outbox_rows) {
        const record_id = String(outbox_row.record_id);
        const pending_fields = pending_by_id.get(record_id) ?? new Map<string, string>();
        pending_fields.set(String(outbox_row.field), String(outbox_row.hlc));
        pending_by_id.set(record_id, pending_fields);
      }
    }

    const merge_statements: SqlStatement[] = [];
    for (const pulled_row of pulled_rows) {
      const remote_values = await this.pulledRowValues(ledger_id, pulled_row);
      const local_row = local_rows_by_id.get(pulled_row.id);
      const pending_fields = pending_by_id.get(pulled_row.id);

      if (pulled_row.deleted || !local_row || !pending_fields) {
        // Tombstones win over local edits; without local edits the server's row is current.
        merge_statements.push(upsertStatement(collection_name, remote_values));
        if (pending_fields) {
          merge_statements.push(
            { sql: OUTBOX_DELETE_RECORD_SQL, bind: [collection_name, pulled_row.id] },
            { sql: SHADOW_DELETE_RECORD_SQL, bind: [collection_name, pulled_row.id] }
          );
        }
        continue;
      }

      const remote_field_hlc = pulled_row.field_hlc ?? {};
      const local_field_hlc = parseFieldHlc(local_row.field_hlc);
      const merged_values = { ...remote_values };
      const merged_field_hlc: Record<string, string> = { ...remote_field_hlc };
      for (const field_name of offlineFieldNames(collection_name)) {
        const pending_hlc = pending_fields.get(field_name);
        if (pending_hlc === undefined) continue;
        const remote_hlc = remote_field_hlc[field_name] ?? "";
        if (pending_hlc > remote_hlc) {
          merged_values[field_name] = local_row[field_name];
          merged_field_hlc[field_name] = local_field_hlc[field_name] ?? pending_hlc;
          // The pulled value is now the last confirmed one to revert to.
          merge_statements.push({
            sql: SHADOW_UPSERT_SQL,
            bind: [
              collection_name,
              pulled_row.id,
              field_name,
              remote_values[field_name] ?? null,
              remote_hlc === "" ? null : remote_hlc,
            ],
          });
        } else {
          merge_statements.push(
            { sql: OUTBOX_DELETE_FIELD_SQL, bind: [collection_name, pulled_row.id, field_name] },
            { sql: SHADOW_DELETE_FIELD_SQL, bind: [collection_name, pulled_row.id, field_name] }
          );
        }
      }
      if (pending_fields.has(DELETED_FIELD)) {
        merged_values.deleted = 1;
        merged_values.deleted_at = local_row.deleted_at;
      }
      merged_values.field_hlc = JSON.stringify(merged_field_hlc);
      merge_statements.push(upsertStatement(collection_name, merged_values));
    }
    return merge_statements;
  }
}
