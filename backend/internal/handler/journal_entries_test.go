package handler

import (
	"context"
	"net/http"
	"testing"
	"time"

	"github.com/utibori-jp/atoikura/backend/internal/repository"
	"github.com/utibori-jp/atoikura/backend/internal/testutil"
)

type fakeJournalRepo struct {
	getActiveExpenseCategory  func(context.Context, int64, int64) (*repository.ExpenseCategoryView, error)
	createJournalEntry        func(context.Context, repository.CreateJournalEntryParams) (*repository.JournalEntryView, error)
	listJournalEntriesByMonth func(context.Context, int64, time.Time) ([]repository.JournalEntryView, error)
	updateJournalEntry        func(context.Context, repository.UpdateJournalEntryParams) (*repository.JournalEntryView, error)
	deleteJournalEntry        func(context.Context, int64, int64) (bool, error)
}

func (f *fakeJournalRepo) GetActiveExpenseCategory(ctx context.Context, id, user_id int64) (*repository.ExpenseCategoryView, error) {
	if f.getActiveExpenseCategory != nil {
		return f.getActiveExpenseCategory(ctx, id, user_id)
	}
	return &repository.ExpenseCategoryView{ID: int32(id)}, nil
}

func (f *fakeJournalRepo) CreateJournalEntry(ctx context.Context, params repository.CreateJournalEntryParams) (*repository.JournalEntryView, error) {
	if f.createJournalEntry != nil {
		return f.createJournalEntry(ctx, params)
	}
	return &repository.JournalEntryView{
		ID:              1,
		Amount:          params.Amount,
		CategoryID:      params.CategoryID,
		TransactionDate: params.TransactionDate.Format("2006-01-02"),
		CreatedAt:       time.Now(),
	}, nil
}

func (f *fakeJournalRepo) ListJournalEntriesByMonth(ctx context.Context, user_id int64, first_day time.Time) ([]repository.JournalEntryView, error) {
	if f.listJournalEntriesByMonth != nil {
		return f.listJournalEntriesByMonth(ctx, user_id, first_day)
	}
	return []repository.JournalEntryView{}, nil
}

func (f *fakeJournalRepo) UpdateJournalEntry(ctx context.Context, params repository.UpdateJournalEntryParams) (*repository.JournalEntryView, error) {
	if f.updateJournalEntry != nil {
		return f.updateJournalEntry(ctx, params)
	}
	return &repository.JournalEntryView{
		ID:              params.ID,
		Amount:          params.Amount,
		CategoryID:      params.CategoryID,
		TransactionDate: params.TransactionDate.Format("2006-01-02"),
		CreatedAt:       time.Now(),
	}, nil
}

func (f *fakeJournalRepo) DeleteJournalEntry(ctx context.Context, id, user_id int64) (bool, error) {
	if f.deleteJournalEntry != nil {
		return f.deleteJournalEntry(ctx, id, user_id)
	}
	return true, nil
}

func authCtx(r *http.Request, user_id int64) *http.Request {
	return r.WithContext(WithUserID(r.Context(), user_id))
}

func TestCreateJournalEntryHandler(t *testing.T) {
	tests := []struct {
		name       string
		authed     bool
		body       any
		repo       *fakeJournalRepo
		wantStatus int
	}{
		{
			name:   "success",
			authed: true,
			body: map[string]any{
				"transaction_date": "2026-06-01",
				"amount":           500,
				"category_id":      1,
				"is_excluded":      false,
			},
			repo:       &fakeJournalRepo{},
			wantStatus: http.StatusCreated,
		},
		{
			name:       "unauthorized when no user in context",
			authed:     false,
			body:       map[string]any{},
			repo:       &fakeJournalRepo{},
			wantStatus: http.StatusUnauthorized,
		},
		{
			name:   "bad request when amount is zero",
			authed: true,
			body: map[string]any{
				"transaction_date": "2026-06-01",
				"amount":           0,
				"category_id":      1,
				"is_excluded":      false,
			},
			repo:       &fakeJournalRepo{},
			wantStatus: http.StatusBadRequest,
		},
		{
			name:   "bad request when category_id missing",
			authed: true,
			body: map[string]any{
				"transaction_date": "2026-06-01",
				"amount":           500,
				"is_excluded":      false,
			},
			repo:       &fakeJournalRepo{},
			wantStatus: http.StatusBadRequest,
		},
		{
			name:   "bad request when date format invalid",
			authed: true,
			body: map[string]any{
				"transaction_date": "not-a-date",
				"amount":           500,
				"category_id":      1,
				"is_excluded":      false,
			},
			repo:       &fakeJournalRepo{},
			wantStatus: http.StatusBadRequest,
		},
		{
			name:   "bad request when category not found",
			authed: true,
			body: map[string]any{
				"transaction_date": "2026-06-01",
				"amount":           500,
				"category_id":      99,
				"is_excluded":      false,
			},
			repo: &fakeJournalRepo{
				getActiveExpenseCategory: func(_ context.Context, _, _ int64) (*repository.ExpenseCategoryView, error) {
					return nil, nil
				},
			},
			wantStatus: http.StatusBadRequest,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			r := testutil.NewRequest(t, http.MethodPost, "/journal-entries", tc.body)
			if tc.authed {
				r = authCtx(r, 1)
			}
			w := testutil.NewRecorder()
			CreateJournalEntryHandler(tc.repo)(w, r)
			testutil.AssertStatus(t, w, tc.wantStatus)
		})
	}
}

func TestListJournalEntriesHandler(t *testing.T) {
	tests := []struct {
		name       string
		authed     bool
		yearMonth  string
		repo       *fakeJournalRepo
		wantStatus int
	}{
		{
			name:      "success with entries",
			authed:    true,
			yearMonth: "2026-06",
			repo: &fakeJournalRepo{
				listJournalEntriesByMonth: func(_ context.Context, _ int64, _ time.Time) ([]repository.JournalEntryView, error) {
					return []repository.JournalEntryView{
						{
							ID:              1,
							TransactionDate: "2026-06-01",
							Amount:          500,
							CategoryID:      1,
							CategoryName:    "スーパー",
							GroupID:         1,
							GroupName:       "食費",
							CreatedAt:       time.Now(),
						},
					}, nil
				},
			},
			wantStatus: http.StatusOK,
		},
		{
			name:       "success with empty list",
			authed:     true,
			yearMonth:  "2026-06",
			repo:       &fakeJournalRepo{},
			wantStatus: http.StatusOK,
		},
		{
			name:       "unauthorized",
			authed:     false,
			yearMonth:  "2026-06",
			repo:       &fakeJournalRepo{},
			wantStatus: http.StatusUnauthorized,
		},
		{
			name:       "bad request when year_month missing",
			authed:     true,
			yearMonth:  "",
			repo:       &fakeJournalRepo{},
			wantStatus: http.StatusBadRequest,
		},
		{
			name:       "bad request when year_month invalid",
			authed:     true,
			yearMonth:  "not-a-month",
			repo:       &fakeJournalRepo{},
			wantStatus: http.StatusBadRequest,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			path := "/journal-entries"
			if tc.yearMonth != "" {
				path += "?year_month=" + tc.yearMonth
			}
			r := testutil.NewRequest(t, http.MethodGet, path, nil)
			if tc.authed {
				r = authCtx(r, 1)
			}
			w := testutil.NewRecorder()
			ListJournalEntriesHandler(tc.repo)(w, r)
			testutil.AssertStatus(t, w, tc.wantStatus)
		})
	}
}

func TestDeleteJournalEntryHandler(t *testing.T) {
	tests := []struct {
		name       string
		authed     bool
		pathID     string
		repo       *fakeJournalRepo
		wantStatus int
	}{
		{
			name:       "success",
			authed:     true,
			pathID:     "1",
			repo:       &fakeJournalRepo{},
			wantStatus: http.StatusNoContent,
		},
		{
			name:       "unauthorized",
			authed:     false,
			pathID:     "1",
			repo:       &fakeJournalRepo{},
			wantStatus: http.StatusUnauthorized,
		},
		{
			name:   "not found",
			authed: true,
			pathID: "1",
			repo: &fakeJournalRepo{
				deleteJournalEntry: func(_ context.Context, _, _ int64) (bool, error) {
					return false, nil
				},
			},
			wantStatus: http.StatusNotFound,
		},
		{
			name:       "bad request when id is not numeric",
			authed:     true,
			pathID:     "abc",
			repo:       &fakeJournalRepo{},
			wantStatus: http.StatusBadRequest,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			r := testutil.NewRequest(t, http.MethodDelete, "/journal-entries/"+tc.pathID, nil)
			r.SetPathValue("id", tc.pathID)
			if tc.authed {
				r = authCtx(r, 1)
			}
			w := testutil.NewRecorder()
			DeleteJournalEntryHandler(tc.repo)(w, r)
			testutil.AssertStatus(t, w, tc.wantStatus)
		})
	}
}
