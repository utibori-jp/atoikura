import { requestPersistentStorage, type StoragePersistence } from "./persistence";
import type {
  DbInitErrorCode,
  DbRequest,
  DbResponse,
  DbWorkerEvent,
  SqlStatement,
} from "./protocol";
import type { SqlRow, SqlValue } from "./types";

// Main-thread handle to the on-device database. Screens are wired to it in Step 4a.

const DB_LOCK_NAME = "atoikura-local-db";

export class LocalDbBusyError extends Error {
  constructor() {
    super("ローカルデータベースは別のタブで使用中です");
    this.name = "LocalDbBusyError";
  }
}

export class LocalDbInitError extends Error {
  readonly error_code: DbInitErrorCode;
  constructor(error_code: DbInitErrorCode, message: string) {
    super(message);
    this.name = "LocalDbInitError";
    this.error_code = error_code;
  }
}

export interface LocalDb {
  readonly schema_version: number;
  readonly storage_persistence: StoragePersistence;
  select(sql: string, bind?: SqlValue[]): Promise<SqlRow[]>;
  exec(sql: string, bind?: SqlValue[]): Promise<void>;
  // Runs every statement in one transaction.
  batch(statements: SqlStatement[]): Promise<void>;
  close(): Promise<void>;
}

type DbRequestBody = DbRequest extends infer RequestVariant
  ? RequestVariant extends { request_id: number }
    ? Omit<RequestVariant, "request_id">
    : never
  : never;

// The opfs-sahpool VFS allows one open instance per origin, so a second tab must not
// open the DB. An exclusive Web Lock is held for as long as this tab keeps it open.
async function acquireDbLock(): Promise<() => void> {
  if (!navigator.locks) return () => {};
  return new Promise((resolve_lock, reject_lock) => {
    void navigator.locks.request(DB_LOCK_NAME, { ifAvailable: true }, (granted_lock) => {
      if (!granted_lock) {
        reject_lock(new LocalDbBusyError());
        return undefined;
      }
      return new Promise<void>((release_lock) => resolve_lock(release_lock));
    });
  });
}

function waitForWorkerReady(db_worker: Worker): Promise<number> {
  return new Promise((resolve_ready, reject_ready) => {
    const onInitEvent = (message_event: MessageEvent<DbWorkerEvent | DbResponse>) => {
      const worker_event = message_event.data;
      if (!("kind" in worker_event)) return;
      db_worker.removeEventListener("message", onInitEvent);
      if (worker_event.kind === "ready") {
        resolve_ready(worker_event.schema_version);
      } else {
        reject_ready(new LocalDbInitError(worker_event.error_code, worker_event.error_message));
      }
    };
    db_worker.addEventListener("message", onInitEvent);
    db_worker.addEventListener("error", (error_event) => {
      reject_ready(new LocalDbInitError("OPEN_FAILED", error_event.message));
    });
  });
}

export async function openLocalDb(): Promise<LocalDb> {
  const storage_persistence = await requestPersistentStorage();
  const releaseDbLock = await acquireDbLock();

  const db_worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  let schema_version: number;
  try {
    schema_version = await waitForWorkerReady(db_worker);
  } catch (init_error) {
    db_worker.terminate();
    releaseDbLock();
    throw init_error;
  }

  let next_request_id = 1;
  const pending_requests = new Map<
    number,
    { resolve: (rows: SqlRow[]) => void; reject: (error: Error) => void }
  >();
  db_worker.addEventListener(
    "message",
    (message_event: MessageEvent<DbResponse | DbWorkerEvent>) => {
      const db_response = message_event.data;
      if (!("request_id" in db_response)) return;
      const pending_request = pending_requests.get(db_response.request_id);
      if (!pending_request) return;
      pending_requests.delete(db_response.request_id);
      if (db_response.ok) {
        pending_request.resolve(db_response.rows);
      } else {
        const sql_error = new Error(db_response.error_message);
        sql_error.name = db_response.error_name;
        pending_request.reject(sql_error);
      }
    }
  );

  const sendRequest = (request_body: DbRequestBody): Promise<SqlRow[]> =>
    new Promise((resolve_rows, reject_rows) => {
      const request_id = next_request_id++;
      pending_requests.set(request_id, { resolve: resolve_rows, reject: reject_rows });
      db_worker.postMessage({ ...request_body, request_id } as DbRequest);
    });

  return {
    schema_version,
    storage_persistence,
    select: (sql, bind) => sendRequest({ kind: "select", statement: { sql, bind } }),
    exec: async (sql, bind) => {
      await sendRequest({ kind: "exec", statement: { sql, bind } });
    },
    batch: async (statements) => {
      await sendRequest({ kind: "batch", statements });
    },
    close: async () => {
      try {
        await sendRequest({ kind: "close" });
      } finally {
        releaseDbLock();
      }
    },
  };
}
