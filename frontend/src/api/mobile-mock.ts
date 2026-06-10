import type {
  RecurringExpense,
  PendingRecurring,
  SavingsGoal,
  IncomeRecord,
  BaseIncomeSetting,
  BudgetSummary,
} from "./mobile-types";

const MOCK_RECURRING: RecurringExpense[] = [
  { id: 1, name: "家賃", emoji: "🏠", billing_day: 25, amount: 80000, type: "fixed", group_id: 7, group_name: "固定費", category_id: 15, category_name: "家賃" },
  { id: 2, name: "電気代", emoji: "💡", billing_day: 10, amount: null, type: "variable", group_id: 7, group_name: "固定費", category_id: 16, category_name: "光熱費" },
  { id: 3, name: "ガス代", emoji: "🔥", billing_day: 15, amount: null, type: "variable", group_id: 7, group_name: "固定費", category_id: 16, category_name: "光熱費" },
  { id: 4, name: "通信費", emoji: "📱", billing_day: 27, amount: 6800, type: "fixed", group_id: 7, group_name: "固定費", category_id: 17, category_name: "通信費" },
  { id: 5, name: "Netflix", emoji: "🎬", billing_day: 5, amount: 1490, type: "fixed", group_id: 4, group_name: "趣味・娯楽", category_id: 10, category_name: "サブスク" },
  { id: 6, name: "ジム月会費", emoji: "🏋", billing_day: 13, amount: 2400, type: "fixed", group_id: 6, group_name: "美容・健康", category_id: 14, category_name: "ジム" },
];

const MOCK_PENDING: PendingRecurring[] = [
  { id: 2, name: "電気代", emoji: "💡", billing_day: 10, last_amount: 7480, group_name: "固定費" },
  { id: 3, name: "ガス代", emoji: "🔥", billing_day: 15, last_amount: 4220, group_name: "固定費" },
];

const MOCK_SAVINGS_GOALS: SavingsGoal[] = [
  { id: 1, name: "旅行積立", emoji: "✈️", monthly_amount: 20000, target_amount: 250000, accumulated_amount: 170000, deadline: "2027/03", is_posted_this_month: true, memo: "北海道旅行：新幹線とホテル代" },
  { id: 2, name: "緊急費用", emoji: "🛟", monthly_amount: 15000, target_amount: 500000, accumulated_amount: 285000, deadline: null, is_posted_this_month: true, memo: "生活費3ヶ月分が目安" },
  { id: 3, name: "新しいPC", emoji: "💻", monthly_amount: 10000, target_amount: 180000, accumulated_amount: 60000, deadline: "2027/01", is_posted_this_month: false, memo: "作業環境を整えたい" },
];

const MOCK_INCOMES: IncomeRecord[] = [
  { id: 1, transaction_date: "2026-05-25", amount: 280000, name: "6月給与", income_type: "salary", emoji: "🏢", note: "" },
  { id: 2, transaction_date: "2026-05-20", amount: 18500, name: "ライティング案件", income_type: "side", emoji: "✍️", note: "フリーランスnote" },
  { id: 3, transaction_date: "2026-05-15", amount: 16500, name: "イラスト副業", income_type: "side", emoji: "🎨", note: "" },
  { id: 4, transaction_date: "2026-05-08", amount: 3200, name: "医療費還付", income_type: "oneoff", emoji: "💊", note: "確定申告分" },
  { id: 5, transaction_date: "2026-05-02", amount: 5000, name: "親戚からのお祝い", income_type: "oneoff", emoji: "🎉", note: "" },
];

const MOCK_BASE_INCOME: BaseIncomeSetting = { amount: 280000 };

const MOCK_BUDGET_SUMMARY: BudgetSummary = {
  income_total: 323200,
  recurring_total: 96000,
  savings_total: 45000,
  variable_budget: 182200,
  daily_budget: Math.round(182200 / 30),
  days_remaining: 12,
  history: [
    { year_month: "2026-03", budget: 142000, actual: 131200 },
    { year_month: "2026-04", budget: 178000, actual: 182400 },
    { year_month: "2026-05", budget: 182200, actual: 47200 },
  ],
};

export const mobileApi = {
  listRecurringExpenses: () => Promise.resolve(MOCK_RECURRING),
  listPendingRecurring:  () => Promise.resolve(MOCK_PENDING),
  listSavingsGoals:      () => Promise.resolve(MOCK_SAVINGS_GOALS),
  listIncomes:           () => Promise.resolve(MOCK_INCOMES),
  getBaseIncome:         () => Promise.resolve(MOCK_BASE_INCOME),
  getBudgetSummary:      () => Promise.resolve(MOCK_BUDGET_SUMMARY),
};
