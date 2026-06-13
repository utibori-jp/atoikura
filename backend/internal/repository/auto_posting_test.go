//go:build integration

package repository_test

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/utibori-jp/atoikura/backend/internal/repository"
)

func int32Ptr(v int32) *int32 { return &v }

// countLinkedEntries returns how many journal entries link the given recurring expense
// within year_month for the user.
func countLinkedEntries(t *testing.T, user_id int64, recurring_id int32, year_month string) int {
	t.Helper()
	first_day, err := time.Parse("2006-01", year_month)
	if err != nil {
		t.Fatalf("parsing year_month %q: %v", year_month, err)
	}
	entries, err := testRepo.ListJournalEntriesByMonth(context.Background(), user_id, first_day)
	if err != nil {
		t.Fatalf("ListJournalEntriesByMonth: %v", err)
	}
	count := 0
	for _, e := range entries {
		if e.RecurringExpenseID != nil && *e.RecurringExpenseID == recurring_id {
			count++
		}
	}
	return count
}

func TestAutoPosting_FixedRecurringPostedOnce(t *testing.T) {
	ctx := context.Background()
	u := createTestUser(t, "ap_fixed@test.example")

	fixed, err := testRepo.CreateRecurringExpense(ctx, u.UserID, repository.CreateRecurringExpenseParams{
		Name:       "家賃",
		Emoji:      "🏠",
		BillingDay: 27,
		Amount:     int32Ptr(80000),
		Type:       "fixed",
		CategoryID: u.CategoryID,
	})
	if err != nil {
		t.Fatalf("CreateRecurringExpense fixed: %v", err)
	}

	result, err := testRepo.EnsureMonthlyAutoPosting(ctx, u.UserID, "2026-06")
	if err != nil {
		t.Fatalf("EnsureMonthlyAutoPosting: %v", err)
	}
	if result.RecurringPosted != 1 {
		t.Errorf("RecurringPosted = %d, want 1", result.RecurringPosted)
	}
	if got := countLinkedEntries(t, u.UserID, fixed.ID, "2026-06"); got != 1 {
		t.Fatalf("linked entries = %d, want 1", got)
	}

	// Second call in the same month is a no-op (idempotent).
	result2, err := testRepo.EnsureMonthlyAutoPosting(ctx, u.UserID, "2026-06")
	if err != nil {
		t.Fatalf("EnsureMonthlyAutoPosting second: %v", err)
	}
	if result2.RecurringPosted != 0 {
		t.Errorf("second RecurringPosted = %d, want 0", result2.RecurringPosted)
	}
	if got := countLinkedEntries(t, u.UserID, fixed.ID, "2026-06"); got != 1 {
		t.Errorf("linked entries after second call = %d, want 1", got)
	}
}

func TestAutoPosting_BillingDayClampedToMonthEnd(t *testing.T) {
	ctx := context.Background()
	u := createTestUser(t, "ap_clamp@test.example")

	fixed, err := testRepo.CreateRecurringExpense(ctx, u.UserID, repository.CreateRecurringExpenseParams{
		Name:       "サブスク",
		Emoji:      "📺",
		BillingDay: 31,
		Amount:     int32Ptr(1000),
		Type:       "fixed",
		CategoryID: u.CategoryID,
	})
	if err != nil {
		t.Fatalf("CreateRecurringExpense: %v", err)
	}

	// February 2026 has 28 days, so billing day 31 must clamp to the 28th.
	if _, err := testRepo.EnsureMonthlyAutoPosting(ctx, u.UserID, "2026-02"); err != nil {
		t.Fatalf("EnsureMonthlyAutoPosting: %v", err)
	}

	first_day, _ := time.Parse("2006-01", "2026-02")
	entries, err := testRepo.ListJournalEntriesByMonth(ctx, u.UserID, first_day)
	if err != nil {
		t.Fatalf("ListJournalEntriesByMonth: %v", err)
	}
	var found bool
	for _, e := range entries {
		if e.RecurringExpenseID != nil && *e.RecurringExpenseID == fixed.ID {
			found = true
			if e.TransactionDate != "2026-02-28" {
				t.Errorf("transaction_date = %q, want 2026-02-28", e.TransactionDate)
			}
		}
	}
	if !found {
		t.Fatal("expected a linked entry for the clamped billing day")
	}
}

func TestAutoPosting_VariableRecurringNotPosted(t *testing.T) {
	ctx := context.Background()
	u := createTestUser(t, "ap_variable@test.example")

	variable, err := testRepo.CreateRecurringExpense(ctx, u.UserID, repository.CreateRecurringExpenseParams{
		Name:       "電気代",
		Emoji:      "💡",
		BillingDay: 10,
		Amount:     int32Ptr(5000),
		Type:       "variable",
		CategoryID: u.CategoryID,
	})
	if err != nil {
		t.Fatalf("CreateRecurringExpense variable: %v", err)
	}

	result, err := testRepo.EnsureMonthlyAutoPosting(ctx, u.UserID, "2026-06")
	if err != nil {
		t.Fatalf("EnsureMonthlyAutoPosting: %v", err)
	}
	if result.RecurringPosted != 0 {
		t.Errorf("RecurringPosted = %d, want 0 (variable must use manual confirm)", result.RecurringPosted)
	}
	if got := countLinkedEntries(t, u.UserID, variable.ID, "2026-06"); got != 0 {
		t.Errorf("variable linked entries = %d, want 0", got)
	}
}

func TestAutoPosting_SavingsPostedOnceAndIdempotent(t *testing.T) {
	ctx := context.Background()
	u := createTestUser(t, "ap_savings@test.example")

	goal, err := testRepo.CreateSavingsGoal(ctx, u.UserID, repository.CreateSavingsGoalParams{
		Name:          "旅行",
		Emoji:         "✈️",
		MonthlyAmount: 30000,
		TargetAmount:  300000,
	})
	if err != nil {
		t.Fatalf("CreateSavingsGoal: %v", err)
	}

	result, err := testRepo.EnsureMonthlyAutoPosting(ctx, u.UserID, "2026-06")
	if err != nil {
		t.Fatalf("EnsureMonthlyAutoPosting: %v", err)
	}
	if result.SavingsPosted != 1 {
		t.Errorf("SavingsPosted = %d, want 1", result.SavingsPosted)
	}

	goals, err := testRepo.ListSavingsGoals(ctx, u.UserID)
	if err != nil {
		t.Fatalf("ListSavingsGoals: %v", err)
	}
	if len(goals) != 1 || goals[0].AccumulatedAmount != 30000 {
		t.Fatalf("accumulated after first post = %+v, want 30000", goals)
	}
	if goals[0].LastPostedMonth == nil || *goals[0].LastPostedMonth != "2026-06" {
		t.Errorf("last_posted_month = %v, want 2026-06", goals[0].LastPostedMonth)
	}
	_ = goal

	// Second call in same month must not add again.
	result2, err := testRepo.EnsureMonthlyAutoPosting(ctx, u.UserID, "2026-06")
	if err != nil {
		t.Fatalf("EnsureMonthlyAutoPosting second: %v", err)
	}
	if result2.SavingsPosted != 0 {
		t.Errorf("second SavingsPosted = %d, want 0", result2.SavingsPosted)
	}
	goals, _ = testRepo.ListSavingsGoals(ctx, u.UserID)
	if goals[0].AccumulatedAmount != 30000 {
		t.Errorf("accumulated after second call = %d, want 30000", goals[0].AccumulatedAmount)
	}

	// A new month posts again.
	result3, err := testRepo.EnsureMonthlyAutoPosting(ctx, u.UserID, "2026-07")
	if err != nil {
		t.Fatalf("EnsureMonthlyAutoPosting July: %v", err)
	}
	if result3.SavingsPosted != 1 {
		t.Errorf("July SavingsPosted = %d, want 1", result3.SavingsPosted)
	}
	goals, _ = testRepo.ListSavingsGoals(ctx, u.UserID)
	if goals[0].AccumulatedAmount != 60000 {
		t.Errorf("accumulated after July = %d, want 60000", goals[0].AccumulatedAmount)
	}
}

func TestAutoPosting_ZeroMonthlySavingsNotPosted(t *testing.T) {
	ctx := context.Background()
	u := createTestUser(t, "ap_savings_zero@test.example")

	if _, err := testRepo.CreateSavingsGoal(ctx, u.UserID, repository.CreateSavingsGoalParams{
		Name:          "未設定",
		Emoji:         "💰",
		MonthlyAmount: 0,
		TargetAmount:  100000,
	}); err != nil {
		t.Fatalf("CreateSavingsGoal: %v", err)
	}

	result, err := testRepo.EnsureMonthlyAutoPosting(ctx, u.UserID, "2026-06")
	if err != nil {
		t.Fatalf("EnsureMonthlyAutoPosting: %v", err)
	}
	if result.SavingsPosted != 0 {
		t.Errorf("SavingsPosted = %d, want 0 for zero monthly amount", result.SavingsPosted)
	}
}

// TestAutoPosting_ConcurrentFirstRequestsDoNotDoublePost runs several simultaneous
// first-requests of the month and asserts exactly one set of entries is posted.
func TestAutoPosting_ConcurrentFirstRequestsDoNotDoublePost(t *testing.T) {
	ctx := context.Background()
	u := createTestUser(t, "ap_concurrent@test.example")

	fixed, err := testRepo.CreateRecurringExpense(ctx, u.UserID, repository.CreateRecurringExpenseParams{
		Name:       "保険",
		Emoji:      "🛡️",
		BillingDay: 5,
		Amount:     int32Ptr(12000),
		Type:       "fixed",
		CategoryID: u.CategoryID,
	})
	if err != nil {
		t.Fatalf("CreateRecurringExpense: %v", err)
	}
	if _, err := testRepo.CreateSavingsGoal(ctx, u.UserID, repository.CreateSavingsGoalParams{
		Name:          "貯金",
		Emoji:         "💰",
		MonthlyAmount: 20000,
		TargetAmount:  240000,
	}); err != nil {
		t.Fatalf("CreateSavingsGoal: %v", err)
	}

	const concurrency = 8
	var wg sync.WaitGroup
	var mu sync.Mutex
	var total_recurring, total_savings int64
	wg.Add(concurrency)
	for i := 0; i < concurrency; i++ {
		go func() {
			defer wg.Done()
			res, err := testRepo.EnsureMonthlyAutoPosting(ctx, u.UserID, "2026-06")
			if err != nil {
				t.Errorf("concurrent EnsureMonthlyAutoPosting: %v", err)
				return
			}
			mu.Lock()
			total_recurring += res.RecurringPosted
			total_savings += res.SavingsPosted
			mu.Unlock()
		}()
	}
	wg.Wait()

	if total_recurring != 1 {
		t.Errorf("total recurring posted across goroutines = %d, want 1", total_recurring)
	}
	if total_savings != 1 {
		t.Errorf("total savings posted across goroutines = %d, want 1", total_savings)
	}
	if got := countLinkedEntries(t, u.UserID, fixed.ID, "2026-06"); got != 1 {
		t.Errorf("linked recurring entries = %d, want 1", got)
	}
	goals, _ := testRepo.ListSavingsGoals(ctx, u.UserID)
	if goals[0].AccumulatedAmount != 20000 {
		t.Errorf("accumulated = %d, want 20000 (no double post)", goals[0].AccumulatedAmount)
	}
}
