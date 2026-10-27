/// <reference lib="webworker" />
// Dedicated worker that owns the on-device SQLite database.
//
// Storage uses the "opfs-sahpool" VFS: it persists to the Origin Private File System
// without SharedArrayBuffer, so no COOP/COEP headers are needed (nginx, Vite dev and
// the GitHub Pages demo stay unchanged), and it works on Safari 16.4+. Its trade-off
// is a single connection per origin, which client.ts enforces with a Web Lock.
import sqlite3InitModule, { type Database } from "@sqlite.org/sqlite-wasm";
import { initializeDatabase } from "./bootstrap";
import { getSchemaVersion } from "./migrate";
import { MIGRATIONS } from "./migrations";
import { handleDbRequest } from "./handleRequest";
import { wrapOo1Database } from "./oo1Adapter";
import type { DbRequest, DbWorkerEvent } from "./protocol";

const DATABASE_PATH = "/atoikura.sqlite3";
const VFS_DIRECTORY = "/atoikura-sahpool";

const worker_scope = self as unknown as DedicatedWorkerGlobalScope;

function postEvent(worker_event: DbWorkerEvent): void {
  worker_scope.postMessage(worker_event);
}

async function openDatabase(): Promise<Database | null> {
  const sqlite3_module = await sqlite3InitModule();
  let sahpool_util;
  try {
    sahpool_util = await sqlite3_module.installOpfsSAHPoolVfs({ directory: VFS_DIRECTORY });
  } catch (caught_error) {
    // Never fall back to a transient in-memory DB: offline writes would be lost
    // silently on reload. Report and let the UI decide.
    postEvent({
      kind: "init_error",
      error_code: "OPFS_UNAVAILABLE",
      error_message: caught_error instanceof Error ? caught_error.message : String(caught_error),
    });
    return null;
  }
  return new sahpool_util.OpfsSAHPoolDb(DATABASE_PATH);
}

async function start(): Promise<void> {
  let oo1_db: Database | null;
  try {
    oo1_db = await openDatabase();
  } catch (caught_error) {
    postEvent({
      kind: "init_error",
      error_code: "OPEN_FAILED",
      error_message: caught_error instanceof Error ? caught_error.message : String(caught_error),
    });
    return;
  }
  if (!oo1_db) return;

  const local_db = wrapOo1Database(oo1_db);
  try {
    initializeDatabase(local_db, MIGRATIONS, () => crypto.randomUUID());
  } catch (caught_error) {
    oo1_db.close();
    postEvent({
      kind: "init_error",
      error_code: "OPEN_FAILED",
      error_message: caught_error instanceof Error ? caught_error.message : String(caught_error),
    });
    return;
  }

  const opened_db = oo1_db;
  worker_scope.onmessage = (message_event: MessageEvent<DbRequest>) => {
    const db_request = message_event.data;
    if (db_request.kind === "close") {
      opened_db.close();
      worker_scope.postMessage({ request_id: db_request.request_id, ok: true, rows: [] });
      worker_scope.close();
      return;
    }
    worker_scope.postMessage(handleDbRequest(local_db, db_request));
  };
  postEvent({ kind: "ready", schema_version: getSchemaVersion(local_db) });
}

void start();
