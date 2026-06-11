//go:build integration

package repository_test

import (
	"context"
	"testing"
	"time"

	"github.com/utibori-jp/atoikura/backend/internal/repository"
)

func TestJournalEntries_Create(t *testing.T) {
	ctx := context.Background()
	u := createTestUser(t, "je_create@test.example")

	item := "ランチ"
	note := "test note"
	date := time.Date(2025, 6, 15, 0, 0, 0, 0, time.UTC)

	got, err := testRepo.CreateJournalEntry(ctx, repository.CreateJournalEntryParams{
		TransactionDate: date,
		Item:            &item,
		Amount:          1200,
		CategoryID:      u.CategoryID,
		UserID:          int32(u.UserID),
		IsExcluded:      false,
		Note:            &note,
	})
	if err != nil {
		t.Fatalf("CreateJournalEntry: %v", err)
	}
	if got.ID == 0 {
		t.Error("id is 0")
	}
	if got.Amount != 1200 {
		t.Errorf("amount = %d, want 1200", got.Amount)
	}
	if got.TransactionDate != "2025-06-15" {
		t.Errorf("transaction_date = %q, want 2025-06-15", got.TransactionDate)
	}
	if got.Item == nil || *got.Item != item {
		t.Errorf("item = %v, want %q", got.Item, item)
	}
	if got.CategoryID != u.CategoryID {
		t.Errorf("category_id = %d, want %d", got.CategoryID, u.CategoryID)
	}
	if got.CategoryName == "" {
		t.Error("category_name is empty")
	}
	if got.GroupName == "" {
		t.Error("group_name is empty")
	}
}

func TestJournalEntries_ListByMonth_Filtering(t *testing.T) {
	ctx := context.Background()
	u := createTestUser(t, "je_list@test.example")

	june := time.Date(2025, 6, 1, 0, 0, 0, 0, time.UTC)

	// Two entries in June, one in July
	for _, d := range []time.Time{
		time.Date(2025, 6, 10, 0, 0, 0, 0, time.UTC),
		time.Date(2025, 6, 20, 0, 0, 0, 0, time.UTC),
		time.Date(2025, 7, 5, 0, 0, 0, 0, time.UTC),
	} {
		if _, err := testRepo.CreateJournalEntry(ctx, repository.CreateJournalEntryParams{
			TransactionDate: d,
			Amount:          500,
			CategoryID:      u.CategoryID,
			UserID:          int32(u.UserID),
		}); err != nil {
			t.Fatalf("create entry: %v", err)
		}
	}

	june_entries, err := testRepo.ListJournalEntriesByMonth(ctx, u.UserID, june)
	if err != nil {
		t.Fatalf("ListJournalEntriesByMonth June: %v", err)
	}
	if len(june_entries) != 2 {
		t.Errorf("june entries = %d, want 2", len(june_entries))
	}

	july := time.Date(2025, 7, 1, 0, 0, 0, 0, time.UTC)
	july_entries, err := testRepo.ListJournalEntriesByMonth(ctx, u.UserID, july)
	if err != nil {
		t.Fatalf("ListJournalEntriesByMonth July: %v", err)
	}
	if len(july_entries) != 1 {
		t.Errorf("july entries = %d, want 1", len(july_entries))
	}
}

func TestJournalEntries_Update(t *testing.T) {
	ctx := context.Background()
	u := createTestUser(t, "je_update@test.example")

	created, err := testRepo.CreateJournalEntry(ctx, repository.CreateJournalEntryParams{
		TransactionDate: time.Date(2025, 6, 1, 0, 0, 0, 0, time.UTC),
		Amount:          500,
		CategoryID:      u.CategoryID,
		UserID:          int32(u.UserID),
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	updated, err := testRepo.UpdateJournalEntry(ctx, repository.UpdateJournalEntryParams{
		ID:              created.ID,
		TransactionDate: time.Date(2025, 6, 2, 0, 0, 0, 0, time.UTC),
		Amount:          999,
		CategoryID:      u.CategoryID,
		UserID:          int32(u.UserID),
	})
	if err != nil {
		t.Fatalf("UpdateJournalEntry: %v", err)
	}
	if updated == nil {
		t.Fatal("updated is nil")
	}
	if updated.Amount != 999 {
		t.Errorf("amount = %d, want 999", updated.Amount)
	}
	if updated.TransactionDate != "2025-06-02" {
		t.Errorf("transaction_date = %q, want 2025-06-02", updated.TransactionDate)
	}
}

func TestJournalEntries_Update_NotFound(t *testing.T) {
	ctx := context.Background()
	u := createTestUser(t, "je_upnf@test.example")

	got, err := testRepo.UpdateJournalEntry(ctx, repository.UpdateJournalEntryParams{
		ID:              999999,
		TransactionDate: time.Date(2025, 6, 1, 0, 0, 0, 0, time.UTC),
		Amount:          100,
		CategoryID:      u.CategoryID,
		UserID:          int32(u.UserID),
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != nil {
		t.Error("expected nil for non-existent entry")
	}
}

func TestJournalEntries_Delete(t *testing.T) {
	ctx := context.Background()
	u := createTestUser(t, "je_delete@test.example")

	created, err := testRepo.CreateJournalEntry(ctx, repository.CreateJournalEntryParams{
		TransactionDate: time.Date(2025, 6, 1, 0, 0, 0, 0, time.UTC),
		Amount:          800,
		CategoryID:      u.CategoryID,
		UserID:          int32(u.UserID),
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	deleted, err := testRepo.DeleteJournalEntry(ctx, int64(created.ID), u.UserID)
	if err != nil {
		t.Fatalf("DeleteJournalEntry: %v", err)
	}
	if !deleted {
		t.Error("expected deleted=true")
	}

	// Verify entry is gone
	entries, err := testRepo.ListJournalEntriesByMonth(ctx, u.UserID,
		time.Date(2025, 6, 1, 0, 0, 0, 0, time.UTC))
	if err != nil {
		t.Fatalf("list after delete: %v", err)
	}
	if len(entries) != 0 {
		t.Errorf("expected 0 entries after delete, got %d", len(entries))
	}
}

func TestJournalEntries_Delete_NotFound(t *testing.T) {
	ctx := context.Background()
	u := createTestUser(t, "je_delnf@test.example")

	deleted, err := testRepo.DeleteJournalEntry(ctx, 999999, u.UserID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if deleted {
		t.Error("expected deleted=false for non-existent entry")
	}
}
