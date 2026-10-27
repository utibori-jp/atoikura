import type { SqlDatabase } from "../db/types";
import {
  allowanceInEffect,
  computeLedgerBudget,
  dailyBudget,
  daysRemaining,
  type AllowanceHistoryEntry,
  type LedgerBudget,
  type LedgerBudgetInput,
} from "./budget";
import { addMonths } from "./calendar";
import type { DailySums } from "./forecast";
import { STATEMENT_TYPES, type StatementTypeCode } from "./statementTypes";

// Aggregations over the on-device SQLite database. They port the server's SQL
// (backend/queries/expenses.sql, budget_summary.sql) to the local schema
// (frontend/src/db/migrations.ts): categories are joined by UUID, statement types
// by type_code, and tombstoned journal entries are skipped. Tombstoned categories
// are still joined, because past entries may reference them.

// Whose spending to aggregate. The shared ledger wallet is everyone's in a household
// (and everything in personal mode); an allowance wallet belongs to one member.
export type SpendingScope = { wallet: "ledger" } | { wallet: "allowance"; owner_id: number };

function monthBounds(year_month: string): [string, string] {
  return [`${year_month}-01`, `${addMonths(year_month, 1)}-01`];
}

function scopeFilter(spending_scope: SpendingScope): { sql: string; bind: (string | number)[] } {
  if (spending_scope.wallet === "ledger") {
    return { sql: "je.wallet = 'ledger'", bind: [] };
  }
  return { sql: "je.wallet = 'allowance' AND je.owner_id = ?", bind: [spending_scope.owner_id] };
}

function sumAsNumber(raw_value: unknown): number {
  return raw_value === null || raw_value === undefined ? 0 : Number(raw_value);
}

// Per-day food/other subtotals of non-excluded entries (ListDailyExpenseSumsForMonth).
export function listDailyVariableSums(
  sql_db: SqlDatabase,
  ledger_id: string,
  spending_scope: SpendingScope,
  year_month: string
): DailySums {
  const [month_start, next_month_start] = monthBounds(year_month);
  const scope_filter = scopeFilter(spending_scope);
  const sum_rows = sql_db.selectRows(
    `SELECT je.transaction_date AS date, cg.statement_type_code AS type_code, SUM(je.amount) AS daily_sum
     FROM journal_entries je
     JOIN expense_categories ec ON ec.id = je.category_id
     JOIN category_groups cg ON cg.id = ec.group_id
     WHERE je.ledger_id = ? AND je.deleted = 0 AND je.is_excluded = 0
       AND cg.statement_type_code IN ('food', 'other')
       AND je.transaction_date >= ? AND je.transaction_date < ?
       AND ${scope_filter.sql}
     GROUP BY je.transaction_date, cg.statement_type_code`,
    [ledger_id, month_start, next_month_start, ...scope_filter.bind]
  );
  const daily_sums: DailySums = {};
  for (const sum_row of sum_rows) {
    const date_text = String(sum_row.date);
    const type_code = sum_row.type_code as "food" | "other";
    daily_sums[date_text] = {
      ...daily_sums[date_text],
      [type_code]: sumAsNumber(sum_row.daily_sum),
    };
  }
  return daily_sums;
}

export interface BreakdownRow {
  category_id: string;
  category_name: string;
  group_id: string;
  group_name: string;
  // Excluded entries are reported under "excluded", keeping their original group.
  statement_type_code: StatementTypeCode;
  statement_type_name: string;
  total: number;
}

const STATEMENT_TYPE_BY_CODE = new Map(
  STATEMENT_TYPES.map((statement_type) => [statement_type.type_code, statement_type])
);

// Per-category totals of every entry in the month (ListMonthlyBreakdown), with
// is_excluded entries moved to the "excluded" statement type.
export function listMonthlyBreakdown(
  sql_db: SqlDatabase,
  ledger_id: string,
  spending_scope: SpendingScope,
  year_month: string
): BreakdownRow[] {
  const [month_start, next_month_start] = monthBounds(year_month);
  const scope_filter = scopeFilter(spending_scope);
  const breakdown_rows = sql_db.selectRows(
    `SELECT je.category_id AS category_id, ec.name AS category_name,
            cg.id AS group_id, cg.name AS group_name,
            CASE WHEN je.is_excluded = 1 THEN 'excluded' ELSE cg.statement_type_code END AS statement_type_code,
            SUM(je.amount) AS total
     FROM journal_entries je
     JOIN expense_categories ec ON ec.id = je.category_id
     JOIN category_groups cg ON cg.id = ec.group_id
     WHERE je.ledger_id = ? AND je.deleted = 0
       AND je.transaction_date >= ? AND je.transaction_date < ?
       AND ${scope_filter.sql}
     GROUP BY je.category_id, ec.name, cg.id, cg.name,
              CASE WHEN je.is_excluded = 1 THEN 'excluded' ELSE cg.statement_type_code END`,
    [ledger_id, month_start, next_month_start, ...scope_filter.bind]
  );
  return breakdown_rows
    .map((breakdown_row) => {
      const statement_type_code = breakdown_row.statement_type_code as StatementTypeCode;
      return {
        category_id: String(breakdown_row.category_id),
        category_name: String(breakdown_row.category_name),
        group_id: String(breakdown_row.group_id),
        group_name: String(breakdown_row.group_name),
        statement_type_code,
        statement_type_name:
          STATEMENT_TYPE_BY_CODE.get(statement_type_code)?.statement_type_name ??
          statement_type_code,
        total: sumAsNumber(breakdown_row.total),
      };
    })
    .sort(
      (left_row, right_row) =>
        (STATEMENT_TYPE_BY_CODE.get(left_row.statement_type_code)?.display_order ?? 99) -
          (STATEMENT_TYPE_BY_CODE.get(right_row.statement_type_code)?.display_order ?? 99) ||
        left_row.group_id.localeCompare(right_row.group_id) ||
        left_row.category_id.localeCompare(right_row.category_id)
    );
}

// Sum of non-excluded spending in the month. variable_only limits it to food/other
// (what "あといくら" counts); otherwise every statement type counts
// (SumActualSpendByMonth, used for the budget history).
export function sumSpending(
  sql_db: SqlDatabase,
  ledger_id: string,
  spending_scope: SpendingScope,
  year_month: string,
  variable_only: boolean
): number {
  const [month_start, next_month_start] = monthBounds(year_month);
  const scope_filter = scopeFilter(spending_scope);
  const [sum_row] = sql_db.selectRows(
    `SELECT SUM(je.amount) AS total
     FROM journal_entries je
     JOIN expense_categories ec ON ec.id = je.category_id
     JOIN category_groups cg ON cg.id = ec.group_id
     WHERE je.ledger_id = ? AND je.deleted = 0 AND je.is_excluded = 0
       AND je.transaction_date >= ? AND je.transaction_date < ?
       AND (? = 0 OR cg.statement_type_code IN ('food', 'other'))
       AND ${scope_filter.sql}`,
    [ledger_id, month_start, next_month_start, variable_only ? 1 : 0, ...scope_filter.bind]
  );
  return sumAsNumber(sum_row?.total);
}

function selectTotal(sql_db: SqlDatabase, sql: string, bind: (string | number)[]): number {
  const [sum_row] = sql_db.selectRows(sql, bind);
  return sumAsNumber(sum_row?.total);
}

// Allowance history of every current member, keyed by member user ID.
export function listAllowanceHistories(
  sql_db: SqlDatabase,
  ledger_id: string
): Map<number, AllowanceHistoryEntry[]> {
  const allowance_rows = sql_db.selectRows(
    `SELECT a.member_id AS member_id, a.effective_from AS effective_from, a.amount AS amount
     FROM allowances a
     JOIN ledger_members lm ON lm.ledger_id = a.ledger_id AND lm.user_id = a.member_id
     WHERE a.ledger_id = ? AND a.deleted = 0 AND lm.deleted = 0 AND lm.left_at IS NULL`,
    [ledger_id]
  );
  const histories_by_member = new Map<number, AllowanceHistoryEntry[]>();
  for (const allowance_row of allowance_rows) {
    const member_id = Number(allowance_row.member_id);
    const member_history = histories_by_member.get(member_id) ?? [];
    member_history.push({
      effective_from: String(allowance_row.effective_from),
      amount: Number(allowance_row.amount),
    });
    histories_by_member.set(member_id, member_history);
  }
  return histories_by_member;
}

// Inputs of the ledger budget formula for one month, read from the local cache.
export function loadLedgerBudgetInput(
  sql_db: SqlDatabase,
  ledger_id: string,
  year_month: string
): LedgerBudgetInput {
  const base_incomes = sql_db
    .selectRows("SELECT amount FROM base_incomes WHERE ledger_id = ? AND deleted = 0", [ledger_id])
    .map((income_row) => Number(income_row.amount));
  const ledger_recurring_fixed_total = selectTotal(
    sql_db,
    `SELECT SUM(amount) AS total FROM recurring_expenses
     WHERE ledger_id = ? AND deleted = 0 AND type = 'fixed' AND amount IS NOT NULL AND wallet = 'ledger'`,
    [ledger_id]
  );
  const savings_monthly_total = selectTotal(
    sql_db,
    "SELECT SUM(monthly_amount) AS total FROM savings_goals WHERE ledger_id = ? AND deleted = 0",
    [ledger_id]
  );
  const savings_allocated = selectTotal(
    sql_db,
    `SELECT SUM(amount) AS total FROM surplus_allocations
     WHERE ledger_id = ? AND deleted = 0 AND destination = 'savings' AND year_month = ?`,
    [ledger_id, year_month]
  );
  const allowance_amounts = [...listAllowanceHistories(sql_db, ledger_id).values()].map(
    (member_history) => allowanceInEffect(member_history, year_month)
  );
  return {
    base_incomes,
    ledger_recurring_fixed_total,
    savings_monthly_total,
    savings_allocated,
    allowance_amounts,
  };
}

export interface BudgetHistoryItem {
  year_month: string;
  budget: number;
  actual: number;
}

export interface LedgerSummary extends LedgerBudget {
  income_total: number;
  recurring_total: number;
  savings_total: number;
  // Variable spending (food/other) of the shared ledger wallet so far this month.
  variable_spending: number;
  // "あといくら" of the shared ledger (of everything in personal mode).
  remaining: number;
  daily_budget: number;
  days_remaining: number;
  // The target month and the two before it, oldest first (as GET /budget-summary).
  history: BudgetHistoryItem[];
}

// Ledger budget summary, the local equivalent of GET /budget-summary extended to
// the household model. In personal mode shared_living_budget equals today's
// variable_budget.
export function computeLedgerSummary(
  sql_db: SqlDatabase,
  ledger_id: string,
  year_month: string,
  today_jst: string
): LedgerSummary {
  const ledger_scope: SpendingScope = { wallet: "ledger" };
  const ledger_budget_input = loadLedgerBudgetInput(sql_db, ledger_id, year_month);
  const ledger_budget = computeLedgerBudget(ledger_budget_input);
  const [month_start, next_month_start] = monthBounds(year_month);
  const income_total = selectTotal(
    sql_db,
    `SELECT SUM(amount) AS total FROM income_records
     WHERE ledger_id = ? AND deleted = 0 AND transaction_date >= ? AND transaction_date < ?`,
    [ledger_id, month_start, next_month_start]
  );
  const variable_spending = sumSpending(sql_db, ledger_id, ledger_scope, year_month, true);

  const history: BudgetHistoryItem[] = [-2, -1, 0].map((month_offset) => {
    const history_month = addMonths(year_month, month_offset);
    return {
      year_month: history_month,
      budget: computeLedgerBudget(loadLedgerBudgetInput(sql_db, ledger_id, history_month))
        .shared_living_budget,
      actual: sumSpending(sql_db, ledger_id, ledger_scope, history_month, false),
    };
  });

  return {
    ...ledger_budget,
    income_total,
    recurring_total: ledger_budget_input.ledger_recurring_fixed_total,
    savings_total: ledger_budget_input.savings_monthly_total,
    variable_spending,
    remaining: ledger_budget.shared_living_budget - variable_spending,
    daily_budget: dailyBudget(ledger_budget.shared_living_budget, year_month),
    days_remaining: daysRemaining(year_month, today_jst),
    history,
  };
}

// The viewer's own non-excluded allowance spending per month, from local entries.
export function listOwnAllowanceSpending(
  sql_db: SqlDatabase,
  ledger_id: string,
  owner_id: number
): Record<string, number> {
  const spending_rows = sql_db.selectRows(
    `SELECT substr(transaction_date, 1, 7) AS year_month, SUM(amount) AS total
     FROM journal_entries
     WHERE ledger_id = ? AND deleted = 0 AND is_excluded = 0 AND wallet = 'allowance' AND owner_id = ?
     GROUP BY substr(transaction_date, 1, 7)`,
    [ledger_id, owner_id]
  );
  return Object.fromEntries(
    spending_rows.map((spending_row) => [
      String(spending_row.year_month),
      sumAsNumber(spending_row.total),
    ])
  );
}

// Another member's allowance spending per month, from the server-computed totals.
export function listMemberAllowanceTotals(
  sql_db: SqlDatabase,
  ledger_id: string,
  member_id: number
): Record<string, number> {
  const total_rows = sql_db.selectRows(
    "SELECT year_month, spent FROM allowance_totals WHERE ledger_id = ? AND member_id = ?",
    [ledger_id, member_id]
  );
  return Object.fromEntries(
    total_rows.map((total_row) => [String(total_row.year_month), Number(total_row.spent)])
  );
}

// recurring_expense_id of every posting already synced for the month. Tombstoned
// postings count as posted: the server does not post a deleted month again.
export function listPostedRecurringIds(
  sql_db: SqlDatabase,
  ledger_id: string,
  year_month: string
): Set<string> {
  const posted_rows = sql_db.selectRows(
    `SELECT DISTINCT recurring_expense_id FROM journal_entries
     WHERE ledger_id = ? AND recurring_year_month = ? AND recurring_expense_id IS NOT NULL`,
    [ledger_id, year_month]
  );
  return new Set(posted_rows.map((posted_row) => String(posted_row.recurring_expense_id)));
}
