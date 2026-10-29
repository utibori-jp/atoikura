// Test helper: a SyncDb backed by the real SQLite WASM engine with an in-memory
// database, migrated with the app's schema. Only for tests in a node environment.
import sqlite3InitModule, { type Sqlite3Static } from "@sqlite.org/sqlite-wasm";
import { initializeDatabase } from "../../db/bootstrap";
import { MIGRATIONS } from "../../db/migrations";
import { wrapOo1Database } from "../../db/oo1Adapter";
import type { SqlDatabase } from "../../db/types";
import type { SyncDb } from "../store";

let sqlite3_module_promise: Promise<Sqlite3Static> | null = null;

export interface MemorySyncDb extends SyncDb {
  raw_db: SqlDatabase;
  close(): void;
}

export async function openMemorySyncDb(device_id: string): Promise<MemorySyncDb> {
  sqlite3_module_promise ??= sqlite3InitModule();
  const sqlite3_module = await sqlite3_module_promise;
  const oo1_db = new sqlite3_module.oo1.DB(":memory:", "c");
  const raw_db = wrapOo1Database(oo1_db);
  initializeDatabase(raw_db, MIGRATIONS, () => device_id);
  return {
    raw_db,
    select: async (sql, bind) => raw_db.selectRows(sql, bind),
    batch: async (statements) => {
      raw_db.transaction(() => {
        for (const statement of statements) raw_db.exec(statement.sql, statement.bind);
      });
    },
    close: () => oo1_db.close(),
  };
}
