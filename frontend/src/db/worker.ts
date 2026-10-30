/// <reference lib="webworker" />
// Dedicated worker that owns the on-device SQLite database.
//
// Storage uses the "opfs-sahpool" VFS: it persists to the Origin Private File System
// without SharedArrayBuffer, so no COOP/COEP headers are needed (nginx, Vite dev and
// the GitHub Pages demo stay unchanged), and it works on Safari 16.4+. Its trade-off
// is a single connection per origin, which client.ts enforces with a Web Lock.
import sqlite3InitModule, { type Database, type SAHPoolUtil } from "@sqlite.org/sqlite-wasm";
import { initializeDatabase } from "./bootstrap";
import { getSchemaVersion, SchemaVersionError } from "./migrate";
import { MIGRATIONS } from "./migrations";
import { handleDbRequest } from "./handleRequest";
import { wrapOo1Database } from "./oo1Adapter";
import type { DbRequest, DbResponse, DbWorkerEvent } from "./protocol";

const DATABASE_PATH = "/atoikura.sqlite3";
const VFS_DIRECTORY = "/atoikura-sahpool";

const worker_scope = self as unknown as DedicatedWorkerGlobalScope;

function postEvent(worker_event: DbWorkerEvent): void {
  worker_scope.postMessage(worker_event);
}

function errorMessage(caught_error: unknown): string {
  return caught_error instanceof Error ? caught_error.message : String(caught_error);
}

async function installVfs(): Promise<SAHPoolUtil | null> {
  const sqlite3_module = await sqlite3InitModule();
  try {
    return await sqlite3_module.installOpfsSAHPoolVfs({ directory: VFS_DIRECTORY });
  } catch (caught_error) {
    // Never fall back to a transient in-memory DB: offline writes would be lost
    // silently on reload. Report and let the UI decide.
    postEvent({
      kind: "init_error",
      error_code: "OPFS_UNAVAILABLE",
      error_message: errorMessage(caught_error),
      recoverable: false,
    });
    return null;
  }
}

// Creates a fresh database at the latest schema in place of the current file.
function recreateDatabase(sahpool_util: SAHPoolUtil, current_db: Database): Database {
  current_db.close();
  sahpool_util.unlink(DATABASE_PATH);
  const fresh_db = new sahpool_util.OpfsSAHPoolDb(DATABASE_PATH);
  initializeDatabase(wrapOo1Database(fresh_db), MIGRATIONS, () => crypto.randomUUID());
  return fresh_db;
}

async function start(): Promise<void> {
  let sahpool_util: SAHPoolUtil | null;
  let opened_db: Database;
  try {
    sahpool_util = await installVfs();
    if (!sahpool_util) return;
    opened_db = new sahpool_util.OpfsSAHPoolDb(DATABASE_PATH);
  } catch (caught_error) {
    postEvent({
      kind: "init_error",
      error_code: "OPEN_FAILED",
      error_message: errorMessage(caught_error),
      recoverable: false,
    });
    return;
  }
  const vfs_util = sahpool_util;

  let init_error: DbWorkerEvent | null = null;
  try {
    initializeDatabase(wrapOo1Database(opened_db), MIGRATIONS, () => crypto.randomUUID());
  } catch (caught_error) {
    // A failed migration is rolled back, so the old database is still consistent.
    // It stays open so the app can push its pending changes, then ask to recreate.
    init_error = {
      kind: "init_error",
      error_code:
        caught_error instanceof SchemaVersionError ? "SCHEMA_TOO_NEW" : "MIGRATION_FAILED",
      error_message: errorMessage(caught_error),
      recoverable: true,
    };
  }

  worker_scope.onmessage = async (message_event: MessageEvent<DbRequest>) => {
    const db_request = message_event.data;
    if (db_request.kind === "destroy") {
      let destroy_response: DbResponse;
      try {
        opened_db.close();
        // Clearing a pool file truncates it, so the data doesn't linger in OPFS.
        await vfs_util.wipeFiles();
        destroy_response = { request_id: db_request.request_id, ok: true, rows: [] };
      } catch (caught_error) {
        destroy_response = {
          request_id: db_request.request_id,
          ok: false,
          error_name: caught_error instanceof Error ? caught_error.name : "Error",
          error_message: errorMessage(caught_error),
        };
      }
      worker_scope.postMessage(destroy_response);
      worker_scope.close();
      return;
    }
    if (db_request.kind === "close") {
      opened_db.close();
      worker_scope.postMessage({ request_id: db_request.request_id, ok: true, rows: [] });
      worker_scope.close();
      return;
    }
    if (db_request.kind === "recreate") {
      let recreate_response: DbResponse;
      try {
        opened_db = recreateDatabase(vfs_util, opened_db);
        recreate_response = {
          request_id: db_request.request_id,
          ok: true,
          rows: [{ schema_version: getSchemaVersion(wrapOo1Database(opened_db)) }],
        };
      } catch (caught_error) {
        recreate_response = {
          request_id: db_request.request_id,
          ok: false,
          error_name: caught_error instanceof Error ? caught_error.name : "Error",
          error_message: errorMessage(caught_error),
        };
      }
      worker_scope.postMessage(recreate_response);
      return;
    }
    worker_scope.postMessage(handleDbRequest(wrapOo1Database(opened_db), db_request));
  };

  postEvent(
    init_error ?? { kind: "ready", schema_version: getSchemaVersion(wrapOo1Database(opened_db)) }
  );
}

void start();
