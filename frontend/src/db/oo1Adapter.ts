import type { Database } from "@sqlite.org/sqlite-wasm";
import type { SqlDatabase, SqlRow, SqlValue } from "./types";

// Adapts a SQLite WASM oo1 Database (OPFS-backed in the worker, in-memory in tests)
// to the SqlDatabase surface used by the schema code.
export function wrapOo1Database(oo1_db: Database): SqlDatabase {
  return {
    exec(sql: string, bind?: SqlValue[]): void {
      oo1_db.exec(sql, { bind: bind ?? [] });
    },
    selectRows(sql: string, bind?: SqlValue[]): SqlRow[] {
      return oo1_db.selectObjects(sql, bind) as SqlRow[];
    },
    transaction<TResult>(callback: () => TResult): TResult {
      return oo1_db.transaction(() => callback());
    },
  };
}
