// @vitest-environment node
// Runs the aggregations against the real SQLite WASM engine with the real client
// schema, so the ported SQL is exercised exactly as it will run on the device.
import sqlite3InitModule, { type Database, type Sqlite3Static } from "@sqlite.org/sqlite-wasm";
import { initializeDatabase } from "../db/bootstrap";
import { MIGRATIONS } from "../db/migrations";
import { wrapOo1Database } from "../db/oo1Adapter";
import type { SqlDatabase, SqlValue } from "../db/types";
import {
  computeLedgerSummary,
  listDailyVariableSums,
  listMemberAllowanceTotals,
  listMonthlyBreakdown,
  listOwnAllowanceSpending,
  listPostedRecurringIds,
  sumSpending,
} from "./queries";

const LEDGER_ID = "ledger-1";
const OTHER_LEDGER_ID = "ledger-2";
const MEMBER_A = 1;
const MEMBER_B = 2;
const FORMER_MEMBER = 3;

let sqlite3_module: Sqlite3Static;
let oo1_db: Database;
let test_db: SqlDatabase;
let next_row_number = 0;

function insertRow(table_name: string, column_values: Record<string, SqlValue>): void {
  next_row_number += 1;
  const row_values: Record<string, SqlValue> = {
    id: `${table_name}-${next_row_number}`,
    ledger_id: LEDGER_ID,
    owner_id: MEMBER_A,
    ...column_values,
  };
  const column_names = Object.keys(row_values);
  test_db.exec(
    `INSERT INTO ${table_name} (${column_names.join(", ")}) VALUES (${column_names.map(() => "?").join(", ")})`,
    Object.values(row_values)
  );
}

function insertJournalEntry(column_values: Record<string, SqlValue>): void {
  insertRow("journal_entries", { wallet: "ledger", is_excluded: 0, ...column_values });
}

beforeAll(async () => {
  sqlite3_module = await sqlite3InitModule();
});

beforeEach(() => {
  oo1_db = new sqlite3_module.oo1.DB(":memory:", "c");
  test_db = wrapOo1Database(oo1_db);
  initializeDatabase(test_db, MIGRATIONS, () => "test-device");

  for (const [member_id, left_at] of [
    [MEMBER_A, null],
    [MEMBER_B, null],
    [FORMER_MEMBER, "2026-09-30T00:00:00Z"],
  ] as const) {
    insertRow("ledger_members", {
      owner_id: member_id,
      user_id: member_id,
      role: "member",
      left_at,
    });
  }

  insertRow("category_groups", { id: "group-food", name: "食費", statement_type_code: "food" });
  insertRow("category_groups", { id: "group-other", name: "日用品", statement_type_code: "other" });
  insertRow("category_groups", { id: "group-fixed", name: "住居", statement_type_code: "fixed" });
  insertRow("expense_categories", { id: "cat-grocery", group_id: "group-food", name: "スーパー" });
  insertRow("expense_categories", {
    id: "cat-sundries",
    group_id: "group-other",
    name: "雑貨",
    deleted: 1,
  });
  insertRow("expense_categories", { id: "cat-rent", group_id: "group-fixed", name: "家賃" });

  // Shared ledger wallet
  insertJournalEntry({ transaction_date: "2026-10-01", amount: 1000, category_id: "cat-grocery" });
  insertJournalEntry({ transaction_date: "2026-10-01", amount: 500, category_id: "cat-sundries" });
  insertJournalEntry({
    transaction_date: "2026-10-05",
    amount: 300,
    category_id: "cat-grocery",
    is_excluded: 1,
  });
  insertJournalEntry({
    transaction_date: "2026-10-27",
    amount: 90000,
    category_id: "cat-rent",
    recurring_expense_id: "recurring-rent",
    recurring_year_month: "2026-10",
  });
  insertJournalEntry({
    transaction_date: "2026-10-12",
    amount: 700,
    category_id: "cat-grocery",
    deleted: 1,
  });
  insertJournalEntry({
    transaction_date: "2026-10-02",
    amount: 2000,
    category_id: "cat-grocery",
    owner_id: MEMBER_B,
  });
  insertJournalEntry({
    transaction_date: "2026-10-31",
    amount: 1200,
    category_id: "cat-rent",
    recurring_expense_id: "recurring-deleted",
    recurring_year_month: "2026-10",
    deleted: 1,
  });
  insertJournalEntry({ transaction_date: "2026-09-15", amount: 5000, category_id: "cat-grocery" });
  // Allowance wallets
  insertJournalEntry({
    transaction_date: "2026-10-03",
    amount: 1500,
    category_id: "cat-sundries",
    wallet: "allowance",
  });
  insertJournalEntry({
    transaction_date: "2026-10-03",
    amount: 4000,
    category_id: "cat-grocery",
    wallet: "allowance",
    owner_id: MEMBER_B,
  });
  // Another ledger
  insertJournalEntry({
    transaction_date: "2026-10-01",
    amount: 99999,
    category_id: "cat-grocery",
    ledger_id: OTHER_LEDGER_ID,
  });

  // Online-only settings (read cache)
  insertRow("base_incomes", { member_id: MEMBER_A, amount: 300000 });
  insertRow("base_incomes", { member_id: MEMBER_B, amount: 220000, owner_id: MEMBER_B });
  insertRow("recurring_expenses", {
    wallet: "ledger",
    name: "家賃",
    billing_day: 27,
    amount: 90000,
    type: "fixed",
    category_id: "cat-rent",
  });
  insertRow("recurring_expenses", {
    wallet: "allowance",
    name: "スマホ",
    billing_day: 1,
    amount: 3000,
    type: "fixed",
    category_id: "cat-sundries",
  });
  insertRow("recurring_expenses", {
    wallet: "ledger",
    name: "電気",
    billing_day: 10,
    amount: null,
    type: "variable",
    category_id: "cat-rent",
  });
  insertRow("savings_goals", { name: "旅行", monthly_amount: 50000 });
  insertRow("savings_goals", { name: "削除済み", monthly_amount: 9999, deleted: 1 });
  insertRow("surplus_allocations", {
    year_month: "2026-10",
    amount: 10000,
    destination: "savings",
    savings_goal_id: "goal",
  });
  insertRow("surplus_allocations", { year_month: "2026-10", amount: 5000, destination: "budget" });
  insertRow("surplus_allocations", {
    year_month: "2026-09",
    amount: 7000,
    destination: "savings",
    savings_goal_id: "goal",
  });
  insertRow("allowances", { member_id: MEMBER_A, effective_from: "2026-08", amount: 30000 });
  insertRow("allowances", { member_id: MEMBER_A, effective_from: "2026-10", amount: 40000 });
  insertRow("allowances", { member_id: MEMBER_B, effective_from: "2026-09", amount: 20000 });
  insertRow("allowances", { member_id: FORMER_MEMBER, effective_from: "2026-01", amount: 10000 });
  insertRow("income_records", {
    earner_id: MEMBER_A,
    transaction_date: "2026-10-25",
    amount: 300000,
    name: "給与",
    income_type: "salary",
  });
  insertRow("income_records", {
    earner_id: MEMBER_B,
    transaction_date: "2026-10-20",
    amount: 50000,
    name: "副業",
    income_type: "side",
  });
  insertRow("income_records", {
    earner_id: MEMBER_A,
    transaction_date: "2026-09-25",
    amount: 280000,
    name: "給与",
    income_type: "salary",
  });
  test_db.exec(
    "INSERT INTO allowance_totals (id, ledger_id, member_id, year_month, spent) VALUES (?, ?, ?, ?, ?)",
    [`${MEMBER_B}:2026-10`, LEDGER_ID, MEMBER_B, "2026-10", 4000]
  );
});

afterEach(() => {
  oo1_db.close();
});

describe("listDailyVariableSums", () => {
  it("sums non-excluded food/other entries of the shared ledger, including deleted categories", () => {
    expect(listDailyVariableSums(test_db, LEDGER_ID, { wallet: "ledger" }, "2026-10")).toEqual({
      "2026-10-01": { food: 1000, other: 500 },
      "2026-10-02": { food: 2000 },
    });
  });

  it("limits an allowance scope to its owner", () => {
    expect(
      listDailyVariableSums(
        test_db,
        LEDGER_ID,
        { wallet: "allowance", owner_id: MEMBER_A },
        "2026-10"
      )
    ).toEqual({
      "2026-10-03": { other: 1500 },
    });
  });
});

describe("listMonthlyBreakdown", () => {
  it("moves excluded entries to 対象外 and orders by statement type", () => {
    expect(listMonthlyBreakdown(test_db, LEDGER_ID, { wallet: "ledger" }, "2026-10")).toEqual([
      {
        category_id: "cat-grocery",
        category_name: "スーパー",
        group_id: "group-food",
        group_name: "食費",
        statement_type_code: "food",
        statement_type_name: "食費",
        total: 3000,
      },
      {
        category_id: "cat-sundries",
        category_name: "雑貨",
        group_id: "group-other",
        group_name: "日用品",
        statement_type_code: "other",
        statement_type_name: "その他",
        total: 500,
      },
      {
        category_id: "cat-rent",
        category_name: "家賃",
        group_id: "group-fixed",
        group_name: "住居",
        statement_type_code: "fixed",
        statement_type_name: "固定費",
        total: 90000,
      },
      {
        category_id: "cat-grocery",
        category_name: "スーパー",
        group_id: "group-food",
        group_name: "食費",
        statement_type_code: "excluded",
        statement_type_name: "対象外",
        total: 300,
      },
    ]);
  });
});

describe("sumSpending", () => {
  it("counts variable spending or all non-excluded spending", () => {
    expect(sumSpending(test_db, LEDGER_ID, { wallet: "ledger" }, "2026-10", true)).toBe(3500);
    expect(sumSpending(test_db, LEDGER_ID, { wallet: "ledger" }, "2026-10", false)).toBe(93500);
  });
});

describe("computeLedgerSummary", () => {
  it("computes the household budget, remaining amount and history from the local cache", () => {
    const ledger_summary = computeLedgerSummary(test_db, LEDGER_ID, "2026-10", "2026-10-27");
    expect(ledger_summary).toMatchObject({
      base_income_total: 520000,
      income_total: 350000,
      recurring_total: 90000,
      savings_total: 50000,
      disposable: 370000,
      allowance_total: 60000,
      shared_living_budget: 310000,
      variable_spending: 3500,
      remaining: 306500,
      daily_budget: 10000,
      days_remaining: 5,
      history: [
        { year_month: "2026-08", budget: 350000, actual: 0 },
        { year_month: "2026-09", budget: 323000, actual: 5000 },
        { year_month: "2026-10", budget: 310000, actual: 93500 },
      ],
    });
  });
});

describe("allowance spending", () => {
  it("reads the viewer's own allowance from local entries", () => {
    expect(listOwnAllowanceSpending(test_db, LEDGER_ID, MEMBER_A)).toEqual({ "2026-10": 1500 });
  });

  it("reads other members' allowance from the server-computed totals", () => {
    expect(listMemberAllowanceTotals(test_db, LEDGER_ID, MEMBER_B)).toEqual({ "2026-10": 4000 });
  });
});

describe("listPostedRecurringIds", () => {
  it("treats tombstoned postings as posted", () => {
    expect(listPostedRecurringIds(test_db, LEDGER_ID, "2026-10")).toEqual(
      new Set(["recurring-rent", "recurring-deleted"])
    );
  });
});
