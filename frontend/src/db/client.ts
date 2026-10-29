import { requestPersistentStorage, type StoragePersistence } from "./persistence";
import type {
  DbInitErrorCode,
  DbRequest,
  DbResponse,
  DbWorkerEvent,
  SqlStatement,
} from "./protocol";
import type { LocalQueryArgs, LocalQueryName, LocalQueryResult } from "./localQueries";
import type { SqlRow, SqlValue } from "./types";

type DbSuccess = Extract<DbResponse, { ok: true }>;

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
  // Set when the old database is still readable (a migration failed or the
  // database is newer than the app): push its pending changes, then recreate it.
  readonly recovery: RecoverableLocalDb | null;
  constructor(
    error_code: DbInitErrorCode,
    message: string,
    recovery: RecoverableLocalDb | null = null
  ) {
    super(message);
    this.name = "LocalDbInitError";
    this.error_code = error_code;
    this.recovery = recovery;
  }
}

export interface LocalDb {
  readonly schema_version: number;
  readonly storage_persistence: StoragePersistence;
  select(sql: string, bind?: SqlValue[]): Promise<SqlRow[]>;
  exec(sql: string, bind?: SqlValue[]): Promise<void>;
  // Runs every statement in one transaction.
  batch(statements: SqlStatement[]): Promise<void>;
  // Runs a registered read query in the worker (localQueries.ts).
  query<TName extends LocalQueryName>(
    query_name: TName,
    ...query_args: LocalQueryArgs<TName>
  ): Promise<LocalQueryResult<TName>>;
  close(): Promise<void>;
}

// The old database of a failed open, kept only to read pending changes before
// it is replaced. recreate() deletes it and opens a fresh one at the latest schema.
export interface RecoverableLocalDb {
  select(sql: string, bind?: SqlValue[]): Promise<SqlRow[]>;
  batch(statements: SqlStatement[]): Promise<void>;
  recreate(): Promise<LocalDb>;
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

function waitForWorkerEvent(db_worker: Worker): Promise<DbWorkerEvent> {
  return new Promise((resolve_event, reject_event) => {
    const onInitEvent = (message_event: MessageEvent<DbWorkerEvent | DbResponse>) => {
      const worker_event = message_event.data;
      if (!("kind" in worker_event)) return;
      db_worker.removeEventListener("message", onInitEvent);
      resolve_event(worker_event);
    };
    db_worker.addEventListener("message", onInitEvent);
    db_worker.addEventListener("error", (error_event) => {
      reject_event(new LocalDbInitError("OPEN_FAILED", error_event.message));
    });
  });
}

// Correlates worker requests with their responses.
function createRequestChannel(
  db_worker: Worker
): (request_body: DbRequestBody) => Promise<DbSuccess> {
  let next_request_id = 1;
  const pending_requests = new Map<
    number,
    { resolve: (db_success: DbSuccess) => void; reject: (error: Error) => void }
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
        pending_request.resolve(db_response);
      } else {
        const sql_error = new Error(db_response.error_message);
        sql_error.name = db_response.error_name;
        pending_request.reject(sql_error);
      }
    }
  );
  return (request_body) =>
    new Promise((resolve_success, reject_request) => {
      const request_id = next_request_id++;
      pending_requests.set(request_id, { resolve: resolve_success, reject: reject_request });
      db_worker.postMessage({ ...request_body, request_id } as DbRequest);
    });
}

export async function openLocalDb(): Promise<LocalDb> {
  const storage_persistence = await requestPersistentStorage();
  const releaseDbLock = await acquireDbLock();

  const db_worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  let init_event: DbWorkerEvent;
  try {
    init_event = await waitForWorkerEvent(db_worker);
  } catch (init_error) {
    db_worker.terminate();
    releaseDbLock();
    throw init_error;
  }

  const sendRequest = createRequestChannel(db_worker);
  const closeDb = async () => {
    try {
      await sendRequest({ kind: "close" });
    } finally {
      releaseDbLock();
    }
  };
  const createLocalDb = (schema_version: number): LocalDb => ({
    schema_version,
    storage_persistence,
    select: async (sql, bind) =>
      (await sendRequest({ kind: "select", statement: { sql, bind } })).rows,
    exec: async (sql, bind) => {
      await sendRequest({ kind: "exec", statement: { sql, bind } });
    },
    batch: async (statements) => {
      await sendRequest({ kind: "batch", statements });
    },
    query: async (query_name, ...query_args) =>
      (await sendRequest({ kind: "query", query_name, query_args })).result as never,
    close: closeDb,
  });

  if (init_event.kind === "ready") return createLocalDb(init_event.schema_version);
  if (!init_event.recoverable) {
    db_worker.terminate();
    releaseDbLock();
    throw new LocalDbInitError(init_event.error_code, init_event.error_message);
  }
  const recoverable_db: RecoverableLocalDb = {
    select: async (sql, bind) =>
      (await sendRequest({ kind: "select", statement: { sql, bind } })).rows,
    batch: async (statements) => {
      await sendRequest({ kind: "batch", statements });
    },
    recreate: async () => {
      const [recreated_row] = (await sendRequest({ kind: "recreate" })).rows;
      return createLocalDb(Number(recreated_row?.schema_version));
    },
    close: closeDb,
  };
  throw new LocalDbInitError(init_event.error_code, init_event.error_message, recoverable_db);
}
