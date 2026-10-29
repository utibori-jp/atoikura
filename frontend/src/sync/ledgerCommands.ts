import type { CommandMethod } from "./transport";
import type { PulledRow } from "./wire";

// Typed wrappers for the online-only ledger commands (sync-api.yaml, /ledger/*).
// The ledger and the author always come from the token, so no request carries a
// ledger_id or owner_id. Each command resolves with the row it wrote.

export type CommandSender = (
  method: CommandMethod,
  path: string,
  request_body?: unknown
) => Promise<PulledRow>;

export interface CategoryGroupInput {
  name: string;
  statement_type_code: "food" | "other" | "fixed" | "excluded";
  description?: string | null;
}

export interface ExpenseCategoryInput {
  group_id: string;
  name: string;
  description?: string | null;
}

export interface IncomeRecordInput {
  transaction_date: string;
  amount: number;
  name: string;
  income_type: string;
  emoji?: string | null;
  note?: string;
}

export interface RecurringExpenseInput {
  wallet: "ledger" | "allowance";
  name: string;
  emoji?: string | null;
  billing_day: number;
  amount?: number | null;
  type: "fixed" | "variable";
  category_id: string;
}

export interface SavingsGoalInput {
  name: string;
  emoji?: string | null;
  monthly_amount: number;
  target_amount: number;
  deadline?: string | null;
  memo?: string;
}

export interface MonthlyAmountInput {
  amount: number;
  year_month: string;
}

export interface BudgetInput {
  monthly_budget: number;
  goal_text?: string | null;
  goal_amount: number;
}

export interface SurplusAllocationInput {
  year_month: string;
  amount: number;
  destination: "budget" | "savings";
  savings_goal_id?: string | null;
}

// IDs go into the URL path; encoding keeps a malformed one from changing the route.
function idPath(collection_path: string, record_id: string, action_suffix = ""): string {
  return `/ledger/${collection_path}/${encodeURIComponent(record_id)}${action_suffix}`;
}

export function createLedgerCommands(send: CommandSender) {
  return {
    createCategoryGroup: (group_input: CategoryGroupInput) =>
      send("POST", "/ledger/category-groups", group_input),
    updateCategoryGroup: (group_id: string, group_input: CategoryGroupInput) =>
      send("PUT", idPath("category-groups", group_id), group_input),
    deleteCategoryGroup: (group_id: string) => send("DELETE", idPath("category-groups", group_id)),

    createExpenseCategory: (category_input: ExpenseCategoryInput) =>
      send("POST", "/ledger/expense-categories", category_input),
    updateExpenseCategory: (category_id: string, category_input: ExpenseCategoryInput) =>
      send("PUT", idPath("expense-categories", category_id), category_input),
    deleteExpenseCategory: (category_id: string) =>
      send("DELETE", idPath("expense-categories", category_id)),

    createIncomeRecord: (income_input: IncomeRecordInput) =>
      send("POST", "/ledger/income-records", income_input),
    updateIncomeRecord: (income_id: string, income_input: IncomeRecordInput) =>
      send("PUT", idPath("income-records", income_id), income_input),
    deleteIncomeRecord: (income_id: string) => send("DELETE", idPath("income-records", income_id)),

    putBaseIncome: (amount: number) => send("PUT", "/ledger/base-income", { amount }),

    createRecurringExpense: (recurring_input: RecurringExpenseInput) =>
      send("POST", "/ledger/recurring-expenses", recurring_input),
    updateRecurringExpense: (recurring_id: string, recurring_input: RecurringExpenseInput) =>
      send("PUT", idPath("recurring-expenses", recurring_id), recurring_input),
    deleteRecurringExpense: (recurring_id: string) =>
      send("DELETE", idPath("recurring-expenses", recurring_id)),
    // Posts a (typically variable) recurring expense for a month; returns the journal entry.
    confirmRecurringExpense: (recurring_id: string, confirm_input: MonthlyAmountInput) =>
      send("POST", idPath("recurring-expenses", recurring_id, "/confirm"), confirm_input),

    createSavingsGoal: (goal_input: SavingsGoalInput) =>
      send("POST", "/ledger/savings-goals", goal_input),
    updateSavingsGoal: (goal_id: string, goal_input: SavingsGoalInput) =>
      send("PUT", idPath("savings-goals", goal_id), goal_input),
    deleteSavingsGoal: (goal_id: string) => send("DELETE", idPath("savings-goals", goal_id)),
    createSavingsPosting: (goal_id: string, posting_input: MonthlyAmountInput) =>
      send("POST", idPath("savings-goals", goal_id, "/postings"), posting_input),

    putBudget: (budget_input: BudgetInput) => send("PUT", "/ledger/budget", budget_input),

    createSurplusAllocation: (allocation_input: SurplusAllocationInput) =>
      send("POST", "/ledger/surplus-allocations", allocation_input),
  };
}

export type LedgerCommands = ReturnType<typeof createLedgerCommands>;
