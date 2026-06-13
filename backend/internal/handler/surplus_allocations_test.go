package handler

import (
	"context"
	"errors"
	"net/http"
	"testing"
	"time"

	"github.com/utibori-jp/atoikura/backend/internal/repository"
	"github.com/utibori-jp/atoikura/backend/internal/testutil"
)

type fakeSurplusAllocationRepo struct {
	listSurplusAllocations  func(context.Context, int64, string) ([]repository.SurplusAllocationResult, error)
	createSurplusAllocation func(context.Context, int64, int32, int32, repository.CreateSurplusAllocationParams) (*repository.SurplusAllocationResult, error)
	getIncomeTotal          func(context.Context, int64, string) (int32, error)
	getBaseIncome           func(context.Context, int64) (int32, error)
}

func (f *fakeSurplusAllocationRepo) ListSurplusAllocations(ctx context.Context, user_id int64, year_month string) ([]repository.SurplusAllocationResult, error) {
	if f.listSurplusAllocations != nil {
		return f.listSurplusAllocations(ctx, user_id, year_month)
	}
	return []repository.SurplusAllocationResult{}, nil
}

func (f *fakeSurplusAllocationRepo) CreateSurplusAllocation(ctx context.Context, user_id int64, income_total int32, base_income int32, params repository.CreateSurplusAllocationParams) (*repository.SurplusAllocationResult, error) {
	if f.createSurplusAllocation != nil {
		return f.createSurplusAllocation(ctx, user_id, income_total, base_income, params)
	}
	return &repository.SurplusAllocationResult{
		ID:            1,
		YearMonth:     params.YearMonth,
		Amount:        params.Amount,
		Destination:   params.Destination,
		SavingsGoalID: params.SavingsGoalID,
		CreatedAt:     time.Now(),
	}, nil
}

func (f *fakeSurplusAllocationRepo) GetIncomeTotal(ctx context.Context, user_id int64, year_month string) (int32, error) {
	if f.getIncomeTotal != nil {
		return f.getIncomeTotal(ctx, user_id, year_month)
	}
	return 300000, nil
}

func (f *fakeSurplusAllocationRepo) GetBaseIncome(ctx context.Context, user_id int64) (int32, error) {
	if f.getBaseIncome != nil {
		return f.getBaseIncome(ctx, user_id)
	}
	return 250000, nil
}

func TestListSurplusAllocationsHandler(t *testing.T) {
	tests := []struct {
		name       string
		authed     bool
		yearMonth  string
		wantStatus int
	}{
		{name: "success", authed: true, yearMonth: "2026-06", wantStatus: http.StatusOK},
		{name: "unauthorized", authed: false, yearMonth: "2026-06", wantStatus: http.StatusUnauthorized},
		{name: "bad request when year_month missing", authed: true, yearMonth: "", wantStatus: http.StatusBadRequest},
		{name: "bad request when year_month invalid", authed: true, yearMonth: "202606", wantStatus: http.StatusBadRequest},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			path := "/surplus-allocations"
			if tc.yearMonth != "" {
				path += "?year_month=" + tc.yearMonth
			}
			r := testutil.NewRequest(t, http.MethodGet, path, nil)
			if tc.authed {
				r = authCtx(r, 1)
			}
			w := testutil.NewRecorder()
			ListSurplusAllocationsHandler(&fakeSurplusAllocationRepo{})(w, r)
			testutil.AssertStatus(t, w, tc.wantStatus)
		})
	}
}

func TestListSurplusAllocationsHandler_ReturnsItems(t *testing.T) {
	goal_id := int32(7)
	repo := &fakeSurplusAllocationRepo{
		listSurplusAllocations: func(_ context.Context, _ int64, _ string) ([]repository.SurplusAllocationResult, error) {
			return []repository.SurplusAllocationResult{
				{ID: 1, YearMonth: "2026-06", Amount: 10000, Destination: "budget", CreatedAt: time.Now()},
				{ID: 2, YearMonth: "2026-06", Amount: 5000, Destination: "savings", SavingsGoalID: &goal_id, CreatedAt: time.Now()},
			}, nil
		},
	}
	r := authCtx(testutil.NewRequest(t, http.MethodGet, "/surplus-allocations?year_month=2026-06", nil), 1)
	w := testutil.NewRecorder()
	ListSurplusAllocationsHandler(repo)(w, r)
	testutil.AssertStatus(t, w, http.StatusOK)

	var body struct {
		SurplusAllocations []surplusAllocationJSON `json:"surplus_allocations"`
	}
	testutil.DecodeJSON(t, w, &body)
	if len(body.SurplusAllocations) != 2 {
		t.Fatalf("got %d allocations, want 2", len(body.SurplusAllocations))
	}
}

func TestCreateSurplusAllocationHandler_Budget(t *testing.T) {
	body := map[string]any{
		"year_month":  "2026-06",
		"amount":      10000,
		"destination": "budget",
	}
	r := authCtx(testutil.NewRequest(t, http.MethodPost, "/surplus-allocations", body), 1)
	w := testutil.NewRecorder()
	CreateSurplusAllocationHandler(&fakeSurplusAllocationRepo{})(w, r)
	testutil.AssertStatus(t, w, http.StatusCreated)

	var resp surplusAllocationJSON
	testutil.DecodeJSON(t, w, &resp)
	if resp.Destination != "budget" {
		t.Errorf("destination = %q, want budget", resp.Destination)
	}
	if resp.SavingsGoalID != nil {
		t.Errorf("savings_goal_id = %v, want nil for budget destination", resp.SavingsGoalID)
	}
}

func TestCreateSurplusAllocationHandler_Savings(t *testing.T) {
	goal_id := int32(3)
	body := map[string]any{
		"year_month":      "2026-06",
		"amount":          5000,
		"destination":     "savings",
		"savings_goal_id": goal_id,
	}
	r := authCtx(testutil.NewRequest(t, http.MethodPost, "/surplus-allocations", body), 1)
	w := testutil.NewRecorder()
	CreateSurplusAllocationHandler(&fakeSurplusAllocationRepo{})(w, r)
	testutil.AssertStatus(t, w, http.StatusCreated)

	var resp surplusAllocationJSON
	testutil.DecodeJSON(t, w, &resp)
	if resp.Destination != "savings" {
		t.Errorf("destination = %q, want savings", resp.Destination)
	}
}

func TestCreateSurplusAllocationHandler_Unauthorized(t *testing.T) {
	body := map[string]any{"year_month": "2026-06", "amount": 5000, "destination": "budget"}
	r := testutil.NewRequest(t, http.MethodPost, "/surplus-allocations", body)
	w := testutil.NewRecorder()
	CreateSurplusAllocationHandler(&fakeSurplusAllocationRepo{})(w, r)
	testutil.AssertStatus(t, w, http.StatusUnauthorized)
}

func TestCreateSurplusAllocationHandler_ValidationErrors(t *testing.T) {
	tests := []struct {
		name string
		body map[string]any
	}{
		{"missing year_month", map[string]any{"amount": 5000, "destination": "budget"}},
		{"invalid year_month", map[string]any{"year_month": "202606", "amount": 5000, "destination": "budget"}},
		{"missing amount", map[string]any{"year_month": "2026-06", "destination": "budget"}},
		{"zero amount", map[string]any{"year_month": "2026-06", "amount": 0, "destination": "budget"}},
		{"invalid destination", map[string]any{"year_month": "2026-06", "amount": 5000, "destination": "invalid"}},
		{"savings without goal id", map[string]any{"year_month": "2026-06", "amount": 5000, "destination": "savings"}},
		{"budget with goal id", map[string]any{"year_month": "2026-06", "amount": 5000, "destination": "budget", "savings_goal_id": 1}},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			r := authCtx(testutil.NewRequest(t, http.MethodPost, "/surplus-allocations", tc.body), 1)
			w := testutil.NewRecorder()
			CreateSurplusAllocationHandler(&fakeSurplusAllocationRepo{})(w, r)
			testutil.AssertStatus(t, w, http.StatusBadRequest)
		})
	}
}

func TestCreateSurplusAllocationHandler_SurplusExceeded(t *testing.T) {
	repo := &fakeSurplusAllocationRepo{
		createSurplusAllocation: func(_ context.Context, _ int64, _ int32, _ int32, _ repository.CreateSurplusAllocationParams) (*repository.SurplusAllocationResult, error) {
			return nil, repository.ErrSurplusExceeded
		},
	}
	body := map[string]any{"year_month": "2026-06", "amount": 999999, "destination": "budget"}
	r := authCtx(testutil.NewRequest(t, http.MethodPost, "/surplus-allocations", body), 1)
	w := testutil.NewRecorder()
	CreateSurplusAllocationHandler(repo)(w, r)
	testutil.AssertStatus(t, w, http.StatusBadRequest)
}

func TestCreateSurplusAllocationHandler_SavingsGoalNotFound(t *testing.T) {
	repo := &fakeSurplusAllocationRepo{
		createSurplusAllocation: func(_ context.Context, _ int64, _ int32, _ int32, _ repository.CreateSurplusAllocationParams) (*repository.SurplusAllocationResult, error) {
			return nil, nil
		},
	}
	goal_id := int32(999)
	body := map[string]any{"year_month": "2026-06", "amount": 5000, "destination": "savings", "savings_goal_id": goal_id}
	r := authCtx(testutil.NewRequest(t, http.MethodPost, "/surplus-allocations", body), 1)
	w := testutil.NewRecorder()
	CreateSurplusAllocationHandler(repo)(w, r)
	testutil.AssertStatus(t, w, http.StatusNotFound)
}

func TestCreateSurplusAllocationHandler_RepoError(t *testing.T) {
	repo := &fakeSurplusAllocationRepo{
		createSurplusAllocation: func(_ context.Context, _ int64, _ int32, _ int32, _ repository.CreateSurplusAllocationParams) (*repository.SurplusAllocationResult, error) {
			return nil, errors.New("db error")
		},
	}
	body := map[string]any{"year_month": "2026-06", "amount": 5000, "destination": "budget"}
	r := authCtx(testutil.NewRequest(t, http.MethodPost, "/surplus-allocations", body), 1)
	w := testutil.NewRecorder()
	CreateSurplusAllocationHandler(repo)(w, r)
	testutil.AssertStatus(t, w, http.StatusInternalServerError)
}
