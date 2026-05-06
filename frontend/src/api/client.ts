import type { components } from "./types";

const API_BASE_URL = import.meta.env.VITE_API_URL;

async function request<TResponse>(
  path: string,
  init?: RequestInit,
): Promise<TResponse> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    const error_body = (await response.json().catch(() => ({}))) as {
      message?: string;
    };
    throw new Error(error_body.message ?? `HTTP ${response.status}`);
  }
  if (response.status === 204) {
    return undefined as TResponse;
  }
  return response.json() as Promise<TResponse>;
}

export const api = {
  listCategoryGroups: () =>
    request<components["schemas"]["CategoryGroupListResponse"]>(
      "/category-groups",
    ),
  listExpenseCategories: () =>
    request<components["schemas"]["ExpenseCategoryListResponse"]>(
      "/expense-categories",
    ),
  createJournalEntry: (body: components["schemas"]["JournalEntryRequest"]) =>
    request<components["schemas"]["JournalEntryResponse"]>("/journal-entries", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  listJournalEntries: (year_month: string) =>
    request<components["schemas"]["JournalEntryListResponse"]>(
      `/journal-entries?year_month=${year_month}`,
    ),
  getBudgets: () =>
    request<components["schemas"]["BudgetResponse"]>("/budgets"),
  updateBudgets: (body: components["schemas"]["BudgetRequest"]) =>
    request<components["schemas"]["BudgetResponse"]>("/budgets", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  getDailyCumulative: (year_month?: string) => {
    const qs = year_month ? `?year_month=${year_month}` : "";
    return request<components["schemas"]["DailyCumulativeResponse"]>(
      `/expenses/daily-cumulative${qs}`,
    );
  },
  updateJournalEntry: (
    id: number,
    body: components["schemas"]["JournalEntryRequest"],
  ) =>
    request<components["schemas"]["JournalEntryResponse"]>(
      `/journal-entries/${id}`,
      { method: "PUT", body: JSON.stringify(body) },
    ),
  deleteJournalEntry: (id: number) =>
    request<void>(`/journal-entries/${id}`, { method: "DELETE" }),
  listStatementTypes: () =>
    request<{
      statement_types: components["schemas"]["StatementTypeSummary"][];
    }>("/statement-types"),
  createCategoryGroup: (body: components["schemas"]["CategoryGroupRequest"]) =>
    request<components["schemas"]["CategoryGroup"]>("/category-groups", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateCategoryGroup: (
    id: number,
    body: components["schemas"]["CategoryGroupRequest"],
  ) =>
    request<components["schemas"]["CategoryGroup"]>(`/category-groups/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  deleteCategoryGroup: (id: number) =>
    request<void>(`/category-groups/${id}`, { method: "DELETE" }),
  createExpenseCategory: (
    body: components["schemas"]["ExpenseCategoryRequest"],
  ) =>
    request<components["schemas"]["ExpenseCategory"]>("/expense-categories", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateExpenseCategory: (
    id: number,
    body: components["schemas"]["ExpenseCategoryRequest"],
  ) =>
    request<components["schemas"]["ExpenseCategory"]>(
      `/expense-categories/${id}`,
      { method: "PUT", body: JSON.stringify(body) },
    ),
  deleteExpenseCategory: (id: number) =>
    request<void>(`/expense-categories/${id}`, { method: "DELETE" }),
  getMonthlyBreakdown: (year_month: string) =>
    request<components["schemas"]["MonthlyBreakdownResponse"]>(
      `/expenses/monthly-breakdown?year_month=${year_month}`,
    ),
  getMonthlyReviews: (year_month: string) =>
    request<components["schemas"]["MonthlyReviewResponse"]>(
      `/notes/monthly-reviews?year_month=${year_month}`,
    ),
  updateMonthlyReviews: (
    year_month: string,
    notes: components["schemas"]["MonthlyReviewNote"][],
  ) =>
    request<components["schemas"]["MonthlyReviewResponse"]>(
      "/notes/monthly-reviews",
      {
        method: "PUT",
        body: JSON.stringify({ year_month, notes }),
      },
    ),
};
