package handler

import (
	"context"
	"net/http"
	"testing"

	"github.com/utibori-jp/atoikura/backend/internal/repository"
	"github.com/utibori-jp/atoikura/backend/internal/testutil"
)

type fakeBudgetSummaryRepo struct {
	getBudgetSummary       func(context.Context, int64, string) (*repository.BudgetSummaryResult, error)
	ensureAutoPostingCalls []string
}

func (f *fakeBudgetSummaryRepo) EnsureMonthlyAutoPosting(ctx context.Context, user_id int64, year_month string) (*repository.MonthlyAutoPostingResult, error) {
	f.ensureAutoPostingCalls = append(f.ensureAutoPostingCalls, year_month)
	return &repository.MonthlyAutoPostingResult{}, nil
}

func (f *fakeBudgetSummaryRepo) GetBudgetSummary(ctx context.Context, user_id int64, year_month string) (*repository.BudgetSummaryResult, error) {
	if f.getBudgetSummary != nil {
		return f.getBudgetSummary(ctx, user_id, year_month)
	}
	return &repository.BudgetSummaryResult{
		IncomeTotal:    323200,
		RecurringTotal: 96000,
		SavingsTotal:   45000,
		VariableBudget: 182200,
		DailyBudget:    6073,
		DaysRemaining:  12,
		History: []repository.BudgetHistoryItem{
			{YearMonth: "2026-04", Budget: 142000, Actual: 131200},
			{YearMonth: "2026-05", Budget: 178000, Actual: 182400},
			{YearMonth: "2026-06", Budget: 182200, Actual: 47200},
		},
	}, nil
}

func TestGetBudgetSummaryHandler(t *testing.T) {
	tests := []struct {
		name       string
		authed     bool
		yearMonth  string
		wantStatus int
	}{
		{name: "success", authed: true, yearMonth: "2026-06", wantStatus: http.StatusOK},
		{name: "unauthorized", authed: false, yearMonth: "2026-06", wantStatus: http.StatusUnauthorized},
		{name: "bad request when year_month missing", authed: true, yearMonth: "", wantStatus: http.StatusBadRequest},
		{name: "bad request when year_month invalid", authed: true, yearMonth: "2026/06", wantStatus: http.StatusBadRequest},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			path := "/budget-summary"
			if tc.yearMonth != "" {
				path += "?year_month=" + tc.yearMonth
			}
			r := testutil.NewRequest(t, http.MethodGet, path, nil)
			if tc.authed {
				r = authCtx(r, 1)
			}
			w := testutil.NewRecorder()
			GetBudgetSummaryHandler(&fakeBudgetSummaryRepo{})(w, r)
			testutil.AssertStatus(t, w, tc.wantStatus)
		})
	}
}

// TestGetBudgetSummaryHandler_TriggersAutoPosting verifies that a successful
// budget-summary read lazily triggers monthly auto-posting for the requested month.
func TestGetBudgetSummaryHandler_TriggersAutoPosting(t *testing.T) {
	repo := &fakeBudgetSummaryRepo{}
	r := authCtx(testutil.NewRequest(t, http.MethodGet, "/budget-summary?year_month=2026-06", nil), 1)
	w := testutil.NewRecorder()

	GetBudgetSummaryHandler(repo)(w, r)

	testutil.AssertStatus(t, w, http.StatusOK)
	if len(repo.ensureAutoPostingCalls) != 1 || repo.ensureAutoPostingCalls[0] != "2026-06" {
		t.Fatalf("expected auto-posting triggered once for 2026-06, got %v", repo.ensureAutoPostingCalls)
	}
}

// TestGetBudgetSummaryHandler_SkipsAutoPostingOnBadRequest verifies that auto-posting
// is not triggered when the request is rejected for an invalid year_month.
func TestGetBudgetSummaryHandler_SkipsAutoPostingOnBadRequest(t *testing.T) {
	repo := &fakeBudgetSummaryRepo{}
	r := authCtx(testutil.NewRequest(t, http.MethodGet, "/budget-summary?year_month=2026/06", nil), 1)
	w := testutil.NewRecorder()

	GetBudgetSummaryHandler(repo)(w, r)

	testutil.AssertStatus(t, w, http.StatusBadRequest)
	if len(repo.ensureAutoPostingCalls) != 0 {
		t.Fatalf("expected no auto-posting on bad request, got %v", repo.ensureAutoPostingCalls)
	}
}
