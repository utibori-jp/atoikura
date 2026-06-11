//go:build integration

package repository_test

import (
	"context"
	"testing"
	"time"

	"github.com/utibori-jp/atoikura/backend/internal/repository"
)

func TestExpenses_ListMonthlyBreakdown_Empty(t *testing.T) {
	ctx := context.Background()
	u := createTestUser(t, "exp_empty@test.example")

	result, err := testRepo.ListMonthlyBreakdown(ctx, u.UserID,
		time.Date(2025, 6, 1, 0, 0, 0, 0, time.UTC))
	if err != nil {
		t.Fatalf("ListMonthlyBreakdown: %v", err)
	}
	if len(result) != 0 {
		t.Errorf("expected empty, got %d items", len(result))
	}
}

func TestExpenses_ListMonthlyBreakdown_WithEntries(t *testing.T) {
	ctx := context.Background()
	u := createTestUser(t, "exp_bkdwn@test.example")

	june_date := time.Date(2025, 6, 15, 0, 0, 0, 0, time.UTC)
	for _, amount := range []int32{1000, 2000, 3000} {
		if _, err := testRepo.CreateJournalEntry(ctx, repository.CreateJournalEntryParams{
			TransactionDate: june_date,
			Amount:          amount,
			CategoryID:      u.CategoryID,
			UserID:          int32(u.UserID),
		}); err != nil {
			t.Fatalf("create entry: %v", err)
		}
	}

	result, err := testRepo.ListMonthlyBreakdown(ctx, u.UserID,
		time.Date(2025, 6, 1, 0, 0, 0, 0, time.UTC))
	if err != nil {
		t.Fatalf("ListMonthlyBreakdown: %v", err)
	}
	if len(result) == 0 {
		t.Fatal("expected non-empty result")
	}

	var total int32
	for _, item := range result {
		total += item.Total
	}
	if total != 6000 {
		t.Errorf("total = %d, want 6000", total)
	}
}

func TestExpenses_ListMonthlyBreakdown_OtherMonthExcluded(t *testing.T) {
	ctx := context.Background()
	u := createTestUser(t, "exp_bkdwn_month@test.example")

	// Entry in May — should not appear in June breakdown
	if _, err := testRepo.CreateJournalEntry(ctx, repository.CreateJournalEntryParams{
		TransactionDate: time.Date(2025, 5, 20, 0, 0, 0, 0, time.UTC),
		Amount:          9999,
		CategoryID:      u.CategoryID,
		UserID:          int32(u.UserID),
	}); err != nil {
		t.Fatalf("create entry: %v", err)
	}

	result, err := testRepo.ListMonthlyBreakdown(ctx, u.UserID,
		time.Date(2025, 6, 1, 0, 0, 0, 0, time.UTC))
	if err != nil {
		t.Fatalf("ListMonthlyBreakdown: %v", err)
	}
	if len(result) != 0 {
		t.Errorf("expected empty for June, got %d items", len(result))
	}
}

func TestExpenses_ListDailySums_Empty(t *testing.T) {
	ctx := context.Background()
	u := createTestUser(t, "exp_daily_e@test.example")

	result, err := testRepo.ListDailyExpenseSumsForMonth(ctx, u.UserID,
		time.Date(2025, 6, 1, 0, 0, 0, 0, time.UTC))
	if err != nil {
		t.Fatalf("ListDailyExpenseSumsForMonth: %v", err)
	}
	if len(result) != 0 {
		t.Errorf("expected empty, got %d items", len(result))
	}
}

func TestExpenses_ListDailySums_WithEntries(t *testing.T) {
	ctx := context.Background()
	u := createTestUser(t, "exp_daily@test.example")

	// Two entries on the same day in June
	june_day := time.Date(2025, 6, 10, 0, 0, 0, 0, time.UTC)
	for _, amount := range []int32{500, 800} {
		if _, err := testRepo.CreateJournalEntry(ctx, repository.CreateJournalEntryParams{
			TransactionDate: june_day,
			Amount:          amount,
			CategoryID:      u.CategoryID,
			UserID:          int32(u.UserID),
		}); err != nil {
			t.Fatalf("create entry: %v", err)
		}
	}

	result, err := testRepo.ListDailyExpenseSumsForMonth(ctx, u.UserID,
		time.Date(2025, 6, 1, 0, 0, 0, 0, time.UTC))
	if err != nil {
		t.Fatalf("ListDailyExpenseSumsForMonth: %v", err)
	}
	if len(result) == 0 {
		t.Fatal("expected non-empty result")
	}

	var total int32
	for _, item := range result {
		total += item.DailySum
	}
	if total != 1300 {
		t.Errorf("total daily sum = %d, want 1300", total)
	}
}

func TestExpenses_ListDailySums_ExcludedEntriesIgnored(t *testing.T) {
	ctx := context.Background()
	u := createTestUser(t, "exp_daily_excl@test.example")

	june_day := time.Date(2025, 6, 5, 0, 0, 0, 0, time.UTC)
	// One normal, one excluded
	if _, err := testRepo.CreateJournalEntry(ctx, repository.CreateJournalEntryParams{
		TransactionDate: june_day,
		Amount:          1000,
		CategoryID:      u.CategoryID,
		UserID:          int32(u.UserID),
		IsExcluded:      false,
	}); err != nil {
		t.Fatalf("create normal entry: %v", err)
	}
	if _, err := testRepo.CreateJournalEntry(ctx, repository.CreateJournalEntryParams{
		TransactionDate: june_day,
		Amount:          9999,
		CategoryID:      u.CategoryID,
		UserID:          int32(u.UserID),
		IsExcluded:      true,
	}); err != nil {
		t.Fatalf("create excluded entry: %v", err)
	}

	result, err := testRepo.ListDailyExpenseSumsForMonth(ctx, u.UserID,
		time.Date(2025, 6, 1, 0, 0, 0, 0, time.UTC))
	if err != nil {
		t.Fatalf("ListDailyExpenseSumsForMonth: %v", err)
	}

	var total int32
	for _, item := range result {
		total += item.DailySum
	}
	if total != 1000 {
		t.Errorf("total = %d, want 1000 (excluded entry must not be counted)", total)
	}
}
