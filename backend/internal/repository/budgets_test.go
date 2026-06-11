//go:build integration

package repository_test

import (
	"context"
	"testing"
)

func TestBudgets_GetByUser_NoRecord(t *testing.T) {
	ctx := context.Background()
	u := createTestUser(t, "b_empty@test.example")

	got, err := testRepo.GetBudgetByUser(ctx, u.UserID)
	if err != nil {
		t.Fatalf("GetBudgetByUser: %v", err)
	}
	if got.MonthlyBudget != 0 {
		t.Errorf("monthly_budget = %d, want 0", got.MonthlyBudget)
	}
	if got.GoalAmount != 0 {
		t.Errorf("goal_amount = %d, want 0", got.GoalAmount)
	}
	if got.GoalText != nil {
		t.Errorf("goal_text = %v, want nil", got.GoalText)
	}
}

func TestBudgets_Upsert_Create(t *testing.T) {
	ctx := context.Background()
	u := createTestUser(t, "b_create@test.example")

	goal := "旅行貯金"
	got, err := testRepo.UpsertBudget(ctx, u.UserID, 100000, &goal, 500000)
	if err != nil {
		t.Fatalf("UpsertBudget: %v", err)
	}
	if got.MonthlyBudget != 100000 {
		t.Errorf("monthly_budget = %d, want 100000", got.MonthlyBudget)
	}
	if got.GoalText == nil || *got.GoalText != goal {
		t.Errorf("goal_text = %v, want %q", got.GoalText, goal)
	}
	if got.GoalAmount != 500000 {
		t.Errorf("goal_amount = %d, want 500000", got.GoalAmount)
	}
}

func TestBudgets_Upsert_Update(t *testing.T) {
	ctx := context.Background()
	u := createTestUser(t, "b_update@test.example")

	if _, err := testRepo.UpsertBudget(ctx, u.UserID, 80000, nil, 0); err != nil {
		t.Fatalf("first upsert: %v", err)
	}

	got, err := testRepo.UpsertBudget(ctx, u.UserID, 120000, nil, 0)
	if err != nil {
		t.Fatalf("second upsert: %v", err)
	}
	if got.MonthlyBudget != 120000 {
		t.Errorf("monthly_budget after update = %d, want 120000", got.MonthlyBudget)
	}
}

func TestBudgets_GetAfterUpsert(t *testing.T) {
	ctx := context.Background()
	u := createTestUser(t, "b_getafter@test.example")

	goal := "緊急予備"
	if _, err := testRepo.UpsertBudget(ctx, u.UserID, 50000, &goal, 300000); err != nil {
		t.Fatalf("upsert: %v", err)
	}

	got, err := testRepo.GetBudgetByUser(ctx, u.UserID)
	if err != nil {
		t.Fatalf("GetBudgetByUser: %v", err)
	}
	if got.MonthlyBudget != 50000 {
		t.Errorf("monthly_budget = %d, want 50000", got.MonthlyBudget)
	}
	if got.GoalText == nil || *got.GoalText != goal {
		t.Errorf("goal_text = %v, want %q", got.GoalText, goal)
	}
}
