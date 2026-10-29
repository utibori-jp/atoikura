// @vitest-environment node
// Runs against the real SQLite WASM engine (Node build, in-memory DB) so the
// schema SQL is exercised exactly as it will run in the browser worker.
import sqlite3InitModule, { type Database, type Sqlite3Static } from "@sqlite.org/sqlite-wasm";
import { initializeDatabase } from "./bootstrap";
import { getSchemaVersion, runMigrations, SchemaVersionError } from "./migrate";
import { MIGRATIONS } from "./migrations";
import { wrapOo1Database } from "./oo1Adapter";
import type { Migration, SqlDatabase } from "./types";

let sqlite3_module: Sqlite3Static;
let oo1_db: Database;
let test_db: SqlDatabase;

beforeAll(async () => {
  sqlite3_module = await sqlite3InitModule();
});

beforeEach(() => {
  oo1_db = new sqlite3_module.oo1.DB(":memory:", "c");
  test_db = wrapOo1Database(oo1_db);
});

afterEach(() => {
  oo1_db.close();
});

function listTableNames(db: SqlDatabase): string[] {
  return db
    .selectRows("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .map((table_row) => String(table_row.name));
}

const EXPECTED_TABLES = [
  "_outbox",
  "_shadow",
  "_sync_rejections",
  "_sync_state",
  "allowance_totals",
  "allowances",
  "base_incomes",
  "budgets",
  "category_groups",
  "daily_notes",
  "expense_categories",
  "income_records",
  "journal_entries",
  "ledger_members",
  "ledgers",
  "monthly_review_notes",
  "recurring_expenses",
  "savings_goals",
  "savings_postings",
  "surplus_allocations",
];

describe("runMigrations", () => {
  it("creates the full schema on an empty database", () => {
    const applied_versions = runMigrations(test_db, MIGRATIONS);

    expect(applied_versions).toEqual([1, 2]);
    expect(getSchemaVersion(test_db)).toBe(MIGRATIONS.length);
    expect(listTableNames(test_db)).toEqual(EXPECTED_TABLES);
  });

  it("is a no-op when re-run on an up-to-date database", () => {
    runMigrations(test_db, MIGRATIONS);
    test_db.exec(
      "INSERT INTO daily_notes (id, ledger_id, owner_id, date, note) VALUES ('n1', 'l1', 1, '2026-10-01', 'memo')"
    );

    const reapplied_versions = runMigrations(test_db, MIGRATIONS);

    expect(reapplied_versions).toEqual([]);
    expect(getSchemaVersion(test_db)).toBe(MIGRATIONS.length);
    expect(test_db.selectRows("SELECT note FROM daily_notes")).toEqual([{ note: "memo" }]);
  });

  it("upgrades from the previous version and keeps existing data", () => {
    const upgrade_migrations: Migration[] = [
      ...MIGRATIONS,
      {
        version: MIGRATIONS.length + 1,
        description: "test-only follow-up migration",
        statements: ["ALTER TABLE journal_entries ADD COLUMN test_tag TEXT"],
      },
    ];
    runMigrations(test_db, MIGRATIONS);
    test_db.exec(
      `INSERT INTO journal_entries (id, ledger_id, owner_id, wallet, transaction_date, amount, category_id)
       VALUES ('j1', 'l1', 1, 'ledger', '2026-10-01', 1200, 'c1')`
    );

    const applied_versions = runMigrations(test_db, upgrade_migrations);

    expect(applied_versions).toEqual([MIGRATIONS.length + 1]);
    expect(getSchemaVersion(test_db)).toBe(MIGRATIONS.length + 1);
    expect(
      test_db.selectRows("SELECT id, amount, test_tag, field_hlc FROM journal_entries")
    ).toEqual([{ id: "j1", amount: 1200, test_tag: null, field_hlc: "{}" }]);
  });

  it("rolls back a failing migration and leaves the version unchanged", () => {
    const broken_migrations: Migration[] = [
      ...MIGRATIONS,
      {
        version: MIGRATIONS.length + 1,
        description: "test-only broken migration",
        statements: ["CREATE TABLE half_applied (id TEXT)", "THIS IS NOT SQL"],
      },
    ];
    runMigrations(test_db, MIGRATIONS);

    expect(() => runMigrations(test_db, broken_migrations)).toThrow();
    expect(getSchemaVersion(test_db)).toBe(MIGRATIONS.length);
    expect(listTableNames(test_db)).not.toContain("half_applied");
  });

  it("refuses to run against a database newer than the app", () => {
    test_db.exec(`PRAGMA user_version = ${MIGRATIONS.length + 1}`);

    expect(() => runMigrations(test_db, MIGRATIONS)).toThrow(SchemaVersionError);
  });

  it("rejects a migration list with gaps", () => {
    const gapped_migrations: Migration[] = [{ version: 2, description: "gap", statements: [] }];

    expect(() => runMigrations(test_db, gapped_migrations)).toThrow(SchemaVersionError);
  });

  it("enforces the wallet constraint on journal entries", () => {
    runMigrations(test_db, MIGRATIONS);

    expect(() =>
      test_db.exec(
        `INSERT INTO journal_entries (id, ledger_id, owner_id, wallet, transaction_date, amount, category_id)
         VALUES ('j1', 'l1', 1, 'pocket', '2026-10-01', 1200, 'c1')`
      )
    ).toThrow();
  });
});

describe("initializeDatabase", () => {
  it("creates the sync-state row once and keeps the device ID across restarts", () => {
    initializeDatabase(test_db, MIGRATIONS, () => "device-first");
    initializeDatabase(test_db, MIGRATIONS, () => "device-second");

    expect(
      test_db.selectRows("SELECT singleton_id, device_id, ledger_id, since FROM _sync_state")
    ).toEqual([{ singleton_id: 1, device_id: "device-first", ledger_id: null, since: 0 }]);
  });
});
