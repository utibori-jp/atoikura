// Test helper: a LocalDb backed by the real SQLite WASM engine with an in-memory
// database, migrated with the app's schema. It runs requests through the same
// handler as the worker, so tests exercise the production request path. Works
// in both the node and jsdom test environments.
import sqlite3InitModule, { type Sqlite3Static } from "@sqlite.org/sqlite-wasm";
import { initializeDatabase } from "../../db/bootstrap";
import type { LocalDb } from "../../db/client";
import { handleDbRequest } from "../../db/handleRequest";
import { getSchemaVersion } from "../../db/migrate";
import { MIGRATIONS } from "../../db/migrations";
import { wrapOo1Database } from "../../db/oo1Adapter";
import type { DbRequest, DbResponse } from "../../db/protocol";
import type { SqlDatabase } from "../../db/types";

let sqlite3_module_promise: Promise<Sqlite3Static> | null = null;

export interface MemorySyncDb extends LocalDb {
  raw_db: SqlDatabase;
}

type DbRequestBody =
  Exclude<DbRequest, { kind: "close" | "recreate" | "destroy" }> extends infer TRequest
    ? TRequest extends { request_id: number }
      ? Omit<TRequest, "request_id">
      : never
    : never;

export async function openMemorySyncDb(device_id: string): Promise<MemorySyncDb> {
  sqlite3_module_promise ??= sqlite3InitModule();
  const sqlite3_module = await sqlite3_module_promise;
  const oo1_db = new sqlite3_module.oo1.DB(":memory:", "c");
  const raw_db = wrapOo1Database(oo1_db);
  initializeDatabase(raw_db, MIGRATIONS, () => device_id);

  let next_request_id = 1;
  const sendRequest = async (request_body: DbRequestBody) => {
    const db_response: DbResponse = handleDbRequest(raw_db, {
      ...request_body,
      request_id: next_request_id++,
    } as Exclude<DbRequest, { kind: "close" | "recreate" | "destroy" }>);
    if (!db_response.ok) {
      const sql_error = new Error(db_response.error_message);
      sql_error.name = db_response.error_name;
      throw sql_error;
    }
    return db_response;
  };

  return {
    raw_db,
    schema_version: getSchemaVersion(raw_db),
    storage_persistence: "persisted",
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
    close: async () => oo1_db.close(),
    // An in-memory database is gone once closed.
    destroy: async () => oo1_db.close(),
  };
}
