package handler

import (
	"context"
	"net/http"
	"testing"

	"github.com/utibori-jp/atoikura/backend/internal/repository"
	"github.com/utibori-jp/atoikura/backend/internal/testutil"
)

type fakeBudgetRepo struct {
	getBudgetByUser func(context.Context, int64) (*repository.BudgetResult, error)
	upsertBudget    func(context.Context, int64, int32, *string, int32) (*repository.BudgetResult, error)
}

func (f *fakeBudgetRepo) GetBudgetByUser(ctx context.Context, user_id int64) (*repository.BudgetResult, error) {
	if f.getBudgetByUser != nil {
		return f.getBudgetByUser(ctx, user_id)
	}
	return &repository.BudgetResult{MonthlyBudget: 150000, GoalAmount: 0}, nil
}

func (f *fakeBudgetRepo) UpsertBudget(ctx context.Context, user_id int64, monthly_budget int32, goal_text *string, goal_amount int32) (*repository.BudgetResult, error) {
	if f.upsertBudget != nil {
		return f.upsertBudget(ctx, user_id, monthly_budget, goal_text, goal_amount)
	}
	return &repository.BudgetResult{MonthlyBudget: monthly_budget, GoalText: goal_text, GoalAmount: goal_amount}, nil
}

func TestGetBudgetsHandler(t *testing.T) {
	tests := []struct {
		name       string
		authed     bool
		repo       *fakeBudgetRepo
		wantStatus int
	}{
		{
			name:       "success",
			authed:     true,
			repo:       &fakeBudgetRepo{},
			wantStatus: http.StatusOK,
		},
		{
			name:       "unauthorized",
			authed:     false,
			repo:       &fakeBudgetRepo{},
			wantStatus: http.StatusUnauthorized,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			r := testutil.NewRequest(t, http.MethodGet, "/budgets", nil)
			if tc.authed {
				r = authCtx(r, 1)
			}
			w := testutil.NewRecorder()
			GetBudgetsHandler(tc.repo)(w, r)
			testutil.AssertStatus(t, w, tc.wantStatus)
		})
	}
}

func TestUpdateBudgetsHandler(t *testing.T) {
	goalText := "貯金目標"

	tests := []struct {
		name       string
		authed     bool
		body       any
		repo       *fakeBudgetRepo
		wantStatus int
	}{
		{
			name:       "success with all fields",
			authed:     true,
			body:       map[string]any{"monthly_budget": 200000, "goal_text": goalText, "goal_amount": 500000},
			repo:       &fakeBudgetRepo{},
			wantStatus: http.StatusOK,
		},
		{
			name:       "success with partial update",
			authed:     true,
			body:       map[string]any{"monthly_budget": 100000},
			repo:       &fakeBudgetRepo{},
			wantStatus: http.StatusOK,
		},
		{
			name:       "success with empty body",
			authed:     true,
			body:       map[string]any{},
			repo:       &fakeBudgetRepo{},
			wantStatus: http.StatusOK,
		},
		{
			name:       "unauthorized",
			authed:     false,
			body:       map[string]any{"monthly_budget": 100000},
			repo:       &fakeBudgetRepo{},
			wantStatus: http.StatusUnauthorized,
		},
		{
			name:       "bad request when monthly_budget is negative",
			authed:     true,
			body:       map[string]any{"monthly_budget": -1},
			repo:       &fakeBudgetRepo{},
			wantStatus: http.StatusBadRequest,
		},
		{
			name:       "bad request when goal_amount is negative",
			authed:     true,
			body:       map[string]any{"goal_amount": -100},
			repo:       &fakeBudgetRepo{},
			wantStatus: http.StatusBadRequest,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			r := testutil.NewRequest(t, http.MethodPut, "/budgets", tc.body)
			if tc.authed {
				r = authCtx(r, 1)
			}
			w := testutil.NewRecorder()
			UpdateBudgetsHandler(tc.repo)(w, r)
			testutil.AssertStatus(t, w, tc.wantStatus)
		})
	}
}
