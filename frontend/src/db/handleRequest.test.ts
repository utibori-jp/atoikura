// @vitest-environment node
import sqlite3InitModule, { type Database, type Sqlite3Static } from "@sqlite.org/sqlite-wasm";
import { handleDbRequest } from "./handleRequest";
import { runMigrations } from "./migrate";
import { MIGRATIONS } from "./migrations";
import { wrapOo1Database } from "./oo1Adapter";
import type { SqlDatabase } from "./types";

let sqlite3_module: Sqlite3Static;
let oo1_db: Database;
let test_db: SqlDatabase;

beforeAll(async () => {
  sqlite3_module = await sqlite3InitModule();
});

beforeEach(() => {
  oo1_db = new sqlite3_module.oo1.DB(":memory:", "c");
  test_db = wrapOo1Database(oo1_db);
  runMigrations(test_db, MIGRATIONS);
});

afterEach(() => {
  oo1_db.close();
});

const INSERT_NOTE_SQL =
  "INSERT INTO daily_notes (id, ledger_id, owner_id, date, note) VALUES (?, 'l1', 1, ?, ?)";

describe("handleDbRequest", () => {
  it("executes with bound parameters and selects rows", () => {
    const exec_response = handleDbRequest(test_db, {
      request_id: 1,
      kind: "exec",
      statement: { sql: INSERT_NOTE_SQL, bind: ["n1", "2026-10-01", "memo"] },
    });
    const select_response = handleDbRequest(test_db, {
      request_id: 2,
      kind: "select",
      statement: { sql: "SELECT id, note FROM daily_notes WHERE date = ?", bind: ["2026-10-01"] },
    });

    expect(exec_response).toEqual({ request_id: 1, ok: true, rows: [] });
    expect(select_response).toEqual({
      request_id: 2,
      ok: true,
      rows: [{ id: "n1", note: "memo" }],
    });
  });

  it("rolls back the whole batch when one statement fails", () => {
    const batch_response = handleDbRequest(test_db, {
      request_id: 3,
      kind: "batch",
      statements: [
        { sql: INSERT_NOTE_SQL, bind: ["n1", "2026-10-01", "first"] },
        { sql: INSERT_NOTE_SQL, bind: ["n1", "2026-10-02", "duplicate primary key"] },
      ],
    });

    expect(batch_response).toMatchObject({ request_id: 3, ok: false });
    expect(test_db.selectRows("SELECT COUNT(*) AS note_count FROM daily_notes")).toEqual([
      { note_count: 0 },
    ]);
  });

  it("returns SQL errors as a failed response instead of throwing", () => {
    const select_response = handleDbRequest(test_db, {
      request_id: 4,
      kind: "select",
      statement: { sql: "SELECT * FROM missing_table" },
    });

    expect(select_response).toMatchObject({ request_id: 4, ok: false });
  });
});
