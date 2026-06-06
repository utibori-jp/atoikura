import type { components } from "./types";

const API_BASE_URL = import.meta.env.VITE_API_URL;
const TOKEN_STORAGE_KEY = "atoikura.token";

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

export const token_store = {
  save(token: string): void {
    sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
  },
  load(): string | null {
    return sessionStorage.getItem(TOKEN_STORAGE_KEY);
  },
  clear(): void {
    sessionStorage.removeItem(TOKEN_STORAGE_KEY);
  },
};

async function request<TResponse>(
  path: string,
  init?: RequestInit,
): Promise<TResponse> {
  const token = token_store.load();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  if (response.status === 401) {
    throw new AuthError("認証に失敗しました");
  }
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
  login: (email: string, password: string) =>
    request<components["schemas"]["LoginResponse"]>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  signup: (body: components["schemas"]["SignupRequest"]) =>
    request<components["schemas"]["LoginResponse"]>("/auth/signup", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  getCurrentUser: () =>
    request<components["schemas"]["UserResponse"]>("/users/me"),
  changePassword: (body: components["schemas"]["PasswordChangeRequest"]) =>
    request<void>("/users/me/password", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
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
  getDailyNotes: (year_month: string) =>
    request<components["schemas"]["DailyNoteListResponse"]>(
      `/notes/daily?year_month=${year_month}`,
    ),
  updateDailyNote: (date: string, note: string) =>
    request<components["schemas"]["DailyNote"]>(`/notes/daily/${date}`, {
      method: "PUT",
      body: JSON.stringify({ note }),
    }),
};
