import { render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "../../test/server";
import { WebBudget } from "./WebBudget";
import type { components } from "../../api/types";

const API_BASE = "http://localhost:8080";

function makeBudgetSummary(
  overrides: Partial<components["schemas"]["BudgetSummaryResponse"]> = {}
): components["schemas"]["BudgetSummaryResponse"] {
  const current_ym = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" }).slice(0, 7);
  return {
    income_total: 300000,
    recurring_total: 80000,
    savings_total: 20000,
    variable_budget: 200000,
    daily_budget: 6666,
    days_remaining: 18,
    history: [
      { year_month: "2026-04", budget: 195000, actual: 180000 },
      { year_month: "2026-05", budget: 198000, actual: 210000 },
      { year_month: current_ym, budget: 200000, actual: 50000 },
    ],
    ...overrides,
  };
}

const emptyRecurring: components["schemas"]["RecurringExpenseListResponse"] = {
  recurring_expenses: [],
};
const emptyGoals: components["schemas"]["SavingsGoalListResponse"] = { savings_goals: [] };
const emptyIncome: components["schemas"]["IncomeRecordListResponse"] = { income_records: [] };

describe("WebBudget — spending data from history", () => {
  it("shows 消化ペース derived from current-month actual, not 0%", async () => {
    // With actual=50000 and variable_budget=200000, spent_pct should be 25%
    server.use(
      http.get(`${API_BASE}/budget-summary`, () => HttpResponse.json(makeBudgetSummary())),
      http.get(`${API_BASE}/recurring-expenses`, () => HttpResponse.json(emptyRecurring)),
      http.get(`${API_BASE}/savings-goals`, () => HttpResponse.json(emptyGoals)),
      http.get(`${API_BASE}/income-records`, () => HttpResponse.json(emptyIncome))
    );

    render(<WebBudget onNavigate={() => {}} />);

    await waitFor(() => {
      // The component renders the budget plan heading once loaded
      expect(screen.getByText("今月の予算プラン")).toBeInTheDocument();
    });

    // spent_pct = round(50000 / 200000 * 100) = 25
    expect(screen.getByText("25%")).toBeInTheDocument();
  });

  it("shows correct 残り (remaining) based on actual spending", async () => {
    // variable_budget=200000, actual=50000 → remaining=150000
    server.use(
      http.get(`${API_BASE}/budget-summary`, () => HttpResponse.json(makeBudgetSummary())),
      http.get(`${API_BASE}/recurring-expenses`, () => HttpResponse.json(emptyRecurring)),
      http.get(`${API_BASE}/savings-goals`, () => HttpResponse.json(emptyGoals)),
      http.get(`${API_BASE}/income-records`, () => HttpResponse.json(emptyIncome))
    );

    render(<WebBudget onNavigate={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText("今月の予算プラン")).toBeInTheDocument();
    });

    // remaining = 200000 - 50000 = 150000 → formatted as "¥150,000"
    expect(screen.getByText(/残り ¥150,000/)).toBeInTheDocument();
  });

  it("shows 0% when current month has no actual spending recorded", async () => {
    const current_ym = new Date()
      .toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" })
      .slice(0, 7);

    server.use(
      http.get(`${API_BASE}/budget-summary`, () =>
        HttpResponse.json(
          makeBudgetSummary({
            history: [{ year_month: current_ym, budget: 200000, actual: 0 }],
          })
        )
      ),
      http.get(`${API_BASE}/recurring-expenses`, () => HttpResponse.json(emptyRecurring)),
      http.get(`${API_BASE}/savings-goals`, () => HttpResponse.json(emptyGoals)),
      http.get(`${API_BASE}/income-records`, () => HttpResponse.json(emptyIncome))
    );

    render(<WebBudget onNavigate={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText("今月の予算プラン")).toBeInTheDocument();
    });

    expect(screen.getByText("0%")).toBeInTheDocument();
  });
});
