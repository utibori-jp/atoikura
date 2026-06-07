package handler

import (
	"context"
	"net/http"
	"testing"
	"time"

	"github.com/utibori-jp/atoikura/backend/internal/repository"
	"github.com/utibori-jp/atoikura/backend/internal/testutil"
)

type fakeExpenseRepo struct {
	listMonthlyBreakdown         func(context.Context, int64, time.Time) ([]repository.MonthlyBreakdownItem, error)
	listDailyExpenseSumsForMonth func(context.Context, int64, time.Time) ([]repository.DailyExpenseSum, error)
	getBudgetByUser              func(context.Context, int64) (*repository.BudgetResult, error)
}

func (f *fakeExpenseRepo) ListMonthlyBreakdown(ctx context.Context, user_id int64, first_day time.Time) ([]repository.MonthlyBreakdownItem, error) {
	if f.listMonthlyBreakdown != nil {
		return f.listMonthlyBreakdown(ctx, user_id, first_day)
	}
	return []repository.MonthlyBreakdownItem{}, nil
}

func (f *fakeExpenseRepo) ListDailyExpenseSumsForMonth(ctx context.Context, user_id int64, first_day time.Time) ([]repository.DailyExpenseSum, error) {
	if f.listDailyExpenseSumsForMonth != nil {
		return f.listDailyExpenseSumsForMonth(ctx, user_id, first_day)
	}
	return []repository.DailyExpenseSum{}, nil
}

func (f *fakeExpenseRepo) GetBudgetByUser(ctx context.Context, user_id int64) (*repository.BudgetResult, error) {
	if f.getBudgetByUser != nil {
		return f.getBudgetByUser(ctx, user_id)
	}
	return &repository.BudgetResult{MonthlyBudget: 150000}, nil
}

func TestGetMonthlyBreakdownHandler(t *testing.T) {
	tests := []struct {
		name       string
		authed     bool
		yearMonth  string
		repo       *fakeExpenseRepo
		wantStatus int
	}{
		{
			name:       "success",
			authed:     true,
			yearMonth:  "2026-06",
			repo:       &fakeExpenseRepo{},
			wantStatus: http.StatusOK,
		},
		{
			name:       "unauthorized",
			authed:     false,
			yearMonth:  "2026-06",
			repo:       &fakeExpenseRepo{},
			wantStatus: http.StatusUnauthorized,
		},
		{
			name:       "bad request when year_month missing",
			authed:     true,
			yearMonth:  "",
			repo:       &fakeExpenseRepo{},
			wantStatus: http.StatusBadRequest,
		},
		{
			name:       "bad request when year_month invalid",
			authed:     true,
			yearMonth:  "2026-6",
			repo:       &fakeExpenseRepo{},
			wantStatus: http.StatusBadRequest,
		},
		{
			name:      "returns breakdown items",
			authed:    true,
			yearMonth: "2026-06",
			repo: &fakeExpenseRepo{
				listMonthlyBreakdown: func(_ context.Context, _ int64, _ time.Time) ([]repository.MonthlyBreakdownItem, error) {
					return []repository.MonthlyBreakdownItem{
						{CategoryID: 1, CategoryName: "スーパー", Total: 10000},
					}, nil
				},
			},
			wantStatus: http.StatusOK,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			path := "/expenses/monthly-breakdown"
			if tc.yearMonth != "" {
				path += "?year_month=" + tc.yearMonth
			}
			r := testutil.NewRequest(t, http.MethodGet, path, nil)
			if tc.authed {
				r = authCtx(r, 1)
			}
			w := testutil.NewRecorder()
			GetMonthlyBreakdownHandler(tc.repo)(w, r)
			testutil.AssertStatus(t, w, tc.wantStatus)
		})
	}
}

func TestGetDailyCumulativeHandler(t *testing.T) {
	tests := []struct {
		name       string
		authed     bool
		yearMonth  string
		repo       *fakeExpenseRepo
		wantStatus int
	}{
		{
			name:       "success with explicit year_month",
			authed:     true,
			yearMonth:  "2026-06",
			repo:       &fakeExpenseRepo{},
			wantStatus: http.StatusOK,
		},
		{
			name:       "success with no year_month defaults to current month",
			authed:     true,
			yearMonth:  "",
			repo:       &fakeExpenseRepo{},
			wantStatus: http.StatusOK,
		},
		{
			name:       "unauthorized",
			authed:     false,
			yearMonth:  "2026-06",
			repo:       &fakeExpenseRepo{},
			wantStatus: http.StatusUnauthorized,
		},
		{
			name:       "bad request when year_month invalid",
			authed:     true,
			yearMonth:  "invalid",
			repo:       &fakeExpenseRepo{},
			wantStatus: http.StatusBadRequest,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			path := "/expenses/daily-cumulative"
			if tc.yearMonth != "" {
				path += "?year_month=" + tc.yearMonth
			}
			r := testutil.NewRequest(t, http.MethodGet, path, nil)
			if tc.authed {
				r = authCtx(r, 1)
			}
			w := testutil.NewRecorder()
			GetDailyCumulativeHandler(tc.repo)(w, r)
			testutil.AssertStatus(t, w, tc.wantStatus)
		})
	}
}
