package handler

import (
	"context"
	"net/http"
	"testing"

	"github.com/utibori-jp/atoikura/backend/internal/repository"
	"github.com/utibori-jp/atoikura/backend/internal/testutil"
)

type fakeRecurringRepo struct {
	listRecurringExpenses   func(context.Context, int64) ([]repository.RecurringExpenseResult, error)
	listPendingRecurring    func(context.Context, int64, string) ([]repository.PendingRecurringResult, error)
	createRecurringExpense  func(context.Context, int64, repository.CreateRecurringExpenseParams) (*repository.RecurringExpenseResult, error)
	updateRecurringExpense  func(context.Context, int64, repository.UpdateRecurringExpenseParams) (*repository.RecurringExpenseResult, error)
	deleteRecurringExpense  func(context.Context, int64, int64) (bool, error)
	confirmRecurringExpense func(context.Context, int64, int64, int32, string) (*repository.JournalEntryView, error)
}

func (f *fakeRecurringRepo) ListRecurringExpenses(ctx context.Context, user_id int64) ([]repository.RecurringExpenseResult, error) {
	if f.listRecurringExpenses != nil {
		return f.listRecurringExpenses(ctx, user_id)
	}
	return []repository.RecurringExpenseResult{}, nil
}

func (f *fakeRecurringRepo) ListPendingRecurring(ctx context.Context, user_id int64, year_month string) ([]repository.PendingRecurringResult, error) {
	if f.listPendingRecurring != nil {
		return f.listPendingRecurring(ctx, user_id, year_month)
	}
	return []repository.PendingRecurringResult{}, nil
}

func (f *fakeRecurringRepo) CreateRecurringExpense(ctx context.Context, user_id int64, params repository.CreateRecurringExpenseParams) (*repository.RecurringExpenseResult, error) {
	if f.createRecurringExpense != nil {
		return f.createRecurringExpense(ctx, user_id, params)
	}
	amount := params.Amount
	return &repository.RecurringExpenseResult{
		ID:         1,
		Name:       params.Name,
		Emoji:      params.Emoji,
		BillingDay: params.BillingDay,
		Amount:     amount,
		Type:       params.Type,
		CategoryID: params.CategoryID,
	}, nil
}

func (f *fakeRecurringRepo) UpdateRecurringExpense(ctx context.Context, user_id int64, params repository.UpdateRecurringExpenseParams) (*repository.RecurringExpenseResult, error) {
	if f.updateRecurringExpense != nil {
		return f.updateRecurringExpense(ctx, user_id, params)
	}
	return &repository.RecurringExpenseResult{
		ID:         params.ID,
		Name:       params.Name,
		Emoji:      params.Emoji,
		BillingDay: params.BillingDay,
		Amount:     params.Amount,
		Type:       params.Type,
		CategoryID: params.CategoryID,
	}, nil
}

func (f *fakeRecurringRepo) DeleteRecurringExpense(ctx context.Context, id, user_id int64) (bool, error) {
	if f.deleteRecurringExpense != nil {
		return f.deleteRecurringExpense(ctx, id, user_id)
	}
	return true, nil
}

func (f *fakeRecurringRepo) ConfirmRecurringExpense(ctx context.Context, recurring_expense_id, user_id int64, amount int32, year_month string) (*repository.JournalEntryView, error) {
	if f.confirmRecurringExpense != nil {
		return f.confirmRecurringExpense(ctx, recurring_expense_id, user_id, amount, year_month)
	}
	return &repository.JournalEntryView{ID: 1, Amount: amount}, nil
}

func TestListRecurringExpensesHandler(t *testing.T) {
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
			r := testutil.NewRequest(t, http.MethodGet, "/recurring-expenses", nil)
			if tc.authed {
				r = authCtx(r, 1)
			}
			w := testutil.NewRecorder()
			ListRecurringExpensesHandler(&fakeRecurringRepo{})(w, r)
			testutil.AssertStatus(t, w, tc.wantStatus)
		})
	}
}

func TestListPendingRecurringHandler(t *testing.T) {
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
			path := "/recurring-expenses/pending"
			if tc.yearMonth != "" {
				path += "?year_month=" + tc.yearMonth
			}
			r := testutil.NewRequest(t, http.MethodGet, path, nil)
			if tc.authed {
				r = authCtx(r, 1)
			}
			w := testutil.NewRecorder()
			ListPendingRecurringHandler(&fakeRecurringRepo{})(w, r)
			testutil.AssertStatus(t, w, tc.wantStatus)
		})
	}
}

func TestCreateRecurringExpenseHandler(t *testing.T) {
	validBody := map[string]any{
		"name":        "家賃",
		"emoji":       "🏠",
		"billing_day": 25,
		"type":        "fixed",
		"category_id": 1,
		"amount":      80000,
	}

	tests := []struct {
		name       string
		authed     bool
		body       any
		wantStatus int
	}{
		{name: "success fixed", authed: true, body: validBody, wantStatus: http.StatusCreated},
		{
			name:   "success variable without amount",
			authed: true,
			body: map[string]any{
				"name": "電気代", "emoji": "💡", "billing_day": 10,
				"type": "variable", "category_id": 2,
			},
			wantStatus: http.StatusCreated,
		},
		{name: "unauthorized", authed: false, body: validBody, wantStatus: http.StatusUnauthorized},
		{
			name:       "bad request when name missing",
			authed:     true,
			body:       map[string]any{"emoji": "🏠", "billing_day": 25, "type": "fixed", "category_id": 1},
			wantStatus: http.StatusBadRequest,
		},
		{
			name:       "bad request when billing_day out of range",
			authed:     true,
			body:       map[string]any{"name": "家賃", "emoji": "🏠", "billing_day": 32, "type": "fixed", "category_id": 1},
			wantStatus: http.StatusBadRequest,
		},
		{
			name:       "bad request when type invalid",
			authed:     true,
			body:       map[string]any{"name": "家賃", "emoji": "🏠", "billing_day": 25, "type": "unknown", "category_id": 1},
			wantStatus: http.StatusBadRequest,
		},
		{
			name:       "bad request when category_id missing",
			authed:     true,
			body:       map[string]any{"name": "家賃", "emoji": "🏠", "billing_day": 25, "type": "fixed"},
			wantStatus: http.StatusBadRequest,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			r := testutil.NewRequest(t, http.MethodPost, "/recurring-expenses", tc.body)
			if tc.authed {
				r = authCtx(r, 1)
			}
			w := testutil.NewRecorder()
			CreateRecurringExpenseHandler(&fakeRecurringRepo{})(w, r)
			testutil.AssertStatus(t, w, tc.wantStatus)
		})
	}
}

func TestUpdateRecurringExpenseHandler(t *testing.T) {
	validBody := map[string]any{
		"name":        "家賃",
		"emoji":       "🏠",
		"billing_day": 25,
		"type":        "fixed",
		"category_id": 1,
		"amount":      85000,
	}

	tests := []struct {
		name       string
		authed     bool
		pathID     string
		body       any
		repo       *fakeRecurringRepo
		wantStatus int
	}{
		{name: "success", authed: true, pathID: "1", body: validBody, repo: &fakeRecurringRepo{}, wantStatus: http.StatusOK},
		{name: "unauthorized", authed: false, pathID: "1", body: validBody, repo: &fakeRecurringRepo{}, wantStatus: http.StatusUnauthorized},
		{
			name:   "not found",
			authed: true, pathID: "99", body: validBody,
			repo: &fakeRecurringRepo{
				updateRecurringExpense: func(_ context.Context, _ int64, _ repository.UpdateRecurringExpenseParams) (*repository.RecurringExpenseResult, error) {
					return nil, nil
				},
			},
			wantStatus: http.StatusNotFound,
		},
		{
			name:   "bad request when id not numeric",
			authed: true, pathID: "abc", body: validBody,
			repo:       &fakeRecurringRepo{},
			wantStatus: http.StatusBadRequest,
		},
		{
			name:   "bad request when name missing",
			authed: true, pathID: "1",
			body:       map[string]any{"emoji": "🏠", "billing_day": 25, "type": "fixed", "category_id": 1},
			repo:       &fakeRecurringRepo{},
			wantStatus: http.StatusBadRequest,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			r := testutil.NewRequest(t, http.MethodPut, "/recurring-expenses/"+tc.pathID, tc.body)
			r.SetPathValue("id", tc.pathID)
			if tc.authed {
				r = authCtx(r, 1)
			}
			w := testutil.NewRecorder()
			UpdateRecurringExpenseHandler(tc.repo)(w, r)
			testutil.AssertStatus(t, w, tc.wantStatus)
		})
	}
}

func TestConfirmRecurringExpenseHandler(t *testing.T) {
	validBody := map[string]any{"amount": 7480, "year_month": "2026-06"}

	tests := []struct {
		name       string
		authed     bool
		pathID     string
		body       any
		repo       *fakeRecurringRepo
		wantStatus int
	}{
		{name: "success", authed: true, pathID: "1", body: validBody, repo: &fakeRecurringRepo{}, wantStatus: http.StatusCreated},
		{name: "unauthorized", authed: false, pathID: "1", body: validBody, repo: &fakeRecurringRepo{}, wantStatus: http.StatusUnauthorized},
		{name: "bad request when id not numeric", authed: true, pathID: "abc", body: validBody, repo: &fakeRecurringRepo{}, wantStatus: http.StatusBadRequest},
		{
			name:   "bad request when amount missing",
			authed: true, pathID: "1",
			body:       map[string]any{"year_month": "2026-06"},
			repo:       &fakeRecurringRepo{},
			wantStatus: http.StatusBadRequest,
		},
		{
			name:   "bad request when year_month invalid",
			authed: true, pathID: "1",
			body:       map[string]any{"amount": 7480, "year_month": "202606"},
			repo:       &fakeRecurringRepo{},
			wantStatus: http.StatusBadRequest,
		},
		{
			name:   "not found",
			authed: true, pathID: "99", body: validBody,
			repo: &fakeRecurringRepo{
				confirmRecurringExpense: func(_ context.Context, _, _ int64, _ int32, _ string) (*repository.JournalEntryView, error) {
					return nil, nil
				},
			},
			wantStatus: http.StatusNotFound,
		},
		{
			name:   "conflict when already confirmed",
			authed: true, pathID: "1", body: validBody,
			repo: &fakeRecurringRepo{
				confirmRecurringExpense: func(_ context.Context, _, _ int64, _ int32, _ string) (*repository.JournalEntryView, error) {
					return nil, repository.ErrRecurringAlreadyConfirmed
				},
			},
			wantStatus: http.StatusConflict,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			r := testutil.NewRequest(t, http.MethodPost, "/recurring-expenses/"+tc.pathID+"/confirm", tc.body)
			r.SetPathValue("id", tc.pathID)
			if tc.authed {
				r = authCtx(r, 1)
			}
			w := testutil.NewRecorder()
			ConfirmRecurringExpenseHandler(tc.repo)(w, r)
			testutil.AssertStatus(t, w, tc.wantStatus)
		})
	}
}

func TestDeleteRecurringExpenseHandler(t *testing.T) {
	tests := []struct {
		name       string
		authed     bool
		pathID     string
		repo       *fakeRecurringRepo
		wantStatus int
	}{
		{name: "success", authed: true, pathID: "1", repo: &fakeRecurringRepo{}, wantStatus: http.StatusNoContent},
		{name: "unauthorized", authed: false, pathID: "1", repo: &fakeRecurringRepo{}, wantStatus: http.StatusUnauthorized},
		{
			name: "not found", authed: true, pathID: "99",
			repo: &fakeRecurringRepo{
				deleteRecurringExpense: func(_ context.Context, _, _ int64) (bool, error) { return false, nil },
			},
			wantStatus: http.StatusNotFound,
		},
		{name: "bad request when id not numeric", authed: true, pathID: "abc", repo: &fakeRecurringRepo{}, wantStatus: http.StatusBadRequest},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			r := testutil.NewRequest(t, http.MethodDelete, "/recurring-expenses/"+tc.pathID, nil)
			r.SetPathValue("id", tc.pathID)
			if tc.authed {
				r = authCtx(r, 1)
			}
			w := testutil.NewRecorder()
			DeleteRecurringExpenseHandler(tc.repo)(w, r)
			testutil.AssertStatus(t, w, tc.wantStatus)
		})
	}
}
