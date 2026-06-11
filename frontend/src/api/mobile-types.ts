import type { components } from "./types";

type JournalEntryResponse = components["schemas"]["JournalEntryResponse"];

export interface RecurringExpense {
  id: number;
  name: string;
  emoji: string;
  billing_day: number;
  amount: number | null;
  type: "fixed" | "variable";
  group_id: number;
  group_name: string;
  category_id: number;
  category_name: string;
}

export interface PendingRecurring {
  id: number;
  name: string;
  emoji: string;
  billing_day: number;
  last_amount: number;
  group_name: string;
}

export interface SavingsGoal {
  id: number;
  name: string;
  emoji: string;
  monthly_amount: number;
  target_amount: number;
  accumulated_amount: number;
  deadline: string | null;
  is_posted_this_month: boolean;
  memo: string;
}

export interface IncomeRecord {
  id: number;
  transaction_date: string;
  amount: number;
  name: string;
  income_type: "salary" | "side" | "bonus" | "oneoff";
  emoji: string;
  note: string;
}

export interface BaseIncomeSetting {
  amount: number;
}

export interface BudgetSummary {
  income_total: number;
  recurring_total: number;
  savings_total: number;
  variable_budget: number;
  daily_budget: number;
  days_remaining: number;
  history: Array<{ year_month: string; budget: number; actual: number }>;
}

export type JournalEntryResponseWithRecurring = JournalEntryResponse & {
  is_recurring?: boolean;
};
