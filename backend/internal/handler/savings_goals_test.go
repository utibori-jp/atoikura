package handler

import (
	"context"
	"net/http"
	"testing"

	"github.com/utibori-jp/atoikura/backend/internal/repository"
	"github.com/utibori-jp/atoikura/backend/internal/testutil"
)

type fakeSavingsRepo struct {
	listSavingsGoals   func(context.Context, int64) ([]repository.SavingsGoalResult, error)
	createSavingsGoal  func(context.Context, int64, repository.CreateSavingsGoalParams) (*repository.SavingsGoalResult, error)
	updateSavingsGoal  func(context.Context, int64, repository.UpdateSavingsGoalParams) (*repository.SavingsGoalResult, error)
	postMonthlySavings func(context.Context, int64, int64, int32, string) (*repository.SavingsGoalResult, error)
	deleteSavingsGoal  func(context.Context, int64, int64) (bool, error)
}

func (f *fakeSavingsRepo) ListSavingsGoals(ctx context.Context, user_id int64) ([]repository.SavingsGoalResult, error) {
	if f.listSavingsGoals != nil {
		return f.listSavingsGoals(ctx, user_id)
	}
	return []repository.SavingsGoalResult{}, nil
}

func (f *fakeSavingsRepo) CreateSavingsGoal(ctx context.Context, user_id int64, params repository.CreateSavingsGoalParams) (*repository.SavingsGoalResult, error) {
	if f.createSavingsGoal != nil {
		return f.createSavingsGoal(ctx, user_id, params)
	}
	return &repository.SavingsGoalResult{
		ID:            1,
		Name:          params.Name,
		Emoji:         params.Emoji,
		MonthlyAmount: params.MonthlyAmount,
		TargetAmount:  params.TargetAmount,
		Deadline:      params.Deadline,
		Memo:          params.Memo,
	}, nil
}

func (f *fakeSavingsRepo) UpdateSavingsGoal(ctx context.Context, user_id int64, params repository.UpdateSavingsGoalParams) (*repository.SavingsGoalResult, error) {
	if f.updateSavingsGoal != nil {
		return f.updateSavingsGoal(ctx, user_id, params)
	}
	return &repository.SavingsGoalResult{
		ID:            params.ID,
		Name:          params.Name,
		Emoji:         params.Emoji,
		MonthlyAmount: params.MonthlyAmount,
		TargetAmount:  params.TargetAmount,
		Deadline:      params.Deadline,
		Memo:          params.Memo,
	}, nil
}

func (f *fakeSavingsRepo) PostMonthlySavings(ctx context.Context, id, user_id int64, amount int32, year_month string) (*repository.SavingsGoalResult, error) {
	if f.postMonthlySavings != nil {
		return f.postMonthlySavings(ctx, id, user_id, amount, year_month)
	}
	return &repository.SavingsGoalResult{ID: int32(id), AccumulatedAmount: amount}, nil
}

func (f *fakeSavingsRepo) DeleteSavingsGoal(ctx context.Context, id, user_id int64) (bool, error) {
	if f.deleteSavingsGoal != nil {
		return f.deleteSavingsGoal(ctx, id, user_id)
	}
	return true, nil
}

func TestListSavingsGoalsHandler(t *testing.T) {
	tests := []struct {
		name       string
		authed     bool
		wantStatus int
	}{
		{name: "success", authed: true, wantStatus: http.StatusOK},
		{name: "unauthorized", authed: false, wantStatus: http.StatusUnauthorized},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			r := testutil.NewRequest(t, http.MethodGet, "/savings-goals", nil)
			if tc.authed {
				r = authCtx(r, 1)
			}
			w := testutil.NewRecorder()
			ListSavingsGoalsHandler(&fakeSavingsRepo{})(w, r)
			testutil.AssertStatus(t, w, tc.wantStatus)
		})
	}
}

func TestCreateSavingsGoalHandler(t *testing.T) {
	validBody := map[string]any{
		"name":           "旅行積立",
		"emoji":          "✈️",
		"monthly_amount": 20000,
		"target_amount":  250000,
	}

	tests := []struct {
		name       string
		authed     bool
		body       any
		wantStatus int
	}{
		{name: "success", authed: true, body: validBody, wantStatus: http.StatusCreated},
		{
			name:   "success with optional fields",
			authed: true,
			body: map[string]any{
				"name": "緊急費用", "emoji": "🛟",
				"monthly_amount": 15000, "target_amount": 500000,
				"deadline": "2027/03", "memo": "生活費3ヶ月分",
			},
			wantStatus: http.StatusCreated,
		},
		{name: "unauthorized", authed: false, body: validBody, wantStatus: http.StatusUnauthorized},
		{
			name:       "bad request when name missing",
			authed:     true,
			body:       map[string]any{"emoji": "✈️", "monthly_amount": 20000, "target_amount": 250000},
			wantStatus: http.StatusBadRequest,
		},
		{
			name:       "bad request when monthly_amount negative",
			authed:     true,
			body:       map[string]any{"name": "旅行積立", "emoji": "✈️", "monthly_amount": -1, "target_amount": 250000},
			wantStatus: http.StatusBadRequest,
		},
		{
			name:       "bad request when target_amount negative",
			authed:     true,
			body:       map[string]any{"name": "旅行積立", "emoji": "✈️", "monthly_amount": 20000, "target_amount": -1},
			wantStatus: http.StatusBadRequest,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			r := testutil.NewRequest(t, http.MethodPost, "/savings-goals", tc.body)
			if tc.authed {
				r = authCtx(r, 1)
			}
			w := testutil.NewRecorder()
			CreateSavingsGoalHandler(&fakeSavingsRepo{})(w, r)
			testutil.AssertStatus(t, w, tc.wantStatus)
		})
	}
}

func TestUpdateSavingsGoalHandler(t *testing.T) {
	validBody := map[string]any{
		"name":           "旅行積立",
		"emoji":          "✈️",
		"monthly_amount": 25000,
		"target_amount":  300000,
	}

	tests := []struct {
		name       string
		authed     bool
		pathID     string
		body       any
		repo       *fakeSavingsRepo
		wantStatus int
	}{
		{name: "success", authed: true, pathID: "1", body: validBody, repo: &fakeSavingsRepo{}, wantStatus: http.StatusOK},
		{name: "unauthorized", authed: false, pathID: "1", body: validBody, repo: &fakeSavingsRepo{}, wantStatus: http.StatusUnauthorized},
		{
			name: "not found", authed: true, pathID: "99", body: validBody,
			repo: &fakeSavingsRepo{
				updateSavingsGoal: func(_ context.Context, _ int64, _ repository.UpdateSavingsGoalParams) (*repository.SavingsGoalResult, error) {
					return nil, nil
				},
			},
			wantStatus: http.StatusNotFound,
		},
		{name: "bad request when id not numeric", authed: true, pathID: "abc", body: validBody, repo: &fakeSavingsRepo{}, wantStatus: http.StatusBadRequest},
		{
			name:   "bad request when name missing",
			authed: true, pathID: "1",
			body:       map[string]any{"emoji": "✈️", "monthly_amount": 20000, "target_amount": 250000},
			repo:       &fakeSavingsRepo{},
			wantStatus: http.StatusBadRequest,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			r := testutil.NewRequest(t, http.MethodPut, "/savings-goals/"+tc.pathID, tc.body)
			r.SetPathValue("id", tc.pathID)
			if tc.authed {
				r = authCtx(r, 1)
			}
			w := testutil.NewRecorder()
			UpdateSavingsGoalHandler(tc.repo)(w, r)
			testutil.AssertStatus(t, w, tc.wantStatus)
		})
	}
}

func TestPostMonthlySavingsHandler(t *testing.T) {
	validBody := map[string]any{"amount": 20000, "year_month": "2026-06"}

	tests := []struct {
		name       string
		authed     bool
		pathID     string
		body       any
		repo       *fakeSavingsRepo
		wantStatus int
	}{
		{name: "success", authed: true, pathID: "1", body: validBody, repo: &fakeSavingsRepo{}, wantStatus: http.StatusOK},
		{name: "unauthorized", authed: false, pathID: "1", body: validBody, repo: &fakeSavingsRepo{}, wantStatus: http.StatusUnauthorized},
		{
			name: "not found", authed: true, pathID: "99", body: validBody,
			repo: &fakeSavingsRepo{
				postMonthlySavings: func(_ context.Context, _, _ int64, _ int32, _ string) (*repository.SavingsGoalResult, error) {
					return nil, nil
				},
			},
			wantStatus: http.StatusNotFound,
		},
		{name: "bad request when id not numeric", authed: true, pathID: "abc", body: validBody, repo: &fakeSavingsRepo{}, wantStatus: http.StatusBadRequest},
		{
			name:   "bad request when amount zero",
			authed: true, pathID: "1",
			body:       map[string]any{"amount": 0, "year_month": "2026-06"},
			repo:       &fakeSavingsRepo{},
			wantStatus: http.StatusBadRequest,
		},
		{
			name:   "bad request when year_month invalid",
			authed: true, pathID: "1",
			body:       map[string]any{"amount": 20000, "year_month": "202606"},
			repo:       &fakeSavingsRepo{},
			wantStatus: http.StatusBadRequest,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			r := testutil.NewRequest(t, http.MethodPost, "/savings-goals/"+tc.pathID+"/post-monthly", tc.body)
			r.SetPathValue("id", tc.pathID)
			if tc.authed {
				r = authCtx(r, 1)
			}
			w := testutil.NewRecorder()
			PostMonthlySavingsHandler(tc.repo)(w, r)
			testutil.AssertStatus(t, w, tc.wantStatus)
		})
	}
}

func TestDeleteSavingsGoalHandler(t *testing.T) {
	tests := []struct {
		name       string
		authed     bool
		pathID     string
		repo       *fakeSavingsRepo
		wantStatus int
	}{
		{name: "success", authed: true, pathID: "1", repo: &fakeSavingsRepo{}, wantStatus: http.StatusNoContent},
		{name: "unauthorized", authed: false, pathID: "1", repo: &fakeSavingsRepo{}, wantStatus: http.StatusUnauthorized},
		{
			name: "not found", authed: true, pathID: "99",
			repo: &fakeSavingsRepo{
				deleteSavingsGoal: func(_ context.Context, _, _ int64) (bool, error) { return false, nil },
			},
			wantStatus: http.StatusNotFound,
		},
		{name: "bad request when id not numeric", authed: true, pathID: "abc", repo: &fakeSavingsRepo{}, wantStatus: http.StatusBadRequest},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			r := testutil.NewRequest(t, http.MethodDelete, "/savings-goals/"+tc.pathID, nil)
			r.SetPathValue("id", tc.pathID)
			if tc.authed {
				r = authCtx(r, 1)
			}
			w := testutil.NewRecorder()
			DeleteSavingsGoalHandler(tc.repo)(w, r)
			testutil.AssertStatus(t, w, tc.wantStatus)
		})
	}
}
