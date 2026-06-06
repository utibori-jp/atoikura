import { http, HttpResponse } from "msw";
import type { components } from "../api/types";

const API_BASE = "http://localhost:8080";

const defaultCategoryGroups: components["schemas"]["CategoryGroupListResponse"] =
  {
    category_groups: [
      {
        id: 1,
        group_name: "食費",
        statement_type: {
          id: 1,
          type_code: "food",
          statement_type_name: "食費（変動費）",
        },
        description: null,
      },
    ],
  };

const defaultExpenseCategories: components["schemas"]["ExpenseCategoryListResponse"] =
  {
    expense_categories: [
      {
        id: 1,
        category_name: "スーパー",
        category_code: "food_super",
        group_id: 1,
        group_name: "食費",
        description: null,
      },
    ],
  };

const defaultJournalEntryListResponse: components["schemas"]["JournalEntryListResponse"] =
  {
    year_month: "2026-06",
    entries: [],
  };

const defaultCreatedJournalEntry: components["schemas"]["JournalEntryResponse"] =
  {
    id: 1,
    transaction_date: "2026-06-06",
    item: "コンビニ",
    amount: 500,
    category_id: 1,
    category_name: "スーパー",
    group_id: 1,
    group_name: "食費",
    is_excluded: false,
    note: null,
    created_at: "2026-06-06T00:00:00Z",
  };

const defaultBudget: components["schemas"]["BudgetResponse"] = {
  monthly_budget: 150000,
  goal_text: null,
  goal_amount: null,
};

const defaultUser: components["schemas"]["UserResponse"] = {
  id: 1,
  email: "dev@atoikura.local",
  display_name: "Dev User",
  last_login_at: null,
};

export const handlers = [
  http.get(`${API_BASE}/category-groups`, () =>
    HttpResponse.json(defaultCategoryGroups),
  ),

  http.get(`${API_BASE}/expense-categories`, () =>
    HttpResponse.json(defaultExpenseCategories),
  ),

  http.post(`${API_BASE}/journal-entries`, () =>
    HttpResponse.json(defaultCreatedJournalEntry, { status: 201 }),
  ),

  http.get(`${API_BASE}/journal-entries`, () =>
    HttpResponse.json(defaultJournalEntryListResponse),
  ),

  http.get(`${API_BASE}/budgets`, () => HttpResponse.json(defaultBudget)),

  http.get(`${API_BASE}/users/me`, () => HttpResponse.json(defaultUser)),
];
