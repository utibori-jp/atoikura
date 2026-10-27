// Shared types for the on-device SQLite database (local-first Step 2, #199).
// See docs/local-first/design.md for the data model these tables implement.

export type SqlValue = string | number | null;

export type SqlRow = Record<string, SqlValue>;

// Minimal synchronous SQL surface used by the migration runner. It is implemented
// by the SQLite WASM oo1 API both inside the OPFS worker and in Node-based tests,
// so schema code never depends on where the database actually lives.
export interface SqlDatabase {
  exec(sql: string, bind?: SqlValue[]): void;
  selectRows(sql: string, bind?: SqlValue[]): SqlRow[];
  transaction<TResult>(callback: () => TResult): TResult;
}

export interface Migration {
  // Target PRAGMA user_version after this migration. Versions start at 1 and
  // must be strictly increasing by 1.
  version: number;
  description: string;
  statements: string[];
}
