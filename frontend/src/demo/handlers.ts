// Read-only MSW handlers backing the static GitHub Pages demo (#142).
//
// Every endpoint any screen calls is covered so nothing falls through to the
// network. GET endpoints return rich, believable seed data for the *current*
// month (so charts and "today" markers line up). Mutating endpoints return a
// plausible success but do NOT persist — the demo is read-only browse, so a
// reload resets everything. None of this is bundled unless VITE_DEMO=true.

import { http, HttpResponse } from "msw";
import type { components } from "../api/types";

// MSW matches on the same origin the API client targets (VITE_API_URL). In the
// demo build that origin never actually exists; MSW intercepts before any fetch.
const API_BASE = import.meta.env.VITE_API_URL;

// --- date helpers: anchor all seed data to the real current month -----------

const now = new Date();
const YEAR = now.getFullYear();
const MONTH_INDEX = now.getMonth(); // 0-based
const YM = `${YEAR}-${String(MONTH_INDEX + 1).padStart(2, "0")}`;
const DAYS_IN_MONTH = new Date(YEAR, MONTH_INDEX + 1, 0).getDate();
const TODAY = Math.min(now.getDate(), DAYS_IN_MONTH);

/** Build a YYYY-MM-DD string for the given day of the current month. */
function dateOf(day: number): string {
  return `${YM}-${String(day).padStart(2, "0")}`;
}

// --- master data ------------------------------------------------------------

const user: components["schemas"]["UserResponse"] = {
  id: 1,
  email: "demo@atoikura.app",
  display_name: "デモユーザー",
  last_login_at: now.toISOString(),
};

const categoryGroups: components["schemas"]["CategoryGroupListResponse"] = {
  category_groups: [
    {
      id: 1,
      group_name: "食費",
      statement_type: { id: 1, type_code: "food", statement_type_name: "食費（変動費）" },
      description: null,
    },
    {
      id: 2,
      group_name: "日用品・娯楽",
      statement_type: { id: 2, type_code: "other", statement_type_name: "その他（変動費）" },
      description: null,
    },
    {
      id: 3,
      group_name: "固定費",
      statement_type: { id: 3, type_code: "fixed", statement_type_name: "固定費" },
      description: null,
    },
  ],
};

const expenseCategories: components["schemas"]["ExpenseCategoryListResponse"] = {
  expense_categories: [
    {
      id: 1,
      category_name: "スーパー",
      category_code: "food_super",
      group_id: 1,
      group_name: "食費",
      description: null,
    },
    {
      id: 2,
      category_name: "外食",
      category_code: "food_eatout",
      group_id: 1,
      group_name: "食費",
      description: null,
    },
    {
      id: 3,
      category_name: "カフェ",
      category_code: "food_cafe",
      group_id: 1,
      group_name: "食費",
      description: null,
    },
    {
      id: 4,
      category_name: "日用品",
      category_code: "other_daily",
      group_id: 2,
      group_name: "日用品・娯楽",
      description: null,
    },
    {
      id: 5,
      category_name: "娯楽",
      category_code: "other_fun",
      group_id: 2,
      group_name: "日用品・娯楽",
      description: null,
    },
    {
      id: 10,
      category_name: "家賃",
      category_code: "rent",
      group_id: 3,
      group_name: "固定費",
      description: null,
    },
    {
      id: 11,
      category_name: "通信費",
      category_code: "telecom",
      group_id: 3,
      group_name: "固定費",
      description: null,
    },
    {
      id: 12,
      category_name: "水道光熱費",
      category_code: "utility",
      group_id: 3,
      group_name: "固定費",
      description: null,
    },
  ],
};

const statementTypes: { statement_types: components["schemas"]["StatementTypeSummary"][] } = {
  statement_types: [
    { id: 1, type_code: "food", statement_type_name: "食費（変動費）" },
    { id: 2, type_code: "other", statement_type_name: "その他（変動費）" },
    { id: 3, type_code: "fixed", statement_type_name: "固定費" },
  ],
};

// --- budget / income --------------------------------------------------------

const BASE_INCOME = 320000;
const RECURRING_TOTAL = 86480;
const SAVINGS_TOTAL = 45000;
const VARIABLE_BUDGET = BASE_INCOME - RECURRING_TOTAL - SAVINGS_TOTAL; // 188520
const DAILY_BUDGET = Math.floor(VARIABLE_BUDGET / DAYS_IN_MONTH);

const baseIncome: components["schemas"]["BaseIncomeSetting"] = { amount: BASE_INCOME };

const budgetSummary: components["schemas"]["BudgetSummaryResponse"] = {
  income_total: BASE_INCOME,
  base_income: BASE_INCOME,
  recurring_total: RECURRING_TOTAL,
  savings_total: SAVINGS_TOTAL,
  variable_budget: VARIABLE_BUDGET,
  daily_budget: DAILY_BUDGET,
  days_remaining: Math.max(DAYS_IN_MONTH - TODAY, 0),
  history: [
    {
      year_month: `${YEAR}-${String(((MONTH_INDEX + 9) % 12) + 1).padStart(2, "0")}`,
      budget: 185000,
      actual: 176400,
    },
    {
      year_month: `${YEAR}-${String(((MONTH_INDEX + 10) % 12) + 1).padStart(2, "0")}`,
      budget: 187000,
      actual: 198200,
    },
    {
      year_month: `${YEAR}-${String(((MONTH_INDEX + 11) % 12) + 1).padStart(2, "0")}`,
      budget: 188000,
      actual: 171900,
    },
  ],
};

const incomeRecords: components["schemas"]["IncomeRecordListResponse"] = {
  income_records: [
    {
      id: 1,
      transaction_date: dateOf(Math.min(25, DAYS_IN_MONTH)),
      amount: 320000,
      name: "給与",
      income_type: "salary",
      emoji: "🏢",
      note: "",
    },
    {
      id: 2,
      transaction_date: dateOf(Math.min(15, DAYS_IN_MONTH)),
      amount: 24000,
      name: "副業（記事執筆）",
      income_type: "side",
      emoji: "✍️",
      note: "",
    },
  ],
};

// --- recurring expenses + pending -------------------------------------------

const recurringExpenses: components["schemas"]["RecurringExpenseListResponse"] = {
  recurring_expenses: [
    {
      id: 1,
      name: "家賃",
      emoji: "🏠",
      billing_day: 27,
      amount: 78000,
      type: "fixed",
      category_id: 10,
      group_id: 3,
      group_name: "固定費",
      category_name: "家賃",
    },
    {
      id: 2,
      name: "モバイル回線",
      emoji: "📱",
      billing_day: 10,
      amount: 3480,
      type: "fixed",
      category_id: 11,
      group_id: 3,
      group_name: "固定費",
      category_name: "通信費",
    },
    {
      id: 3,
      name: "動画サブスク",
      emoji: "🎬",
      billing_day: 5,
      amount: 1500,
      type: "fixed",
      category_id: 11,
      group_id: 3,
      group_name: "固定費",
      category_name: "通信費",
    },
    {
      id: 4,
      name: "電気代",
      emoji: "💡",
      billing_day: 18,
      amount: null,
      type: "variable",
      category_id: 12,
      group_id: 3,
      group_name: "固定費",
      category_name: "水道光熱費",
    },
    {
      id: 5,
      name: "水道代",
      emoji: "🚿",
      billing_day: 20,
      amount: null,
      type: "variable",
      category_id: 12,
      group_id: 3,
      group_name: "固定費",
      category_name: "水道光熱費",
    },
  ],
};

const pendingRecurring: components["schemas"]["PendingRecurringListResponse"] = {
  pending: [
    {
      id: 4,
      name: "電気代",
      emoji: "💡",
      billing_day: 18,
      last_amount: 8200,
      group_name: "固定費",
    },
    {
      id: 5,
      name: "水道代",
      emoji: "🚿",
      billing_day: 20,
      last_amount: 3500,
      group_name: "固定費",
    },
  ],
};

// --- savings ----------------------------------------------------------------

const savingsGoals: components["schemas"]["SavingsGoalListResponse"] = {
  savings_goals: [
    {
      id: 1,
      name: "北海道旅行",
      emoji: "✈️",
      monthly_amount: 25000,
      target_amount: 250000,
      accumulated_amount: 175000,
      deadline: `${YEAR + 1}/03`,
      memo: "新幹線とホテル代",
      is_posted_this_month: true,
    },
    {
      id: 2,
      name: "新しいPC",
      emoji: "💻",
      monthly_amount: 20000,
      target_amount: 240000,
      accumulated_amount: 80000,
      deadline: null,
      memo: "開発用に買い替え",
      is_posted_this_month: false,
    },
  ],
};

const surplusAllocations: components["schemas"]["SurplusAllocationListResponse"] = {
  surplus_allocations: [
    {
      id: 1,
      year_month: YM,
      amount: 24000,
      destination: "savings",
      savings_goal_id: 1,
      created_at: now.toISOString(),
    },
  ],
};

// --- journal entries (grouped by date, descending) --------------------------

let nextEntryId = 100;
function entry(
  day: number,
  item: string,
  amount: number,
  category_id: number,
  category_name: string,
  group_id: number,
  group_name: string,
  note: string | null = null
): components["schemas"]["JournalEntryResponse"] {
  return {
    id: nextEntryId++,
    transaction_date: dateOf(day),
    item,
    amount,
    category_id,
    category_name,
    group_id,
    group_name,
    is_excluded: false,
    note,
    created_at: `${dateOf(day)}T09:00:00Z`,
    is_recurring: false,
  };
}

const SEED_DAYS: { day: number; entries: components["schemas"]["JournalEntryResponse"][] }[] = [
  {
    day: Math.min(TODAY, DAYS_IN_MONTH),
    entries: [
      entry(TODAY, "ランチ", 980, 2, "外食", 1, "食費"),
      entry(TODAY, "コンビニ", 540, 1, "スーパー", 1, "食費"),
    ],
  },
  {
    day: Math.max(TODAY - 1, 1),
    entries: [
      entry(Math.max(TODAY - 1, 1), "スーパー まとめ買い", 4280, 1, "スーパー", 1, "食費"),
      entry(Math.max(TODAY - 1, 1), "ドラッグストア", 1860, 4, "日用品", 2, "日用品・娯楽"),
    ],
  },
  {
    day: Math.max(TODAY - 3, 1),
    entries: [
      entry(Math.max(TODAY - 3, 1), "カフェ作業", 620, 3, "カフェ", 1, "食費", "打ち合わせ"),
      entry(Math.max(TODAY - 3, 1), "映画", 1900, 5, "娯楽", 2, "日用品・娯楽"),
    ],
  },
  {
    day: Math.max(TODAY - 5, 1),
    entries: [entry(Math.max(TODAY - 5, 1), "スーパー", 3120, 1, "スーパー", 1, "食費")],
  },
  {
    day: Math.max(TODAY - 8, 1),
    entries: [
      entry(Math.max(TODAY - 8, 1), "居酒屋", 4600, 2, "外食", 1, "食費", "友人と"),
      entry(Math.max(TODAY - 8, 1), "日用品", 980, 4, "日用品", 2, "日用品・娯楽"),
    ],
  },
];

// Distinct days only, descending, matching JournalEntryListResponse grouping.
const seenDays = new Set<number>();
const journalEntries: components["schemas"]["JournalEntryListResponse"] = {
  year_month: YM,
  entries: SEED_DAYS.filter((d) => {
    if (seenDays.has(d.day)) return false;
    seenDays.add(d.day);
    return true;
  })
    .sort((a, b) => b.day - a.day)
    .map((d) => ({ date: dateOf(d.day), journal_entries: d.entries })),
};

// --- daily cumulative (full month; is_actual through today) -----------------

function buildDailyCumulative(): components["schemas"]["DailyCumulativeResponse"] {
  const days: components["schemas"]["DailyEntry"][] = [];
  let foodCum = 0;
  let otherCum = 0;
  // Gentle, slightly-under-pace spend so 『あといくら』 stays comfortably positive.
  for (let day = 1; day <= DAYS_IN_MONTH; day++) {
    const is_actual = day <= TODAY;
    const foodStep = 2400 + ((day * 137) % 1800);
    const otherStep = 1100 + ((day * 91) % 1300);
    foodCum += foodStep;
    otherCum += otherStep;
    days.push({
      date: dateOf(day),
      food: foodCum,
      other: otherCum,
      total: foodCum + otherCum,
      is_actual,
    });
  }
  return { year_month: YM, variable_budget: VARIABLE_BUDGET, daily_budget: DAILY_BUDGET, days };
}

const dailyCumulative = buildDailyCumulative();

// --- monthly breakdown / reviews / daily notes ------------------------------

const monthlyBreakdown: components["schemas"]["MonthlyBreakdownResponse"] = {
  year_month: YM,
  breakdown: [
    {
      category_id: 1,
      category_name: "スーパー",
      group_id: 1,
      group_name: "食費",
      statement_type_id: 1,
      statement_type_name: "食費（変動費）",
      total: 41200,
    },
    {
      category_id: 2,
      category_name: "外食",
      group_id: 1,
      group_name: "食費",
      statement_type_id: 1,
      statement_type_name: "食費（変動費）",
      total: 18600,
    },
    {
      category_id: 3,
      category_name: "カフェ",
      group_id: 1,
      group_name: "食費",
      statement_type_id: 1,
      statement_type_name: "食費（変動費）",
      total: 4300,
    },
    {
      category_id: 4,
      category_name: "日用品",
      group_id: 2,
      group_name: "日用品・娯楽",
      statement_type_id: 2,
      statement_type_name: "その他（変動費）",
      total: 9800,
    },
    {
      category_id: 5,
      category_name: "娯楽",
      group_id: 2,
      group_name: "日用品・娯楽",
      statement_type_id: 2,
      statement_type_name: "その他（変動費）",
      total: 6100,
    },
  ],
};

const monthlyReviews: components["schemas"]["MonthlyReviewResponse"] = {
  year_month: YM,
  notes: [
    { category_id: 1, note: "週末のまとめ買いで単価は抑えられた。" },
    { category_id: 2, note: "外食が少し多め。来月は週1に。" },
  ],
};

const dailyNotes: components["schemas"]["DailyNoteListResponse"] = {
  year_month: YM,
  notes: [
    { date: dateOf(Math.max(TODAY - 3, 1)), note: "映画デー🎬 出費多め" },
    { date: dateOf(Math.max(TODAY - 8, 1)), note: "飲み会あり" },
  ],
};

// --- handlers ---------------------------------------------------------------

export const demoHandlers = [
  // auth / user
  http.get(`${API_BASE}/users/me`, () => HttpResponse.json(user)),
  http.post(`${API_BASE}/auth/login`, () => HttpResponse.json({ token: "demo", ...user })),
  http.post(`${API_BASE}/auth/signup`, () =>
    HttpResponse.json({ token: "demo", ...user }, { status: 201 })
  ),
  http.put(`${API_BASE}/users/me/password`, () => new HttpResponse(null, { status: 204 })),

  // master
  http.get(`${API_BASE}/category-groups`, () => HttpResponse.json(categoryGroups)),
  http.get(`${API_BASE}/expense-categories`, () => HttpResponse.json(expenseCategories)),
  http.get(`${API_BASE}/statement-types`, () => HttpResponse.json(statementTypes)),

  // budget / home
  http.get(`${API_BASE}/budget-summary`, () => HttpResponse.json(budgetSummary)),
  http.get(`${API_BASE}/expenses/daily-cumulative`, () => HttpResponse.json(dailyCumulative)),
  http.get(`${API_BASE}/expenses/monthly-breakdown`, () => HttpResponse.json(monthlyBreakdown)),

  // journal
  http.get(`${API_BASE}/journal-entries`, () => HttpResponse.json(journalEntries)),
  http.post(`${API_BASE}/journal-entries`, () =>
    HttpResponse.json(entry(TODAY, "（デモ）記録", 0, 1, "スーパー", 1, "食費"), { status: 201 })
  ),
  http.put(`${API_BASE}/journal-entries/:id`, () =>
    HttpResponse.json(entry(TODAY, "（デモ）更新", 0, 1, "スーパー", 1, "食費"))
  ),
  http.delete(`${API_BASE}/journal-entries/:id`, () => new HttpResponse(null, { status: 204 })),

  // notes
  http.get(`${API_BASE}/notes/daily`, () => HttpResponse.json(dailyNotes)),
  http.put(`${API_BASE}/notes/daily/:date`, () =>
    HttpResponse.json({ date: dateOf(TODAY), note: "" })
  ),
  http.get(`${API_BASE}/notes/monthly-reviews`, () => HttpResponse.json(monthlyReviews)),
  http.put(`${API_BASE}/notes/monthly-reviews`, () => HttpResponse.json(monthlyReviews)),

  // recurring
  http.get(`${API_BASE}/recurring-expenses`, () => HttpResponse.json(recurringExpenses)),
  http.get(`${API_BASE}/recurring-expenses/pending`, () => HttpResponse.json(pendingRecurring)),
  http.post(`${API_BASE}/recurring-expenses`, () =>
    HttpResponse.json(recurringExpenses.recurring_expenses[0], { status: 201 })
  ),
  http.put(`${API_BASE}/recurring-expenses/:id`, () =>
    HttpResponse.json(recurringExpenses.recurring_expenses[0])
  ),
  http.delete(`${API_BASE}/recurring-expenses/:id`, () => new HttpResponse(null, { status: 204 })),
  http.post(`${API_BASE}/recurring-expenses/:id/confirm`, () =>
    HttpResponse.json(entry(TODAY, "（デモ）確定", 0, 12, "水道光熱費", 3, "固定費"), {
      status: 201,
    })
  ),

  // savings
  http.get(`${API_BASE}/savings-goals`, () => HttpResponse.json(savingsGoals)),
  http.post(`${API_BASE}/savings-goals`, () =>
    HttpResponse.json(savingsGoals.savings_goals[0], { status: 201 })
  ),
  http.put(`${API_BASE}/savings-goals/:id`, () => HttpResponse.json(savingsGoals.savings_goals[0])),
  http.delete(`${API_BASE}/savings-goals/:id`, () => new HttpResponse(null, { status: 204 })),
  http.post(`${API_BASE}/savings-goals/:id/post-monthly`, () =>
    HttpResponse.json(savingsGoals.savings_goals[0])
  ),

  // income
  http.get(`${API_BASE}/income-records`, () => HttpResponse.json(incomeRecords)),
  http.post(`${API_BASE}/income-records`, () =>
    HttpResponse.json(incomeRecords.income_records[0], { status: 201 })
  ),
  http.put(`${API_BASE}/income-records/:id`, () =>
    HttpResponse.json(incomeRecords.income_records[0])
  ),
  http.delete(`${API_BASE}/income-records/:id`, () => new HttpResponse(null, { status: 204 })),
  http.get(`${API_BASE}/base-income`, () => HttpResponse.json(baseIncome)),
  http.put(`${API_BASE}/base-income`, () => HttpResponse.json(baseIncome)),

  // surplus
  http.get(`${API_BASE}/surplus-allocations`, () => HttpResponse.json(surplusAllocations)),
  http.post(`${API_BASE}/surplus-allocations`, () =>
    HttpResponse.json(surplusAllocations.surplus_allocations[0], { status: 201 })
  ),
];
