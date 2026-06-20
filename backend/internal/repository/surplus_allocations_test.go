//go:build integration

package repository_test

import (
	"context"
	"testing"

	"github.com/utibori-jp/atoikura/backend/internal/repository"
)

// createTestSavingsGoal is a helper to create a savings goal for integration tests.
func createTestSavingsGoal(t *testing.T, user_id int64, monthly_amount int32) repository.SavingsGoalResult {
	t.Helper()
	goal, err := testRepo.CreateSavingsGoal(context.Background(), user_id, repository.CreateSavingsGoalParams{
		Name:          "テスト貯金",
		Emoji:         "💰",
		MonthlyAmount: monthly_amount,
		TargetAmount:  200000,
	})
	if err != nil {
		t.Fatalf("createTestSavingsGoal: %v", err)
	}
	return *goal
}

// addIncomeForMonth inserts an income record to establish income_total for a month.
func addIncomeForMonth(t *testing.T, user_id int64, year_month string, amount int32) {
	t.Helper()
	_, err := testPool.Exec(context.Background(),
		`INSERT INTO income_records (user_id, transaction_date, amount, name, income_type, emoji, note)
		 VALUES ($1, ($2||'-01')::date, $3, 'テスト収入', 'salary', '💴', '')`,
		user_id, year_month, amount,
	)
	if err != nil {
		t.Fatalf("addIncomeForMonth: %v", err)
	}
}

// setBaseIncome upserts the base income setting for the user.
func setBaseIncome(t *testing.T, user_id int64, amount int32) {
	t.Helper()
	_, err := testPool.Exec(context.Background(),
		`INSERT INTO base_income_settings (user_id, amount) VALUES ($1, $2)
		 ON CONFLICT (user_id) DO UPDATE SET amount = EXCLUDED.amount`,
		user_id, amount,
	)
	if err != nil {
		t.Fatalf("setBaseIncome: %v", err)
	}
}

func TestCreateSurplusAllocation_BudgetDestination(t *testing.T) {
	ctx := context.Background()
	u := createTestUser(t, "surplus_budget@test.example")

	// income_total = 300000, base_income = 250000 → surplus = 50000
	addIncomeForMonth(t, u.UserID, "2026-06", 300000)
	setBaseIncome(t, u.UserID, 250000)

	income_total, err := testRepo.GetIncomeTotal(ctx, u.UserID, "2026-06")
	if err != nil {
		t.Fatalf("GetIncomeTotal: %v", err)
	}
	base_income, err := testRepo.GetBaseIncome(ctx, u.UserID)
	if err != nil {
		t.Fatalf("GetBaseIncome: %v", err)
	}

	alloc, err := testRepo.CreateSurplusAllocation(ctx, u.UserID, income_total, base_income, repository.CreateSurplusAllocationParams{
		YearMonth:   "2026-06",
		Amount:      20000,
		Destination: "budget",
	})
	if err != nil {
		t.Fatalf("CreateSurplusAllocation budget: %v", err)
	}
	if alloc == nil {
		t.Fatal("got nil allocation, want non-nil")
	}
	if alloc.Destination != "budget" {
		t.Errorf("destination = %q, want budget", alloc.Destination)
	}
	if alloc.Amount != 20000 {
		t.Errorf("amount = %d, want 20000", alloc.Amount)
	}
	if alloc.SavingsGoalID != nil {
		t.Errorf("savings_goal_id = %v, want nil for budget", alloc.SavingsGoalID)
	}
}

func TestCreateSurplusAllocation_SavingsDestination_AccumulatedIncremented(t *testing.T) {
	ctx := context.Background()
	u := createTestUser(t, "surplus_savings@test.example")

	goal := createTestSavingsGoal(t, u.UserID, 0)
	if goal.AccumulatedAmount != 0 {
		t.Fatalf("initial accumulated_amount = %d, want 0", goal.AccumulatedAmount)
	}

	// income_total = 400000, base_income = 300000 → surplus = 100000
	addIncomeForMonth(t, u.UserID, "2026-07", 400000)
	setBaseIncome(t, u.UserID, 300000)

	income_total, err := testRepo.GetIncomeTotal(ctx, u.UserID, "2026-07")
	if err != nil {
		t.Fatalf("GetIncomeTotal: %v", err)
	}
	base_income, err := testRepo.GetBaseIncome(ctx, u.UserID)
	if err != nil {
		t.Fatalf("GetBaseIncome: %v", err)
	}

	goal_id := goal.ID
	alloc, err := testRepo.CreateSurplusAllocation(ctx, u.UserID, income_total, base_income, repository.CreateSurplusAllocationParams{
		YearMonth:     "2026-07",
		Amount:        30000,
		Destination:   "savings",
		SavingsGoalID: &goal_id,
	})
	if err != nil {
		t.Fatalf("CreateSurplusAllocation savings: %v", err)
	}
	if alloc == nil {
		t.Fatal("got nil allocation, want non-nil")
	}
	if alloc.Destination != "savings" {
		t.Errorf("destination = %q, want savings", alloc.Destination)
	}

	// Verify accumulated_amount was incremented.
	goals, err := testRepo.ListSavingsGoals(ctx, u.UserID)
	if err != nil {
		t.Fatalf("ListSavingsGoals: %v", err)
	}
	if len(goals) != 1 {
		t.Fatalf("got %d goals, want 1", len(goals))
	}
	if goals[0].AccumulatedAmount != 30000 {
		t.Errorf("accumulated_amount = %d, want 30000", goals[0].AccumulatedAmount)
	}
}

func TestCreateSurplusAllocation_ExceedsSurplus_Returns400Error(t *testing.T) {
	ctx := context.Background()
	u := createTestUser(t, "surplus_exceed@test.example")

	// income_total = 300000, base_income = 250000 → surplus = 50000
	addIncomeForMonth(t, u.UserID, "2026-08", 300000)
	setBaseIncome(t, u.UserID, 250000)

	income_total, err := testRepo.GetIncomeTotal(ctx, u.UserID, "2026-08")
	if err != nil {
		t.Fatalf("GetIncomeTotal: %v", err)
	}
	base_income, err := testRepo.GetBaseIncome(ctx, u.UserID)
	if err != nil {
		t.Fatalf("GetBaseIncome: %v", err)
	}

	_, err = testRepo.CreateSurplusAllocation(ctx, u.UserID, income_total, base_income, repository.CreateSurplusAllocationParams{
		YearMonth:   "2026-08",
		Amount:      60000, // exceeds surplus of 50000
		Destination: "budget",
	})
	if err == nil {
		t.Fatal("expected ErrSurplusExceeded, got nil")
	}
	if err != repository.ErrSurplusExceeded {
		t.Errorf("error = %v, want ErrSurplusExceeded", err)
	}
}

func TestCreateSurplusAllocation_ForeignSavingsGoal_ReturnsNil(t *testing.T) {
	ctx := context.Background()
	u := createTestUser(t, "surplus_foreign@test.example")
	other := createTestUser(t, "surplus_other_user@test.example")

	// Create a savings goal belonging to other user.
	other_goal := createTestSavingsGoal(t, other.UserID, 0)
	other_goal_id := other_goal.ID

	addIncomeForMonth(t, u.UserID, "2026-09", 400000)
	setBaseIncome(t, u.UserID, 200000)

	income_total, err := testRepo.GetIncomeTotal(ctx, u.UserID, "2026-09")
	if err != nil {
		t.Fatalf("GetIncomeTotal: %v", err)
	}
	base_income, err := testRepo.GetBaseIncome(ctx, u.UserID)
	if err != nil {
		t.Fatalf("GetBaseIncome: %v", err)
	}

	result, err := testRepo.CreateSurplusAllocation(ctx, u.UserID, income_total, base_income, repository.CreateSurplusAllocationParams{
		YearMonth:     "2026-09",
		Amount:        10000,
		Destination:   "savings",
		SavingsGoalID: &other_goal_id,
	})
	if err != nil {
		t.Fatalf("expected nil error for foreign goal, got: %v", err)
	}
	if result != nil {
		t.Fatalf("expected nil result for foreign goal (404), got %+v", result)
	}
}

func TestListSurplusAllocations(t *testing.T) {
	ctx := context.Background()
	u := createTestUser(t, "surplus_list@test.example")

	addIncomeForMonth(t, u.UserID, "2026-10", 500000)
	setBaseIncome(t, u.UserID, 300000)

	income_total, err := testRepo.GetIncomeTotal(ctx, u.UserID, "2026-10")
	if err != nil {
		t.Fatalf("GetIncomeTotal: %v", err)
	}
	base_income, err := testRepo.GetBaseIncome(ctx, u.UserID)
	if err != nil {
		t.Fatalf("GetBaseIncome: %v", err)
	}

	// Create two allocations.
	if _, err := testRepo.CreateSurplusAllocation(ctx, u.UserID, income_total, base_income, repository.CreateSurplusAllocationParams{
		YearMonth:   "2026-10",
		Amount:      10000,
		Destination: "budget",
	}); err != nil {
		t.Fatalf("first CreateSurplusAllocation: %v", err)
	}

	// Re-fetch income_total and base_income (same, but re-calling as handler does).
	if _, err := testRepo.CreateSurplusAllocation(ctx, u.UserID, income_total, base_income, repository.CreateSurplusAllocationParams{
		YearMonth:   "2026-10",
		Amount:      20000,
		Destination: "budget",
	}); err != nil {
		t.Fatalf("second CreateSurplusAllocation: %v", err)
	}

	allocations, err := testRepo.ListSurplusAllocations(ctx, u.UserID, "2026-10")
	if err != nil {
		t.Fatalf("ListSurplusAllocations: %v", err)
	}
	if len(allocations) != 2 {
		t.Errorf("got %d allocations, want 2", len(allocations))
	}

	// Verify another month returns empty.
	other, err := testRepo.ListSurplusAllocations(ctx, u.UserID, "2026-11")
	if err != nil {
		t.Fatalf("ListSurplusAllocations other month: %v", err)
	}
	if len(other) != 0 {
		t.Errorf("got %d allocations for other month, want 0", len(other))
	}
}

func TestBudgetSummary_VariableBudgetReducedBySavingsAllocation(t *testing.T) {
	ctx := context.Background()
	u := createTestUser(t, "surplus_budget_summary@test.example")

	// income_total = 350000, base_income = 250000 → surplus = 100000
	addIncomeForMonth(t, u.UserID, "2026-11", 350000)
	setBaseIncome(t, u.UserID, 250000)

	goal := createTestSavingsGoal(t, u.UserID, 0)
	goal_id := goal.ID

	// Get budget summary before any allocation.
	summaryBefore, err := testRepo.GetBudgetSummary(ctx, u.UserID, "2026-11")
	if err != nil {
		t.Fatalf("GetBudgetSummary before: %v", err)
	}
	budget_before := summaryBefore.VariableBudget

	// Allocate 25000 to savings.
	income_total, err := testRepo.GetIncomeTotal(ctx, u.UserID, "2026-11")
	if err != nil {
		t.Fatalf("GetIncomeTotal: %v", err)
	}
	base_income, err := testRepo.GetBaseIncome(ctx, u.UserID)
	if err != nil {
		t.Fatalf("GetBaseIncome: %v", err)
	}

	if _, err := testRepo.CreateSurplusAllocation(ctx, u.UserID, income_total, base_income, repository.CreateSurplusAllocationParams{
		YearMonth:     "2026-11",
		Amount:        25000,
		Destination:   "savings",
		SavingsGoalID: &goal_id,
	}); err != nil {
		t.Fatalf("CreateSurplusAllocation: %v", err)
	}

	// Get budget summary after allocation.
	summaryAfter, err := testRepo.GetBudgetSummary(ctx, u.UserID, "2026-11")
	if err != nil {
		t.Fatalf("GetBudgetSummary after: %v", err)
	}

	expected_budget := budget_before - 25000
	if summaryAfter.VariableBudget != expected_budget {
		t.Errorf("variable_budget after savings allocation = %d, want %d (reduced by 25000)",
			summaryAfter.VariableBudget, expected_budget)
	}
}

func TestBudgetSummary_VariableBudgetNotReducedByBudgetAllocation(t *testing.T) {
	ctx := context.Background()
	u := createTestUser(t, "surplus_budget_alloc@test.example")

	addIncomeForMonth(t, u.UserID, "2026-12", 350000)
	setBaseIncome(t, u.UserID, 250000)

	summaryBefore, err := testRepo.GetBudgetSummary(ctx, u.UserID, "2026-12")
	if err != nil {
		t.Fatalf("GetBudgetSummary before: %v", err)
	}
	budget_before := summaryBefore.VariableBudget

	income_total, err := testRepo.GetIncomeTotal(ctx, u.UserID, "2026-12")
	if err != nil {
		t.Fatalf("GetIncomeTotal: %v", err)
	}
	base_income, err := testRepo.GetBaseIncome(ctx, u.UserID)
	if err != nil {
		t.Fatalf("GetBaseIncome: %v", err)
	}

	// Allocate to budget destination — should NOT reduce variable_budget.
	if _, err := testRepo.CreateSurplusAllocation(ctx, u.UserID, income_total, base_income, repository.CreateSurplusAllocationParams{
		YearMonth:   "2026-12",
		Amount:      15000,
		Destination: "budget",
	}); err != nil {
		t.Fatalf("CreateSurplusAllocation budget: %v", err)
	}

	summaryAfter, err := testRepo.GetBudgetSummary(ctx, u.UserID, "2026-12")
	if err != nil {
		t.Fatalf("GetBudgetSummary after: %v", err)
	}

	if summaryAfter.VariableBudget != budget_before {
		t.Errorf("variable_budget after budget allocation = %d, want %d (unchanged)",
			summaryAfter.VariableBudget, budget_before)
	}
}
