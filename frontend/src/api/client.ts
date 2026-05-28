import type { components } from "./types";

const API_BASE_URL = import.meta.env.VITE_API_URL;
const CREDENTIALS_STORAGE_KEY = "atoikura.basic_auth";

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

interface StoredCredentials {
  email: string;
  // Pre-encoded `Basic <base64(email:password)>` value so we never keep the raw password in app state.
  authorization_header: string;
}

function encodeBasicAuth(email: string, password: string): string {
  // btoa expects Latin-1; passwords with non-ASCII chars need UTF-8 encoding first.
  const utf8_bytes = new TextEncoder().encode(`${email}:${password}`);
  let binary_string = "";
  for (const byte of utf8_bytes) {
    binary_string += String.fromCharCode(byte);
  }
  return `Basic ${btoa(binary_string)}`;
}

export const credentials_store = {
  save(email: string, password: string): StoredCredentials {
    const entry: StoredCredentials = {
      email,
      authorization_header: encodeBasicAuth(email, password),
    };
    sessionStorage.setItem(CREDENTIALS_STORAGE_KEY, JSON.stringify(entry));
    return entry;
  },
  load(): StoredCredentials | null {
    const raw = sessionStorage.getItem(CREDENTIALS_STORAGE_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as StoredCredentials;
    } catch {
      return null;
    }
  },
  clear(): void {
    sessionStorage.removeItem(CREDENTIALS_STORAGE_KEY);
  },
};

async function request<TResponse>(
  path: string,
  init?: RequestInit,
  override_auth_header?: string,
): Promise<TResponse> {
  const auth_header =
    override_auth_header ?? credentials_store.load()?.authorization_header;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (auth_header) {
    headers["Authorization"] = auth_header;
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
  // Auth probe: verifies the supplied creds without persisting them. On success
  // the caller is responsible for calling credentials_store.save().
  login: (email: string, password: string) =>
    request<components["schemas"]["UserResponse"]>(
      "/auth/login",
      { method: "POST" },
      encodeBasicAuth(email, password),
    ),
  // Creates an account (no auth header needed). On success the caller stores
  // the same credentials, same as login.
  signup: (body: components["schemas"]["SignupRequest"]) =>
    request<components["schemas"]["UserResponse"]>(
      "/auth/signup",
      { method: "POST", body: JSON.stringify(body) },
    ),
  getCurrentUser: () =>
    request<components["schemas"]["UserResponse"]>("/users/me"),
  changePassword: (
    body: components["schemas"]["PasswordChangeRequest"],
  ) =>
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
