//go:build integration

package repository_test

import (
	"context"
	"testing"
)

// addRecurringFixed inserts a recurring fixed expense for the user.
func addRecurringFixed(t *testing.T, user_id int64, amount int32) {
	t.Helper()
	_, err := testPool.Exec(context.Background(),
		`INSERT INTO recurring_expenses (user_id, name, emoji, amount, type, category_id, billing_day)
		 VALUES ($1, 'テスト固定費', '🔁', $2, 'fixed',
		   (SELECT id FROM expense_categories WHERE user_id = $1 LIMIT 1), 1)`,
		user_id, amount,
	)
	if err != nil {
		t.Fatalf("addRecurringFixed: %v", err)
	}
}

// addSavingsGoalForUser inserts a savings goal with the given monthly amount directly via SQL.
func addSavingsGoalForUser(t *testing.T, user_id int64, monthly_amount int32) {
	t.Helper()
	_, err := testPool.Exec(context.Background(),
		`INSERT INTO savings_goals (user_id, name, emoji, monthly_amount, target_amount, accumulated_amount)
		 VALUES ($1, 'テスト貯金', '💰', $2, 500000, 0)`,
		user_id, monthly_amount,
	)
	if err != nil {
		t.Fatalf("addSavingsGoalForUser: %v", err)
	}
}

// TestBudgetSummary_UsesBaseIncomeNotRecordedIncome verifies that the variable budget
// is derived from the base income setting, not the sum of recorded income records.
// Adding or removing income records must not change the variable budget.
func TestBudgetSummary_UsesBaseIncomeNotRecordedIncome(t *testing.T) {
	ctx := context.Background()
	u := createTestUser(t, "bs_base_income@test.example")

	const base_income int32 = 300000
	const recurring int32 = 50000
	const savings int32 = 30000
	const expected_variable_budget = base_income - recurring - savings // 220000

	setBaseIncome(t, u.UserID, base_income)
	addRecurringFixed(t, u.UserID, recurring)
	addSavingsGoalForUser(t, u.UserID, savings)

	// No income records recorded yet — variable budget should still use base income.
	summary_no_income, err := testRepo.GetBudgetSummary(ctx, u.UserID, "2026-03")
	if err != nil {
		t.Fatalf("GetBudgetSummary (no income records): %v", err)
	}
	if summary_no_income.VariableBudget != expected_variable_budget {
		t.Errorf("variable_budget without income records = %d, want %d",
			summary_no_income.VariableBudget, expected_variable_budget)
	}

	// Add an income record for a different amount than base_income.
	addIncomeForMonth(t, u.UserID, "2026-03", 999999)

	// After adding income, variable budget must remain unchanged.
	summary_with_income, err := testRepo.GetBudgetSummary(ctx, u.UserID, "2026-03")
	if err != nil {
		t.Fatalf("GetBudgetSummary (with income record): %v", err)
	}
	if summary_with_income.VariableBudget != expected_variable_budget {
		t.Errorf("variable_budget after adding income record = %d, want %d (must be stable, derived from base income)",
			summary_with_income.VariableBudget, expected_variable_budget)
	}

	// IncomeTotal display field must reflect the actual recorded income.
	if summary_with_income.IncomeTotal != 999999 {
		t.Errorf("income_total = %d, want 999999 (display field should show actual recorded income)",
			summary_with_income.IncomeTotal)
	}

	// BaseIncome must be exposed so the frontend breakdown can show 基準収入 (#119 display).
	if summary_with_income.BaseIncome != base_income {
		t.Errorf("base_income = %d, want %d (must be exposed for the budget breakdown)",
			summary_with_income.BaseIncome, base_income)
	}
}

// TestBudgetSummary_HistoryUsesBaseIncome verifies that the history months also use
// base income (not per-month recorded income) so months are stable and comparable.
func TestBudgetSummary_HistoryUsesBaseIncome(t *testing.T) {
	ctx := context.Background()
	u := createTestUser(t, "bs_history_base@test.example")

	const base_income int32 = 280000
	const recurring int32 = 40000
	const savings int32 = 20000
	const expected_history_budget = base_income - recurring - savings // 220000

	setBaseIncome(t, u.UserID, base_income)
	addRecurringFixed(t, u.UserID, recurring)
	addSavingsGoalForUser(t, u.UserID, savings)

	// Seed varying recorded income for each history month to confirm budget stays stable.
	addIncomeForMonth(t, u.UserID, "2026-04", 100000) // 2 months prior
	addIncomeForMonth(t, u.UserID, "2026-05", 200000) // 1 month prior
	addIncomeForMonth(t, u.UserID, "2026-06", 400000) // current

	summary, err := testRepo.GetBudgetSummary(ctx, u.UserID, "2026-06")
	if err != nil {
		t.Fatalf("GetBudgetSummary: %v", err)
	}

	if len(summary.History) != 3 {
		t.Fatalf("history length = %d, want 3", len(summary.History))
	}

	// History index 0 = oldest (2 months back), index 2 = current month (requested month).
	expected_months := [3]string{"2026-04", "2026-05", "2026-06"}
	for i, item := range summary.History {
		if item.YearMonth != expected_months[i] {
			t.Errorf("history[%d].YearMonth = %q, want %q", i, item.YearMonth, expected_months[i])
		}
		if item.Budget != expected_history_budget {
			t.Errorf("history[%d].Budget (%s) = %d, want %d (should use base income, not actual recorded income)",
				i, item.YearMonth, item.Budget, expected_history_budget)
		}
	}
}

// TestBudgetSummary_NoBaseIncome_VariableBudgetIsNegative verifies the
// zero-base-income case: GetBaseIncome returns 0 when not set, so the variable budget
// becomes negative when deductions exist.
func TestBudgetSummary_NoBaseIncome_VariableBudgetIsNegative(t *testing.T) {
	ctx := context.Background()
	u := createTestUser(t, "bs_no_base_income@test.example")

	// No setBaseIncome call — base income defaults to 0.
	addRecurringFixed(t, u.UserID, 10000)

	summary, err := testRepo.GetBudgetSummary(ctx, u.UserID, "2026-02")
	if err != nil {
		t.Fatalf("GetBudgetSummary: %v", err)
	}

	// variable_budget = 0 - 10000 - 0 - 0 = -10000
	if summary.VariableBudget != -10000 {
		t.Errorf("variable_budget with no base income = %d, want -10000", summary.VariableBudget)
	}
}

// TestBudgetSummary_WithSavingsGoal_FullFormula verifies the full formula:
// variable_budget = base_income - recurring - savings_monthly - savings_allocated
// and that adding more income records does not change the budget.
func TestBudgetSummary_WithSavingsGoal_FullFormula(t *testing.T) {
	ctx := context.Background()
	u := createTestUser(t, "bs_full_formula@test.example")

	const base_income int32 = 350000
	const recurring int32 = 60000
	const savings_monthly int32 = 40000
	const expected = base_income - recurring - savings_monthly // 250000

	setBaseIncome(t, u.UserID, base_income)
	addRecurringFixed(t, u.UserID, recurring)
	addSavingsGoalForUser(t, u.UserID, savings_monthly)

	// Add income records that differ from base_income to confirm they don't affect the budget.
	addIncomeForMonth(t, u.UserID, "2026-01", 500000)

	summary, err := testRepo.GetBudgetSummary(ctx, u.UserID, "2026-01")
	if err != nil {
		t.Fatalf("GetBudgetSummary: %v", err)
	}

	if summary.VariableBudget != expected {
		t.Errorf("variable_budget = %d, want %d (base_income=%d - recurring=%d - savings=%d)",
			summary.VariableBudget, expected, base_income, recurring, savings_monthly)
	}

	// IncomeTotal should reflect actual recorded income (display field).
	if summary.IncomeTotal != 500000 {
		t.Errorf("income_total = %d, want 500000", summary.IncomeTotal)
	}

	// RecurringTotal and SavingsTotal should be populated.
	if summary.RecurringTotal != recurring {
		t.Errorf("recurring_total = %d, want %d", summary.RecurringTotal, recurring)
	}
	if summary.SavingsTotal != savings_monthly {
		t.Errorf("savings_total = %d, want %d", summary.SavingsTotal, savings_monthly)
	}

	// Adding another income record must NOT change variable_budget.
	addIncomeForMonth(t, u.UserID, "2026-01", 100000)

	summary2, err := testRepo.GetBudgetSummary(ctx, u.UserID, "2026-01")
	if err != nil {
		t.Fatalf("GetBudgetSummary after second income record: %v", err)
	}
	if summary2.VariableBudget != expected {
		t.Errorf("variable_budget after second income record = %d, want %d (must be stable)",
			summary2.VariableBudget, expected)
	}
	// IncomeTotal should now be the sum of both records.
	if summary2.IncomeTotal != 600000 {
		t.Errorf("income_total after second income record = %d, want 600000", summary2.IncomeTotal)
	}
}
