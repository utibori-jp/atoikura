export type BudgetTone = "sage" | "mustard" | "danger";

export function dailyAvailableTone(daily_available: number, daily_budget: number): BudgetTone {
  if (daily_available < 0) return "danger";
  if (daily_available < daily_budget * 0.5) return "mustard";
  return "sage";
}
