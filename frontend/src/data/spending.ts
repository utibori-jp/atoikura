import { buildDailyEntries, STATEMENT_TYPES, type BreakdownRow, type DailyEntry } from "../logic";
import type { LedgerData } from "./ledgerData";

// Spending aggregations of the ledger, computed in the DB worker
// with the Step 3 logic (the local equivalents of /expenses/*).

export interface DailyCumulative {
  year_month: string;
  // The shared living budget (in solo mode: income − fixed − savings; in
  // allowance mode: allowance + carry-over − fixed − savings).
  variable_budget: number;
  daily_budget: number;
  // Every day of the month: actual cumulative spending, then the forecast.
  days: DailyEntry[];
}

// The month's variable budget of the ledger the screens show. In allowance mode
// it comes from the allowance and carry-over instead of income.
async function loadMonthBudget(
  ledger_data: LedgerData,
  year_month: string,
  today_jst: string
): Promise<{ variable_budget: number; daily_budget: number }> {
  if (ledger_data.mode === "allowance" && ledger_data.household_ledger_id) {
    return ledger_data.local_db.query(
      "computeAllowanceSummary",
      ledger_data.personal_ledger_id,
      ledger_data.household_ledger_id,
      ledger_data.user_id,
      year_month,
      today_jst
    );
  }
  const ledger_summary = await ledger_data.local_db.query(
    "computeLedgerSummary",
    ledger_data.ledger_id,
    year_month,
    today_jst
  );
  return {
    variable_budget: ledger_summary.shared_living_budget,
    daily_budget: ledger_summary.daily_budget,
  };
}

export async function loadDailyCumulative(
  ledger_data: LedgerData,
  year_month: string,
  today_jst: string
): Promise<DailyCumulative> {
  const [month_budget, daily_sums] = await Promise.all([
    loadMonthBudget(ledger_data, year_month, today_jst),
    ledger_data.local_db.query("listDailyVariableSums", ledger_data.ledger_id, year_month),
  ]);
  return {
    year_month,
    variable_budget: month_budget.variable_budget,
    daily_budget: month_budget.daily_budget,
    days: buildDailyEntries(daily_sums, year_month, today_jst),
  };
}

export function loadMonthlyBreakdown(
  ledger_data: LedgerData,
  year_month: string
): Promise<BreakdownRow[]> {
  return ledger_data.local_db.query("listMonthlyBreakdown", ledger_data.ledger_id, year_month);
}

export interface MonthlyBreakdownItem {
  category_id: string;
  category_name: string;
  group_id: string;
  group_name: string;
  // Sorts and groups the statement types (食費, その他, 固定費, 対象外).
  statement_type_order: number;
  statement_type_name: string;
  total: number;
}

const STATEMENT_TYPE_ORDER_BY_CODE = new Map(
  STATEMENT_TYPES.map((statement_type) => [statement_type.type_code, statement_type.display_order])
);

// The review screens' per-category totals of the ledger.
export async function loadMonthlyBreakdownItems(
  ledger_data: LedgerData,
  year_month: string
): Promise<MonthlyBreakdownItem[]> {
  const breakdown_rows = await loadMonthlyBreakdown(ledger_data, year_month);
  return breakdown_rows.map((breakdown_row) => ({
    category_id: breakdown_row.category_id,
    category_name: breakdown_row.category_name,
    group_id: breakdown_row.group_id,
    group_name: breakdown_row.group_name,
    statement_type_order: STATEMENT_TYPE_ORDER_BY_CODE.get(breakdown_row.statement_type_code) ?? 99,
    statement_type_name: breakdown_row.statement_type_name,
    total: breakdown_row.total,
  }));
}
