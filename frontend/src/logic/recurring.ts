import { dateInMonth, daysInMonth } from "./calendar";

// Monthly recurring postings are created by the server (design.md §5.3). Until a
// month's postings arrive, a device can still show which fixed expenses are
// expected this month and on which date.

export interface RecurringExpense {
  id: string;
  name: string;
  billing_day: number;
  amount: number | null;
  type: "fixed" | "variable";
  category_id: string;
}

export interface PendingRecurringPosting {
  recurring_expense_id: string;
  name: string;
  amount: number;
  category_id: string;
  transaction_date: string;
}

// The billing day clamped to the last day of the month (e.g. day 31 in February
// becomes the 28th or 29th), the same rule as the server-side posting.
export function billingDateInMonth(year_month: string, billing_day: number): string {
  return dateInMonth(year_month, Math.min(billing_day, daysInMonth(year_month)));
}

// Fixed recurring expenses with an amount whose posting for year_month has not
// been synced yet. posted_recurring_ids holds the recurring_expense_id of every
// journal entry already posted for that month.
export function pendingRecurringPostings(
  recurring_expenses: RecurringExpense[],
  posted_recurring_ids: ReadonlySet<string>,
  year_month: string
): PendingRecurringPosting[] {
  return recurring_expenses
    .filter(
      (recurring_expense) =>
        recurring_expense.type === "fixed" &&
        recurring_expense.amount !== null &&
        !posted_recurring_ids.has(recurring_expense.id)
    )
    .map((recurring_expense) => ({
      recurring_expense_id: recurring_expense.id,
      name: recurring_expense.name,
      amount: recurring_expense.amount as number,
      category_id: recurring_expense.category_id,
      transaction_date: billingDateInMonth(year_month, recurring_expense.billing_day),
    }));
}
