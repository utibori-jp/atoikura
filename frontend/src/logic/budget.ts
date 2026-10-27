import { daysInMonth, monthsBetween } from "./calendar";

// Budget formulas ("あといくら"). The personal-mode formulas mirror
// backend/internal/service/budget.go and are checked against
// testdata/logic/budget_personal.json. The household formulas implement
// docs/local-first/design.md §3 (shared ledger + per-member allowances).

export function variableBudget(
  base_income: number,
  recurring_total: number,
  savings_total: number,
  savings_allocated: number
): number {
  return base_income - recurring_total - savings_total - savings_allocated;
}

// Spreads a budget evenly over every day of the month. Truncates toward zero
// like Go's integer division, also for negative budgets.
export function dailyBudget(budget_amount: number, year_month: string): number {
  return Math.trunc(budget_amount / daysInMonth(year_month));
}

// Days left in year_month as seen from today_jst, including today. Past months
// have 0 days left; future months have all of their days left.
export function daysRemaining(year_month: string, today_jst: string): number {
  const total_days = daysInMonth(year_month);
  const current_year_month = today_jst.slice(0, 7);
  if (year_month === current_year_month) {
    return Math.max(total_days - Number(today_jst.slice(8, 10)) + 1, 0);
  }
  return year_month > current_year_month ? total_days : 0;
}

export interface LedgerBudgetInput {
  // Each member's base income; personal mode has exactly one.
  base_incomes: number[];
  // Fixed recurring expenses of the shared ledger wallet (allowance recurring expenses excluded).
  ledger_recurring_fixed_total: number;
  savings_monthly_total: number;
  savings_allocated: number;
  // Allowance amounts in effect for the month; empty in personal mode.
  allowance_amounts: number[];
}

export interface LedgerBudget {
  base_income_total: number;
  // Base incomes minus fixed costs and savings. Equals the variable budget in personal mode.
  disposable: number;
  allowance_total: number;
  // What the shared ledger wallet may spend on variable costs.
  shared_living_budget: number;
}

export function computeLedgerBudget(ledger_input: LedgerBudgetInput): LedgerBudget {
  const base_income_total = ledger_input.base_incomes.reduce(
    (running_sum, amount) => running_sum + amount,
    0
  );
  const disposable = variableBudget(
    base_income_total,
    ledger_input.ledger_recurring_fixed_total,
    ledger_input.savings_monthly_total,
    ledger_input.savings_allocated
  );
  const allowance_total = ledger_input.allowance_amounts.reduce(
    (running_sum, amount) => running_sum + amount,
    0
  );
  return {
    base_income_total,
    disposable,
    allowance_total,
    shared_living_budget: disposable - allowance_total,
  };
}

// "あといくら" for the shared ledger (or the whole budget in personal mode).
export function ledgerRemaining(
  shared_living_budget: number,
  ledger_variable_spending: number
): number {
  return shared_living_budget - ledger_variable_spending;
}

export interface AllowanceHistoryEntry {
  effective_from: string; // YYYY-MM
  amount: number;
}

// The allowance amount in effect for year_month: the latest entry whose
// effective_from is not after the month, or 0 when none applies yet.
export function allowanceInEffect(
  allowance_history: AllowanceHistoryEntry[],
  year_month: string
): number {
  let effective_entry: AllowanceHistoryEntry | undefined;
  for (const history_entry of allowance_history) {
    if (history_entry.effective_from > year_month) continue;
    if (!effective_entry || history_entry.effective_from > effective_entry.effective_from) {
      effective_entry = history_entry;
    }
  }
  return effective_entry?.amount ?? 0;
}

export interface AllowanceMonth {
  year_month: string;
  carried_in: number;
  allowance: number;
  spent: number;
  balance: number;
}

// Allowance balance with carry-over (design.md §3): starting at 0 in start_month,
// balance(m) = balance(m-1) + allowance(m) − spending(m). Unused allowance and
// overspending both carry into the next month. Returns one row per month from
// start_month through target_month; the last row's balance is the member's
// "あといくら".
export function allowanceBalances(
  allowance_history: AllowanceHistoryEntry[],
  spent_by_month: Record<string, number>,
  start_month: string,
  target_month: string
): AllowanceMonth[] {
  const allowance_months: AllowanceMonth[] = [];
  let running_balance = 0;
  for (const year_month of monthsBetween(start_month, target_month)) {
    const allowance = allowanceInEffect(allowance_history, year_month);
    const spent = spent_by_month[year_month] ?? 0;
    const carried_in = running_balance;
    running_balance = carried_in + allowance - spent;
    allowance_months.push({ year_month, carried_in, allowance, spent, balance: running_balance });
  }
  return allowance_months;
}
