package handler

import (
	"context"
	"net/http"
	"testing"

	"github.com/utibori-jp/atoikura/backend/internal/repository"
	"github.com/utibori-jp/atoikura/backend/internal/testutil"
)

type fakeIncomeRepo struct {
	listIncomeRecords  func(context.Context, int64, string) ([]repository.IncomeRecordResult, error)
	createIncomeRecord func(context.Context, int64, repository.CreateIncomeRecordParams) (*repository.IncomeRecordResult, error)
	updateIncomeRecord func(context.Context, int64, repository.UpdateIncomeRecordParams) (*repository.IncomeRecordResult, error)
	deleteIncomeRecord func(context.Context, int64, int64) (bool, error)
	getBaseIncome      func(context.Context, int64) (int32, error)
	upsertBaseIncome   func(context.Context, int64, int32) (int32, error)
}

func (f *fakeIncomeRepo) ListIncomeRecords(ctx context.Context, user_id int64, year_month string) ([]repository.IncomeRecordResult, error) {
	if f.listIncomeRecords != nil {
		return f.listIncomeRecords(ctx, user_id, year_month)
	}
	return []repository.IncomeRecordResult{}, nil
}

func (f *fakeIncomeRepo) CreateIncomeRecord(ctx context.Context, user_id int64, params repository.CreateIncomeRecordParams) (*repository.IncomeRecordResult, error) {
	if f.createIncomeRecord != nil {
		return f.createIncomeRecord(ctx, user_id, params)
	}
	return &repository.IncomeRecordResult{
		ID:              1,
		TransactionDate: params.TransactionDate.Format("2006-01-02"),
		Amount:          params.Amount,
		Name:            params.Name,
		IncomeType:      params.IncomeType,
		Emoji:           params.Emoji,
		Note:            params.Note,
	}, nil
}

func (f *fakeIncomeRepo) UpdateIncomeRecord(ctx context.Context, user_id int64, params repository.UpdateIncomeRecordParams) (*repository.IncomeRecordResult, error) {
	if f.updateIncomeRecord != nil {
		return f.updateIncomeRecord(ctx, user_id, params)
	}
	return &repository.IncomeRecordResult{
		ID:              params.ID,
		TransactionDate: params.TransactionDate.Format("2006-01-02"),
		Amount:          params.Amount,
		Name:            params.Name,
		IncomeType:      params.IncomeType,
		Emoji:           params.Emoji,
		Note:            params.Note,
	}, nil
}

func (f *fakeIncomeRepo) DeleteIncomeRecord(ctx context.Context, id, user_id int64) (bool, error) {
	if f.deleteIncomeRecord != nil {
		return f.deleteIncomeRecord(ctx, id, user_id)
	}
	return true, nil
}

func (f *fakeIncomeRepo) GetBaseIncome(ctx context.Context, user_id int64) (int32, error) {
	if f.getBaseIncome != nil {
		return f.getBaseIncome(ctx, user_id)
	}
	return 280000, nil
}

func (f *fakeIncomeRepo) UpsertBaseIncome(ctx context.Context, user_id int64, amount int32) (int32, error) {
	if f.upsertBaseIncome != nil {
		return f.upsertBaseIncome(ctx, user_id, amount)
	}
	return amount, nil
}

var validIncomeBody = map[string]any{
	"transaction_date": "2026-06-25",
	"amount":           280000,
	"name":             "6月給与",
	"income_type":      "salary",
	"emoji":            "🏢",
}

func TestListIncomeRecordsHandler(t *testing.T) {
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
			path := "/income-records"
			if tc.yearMonth != "" {
				path += "?year_month=" + tc.yearMonth
			}
			r := testutil.NewRequest(t, http.MethodGet, path, nil)
			if tc.authed {
				r = authCtx(r, 1)
			}
			w := testutil.NewRecorder()
			ListIncomeRecordsHandler(&fakeIncomeRepo{})(w, r)
			testutil.AssertStatus(t, w, tc.wantStatus)
		})
	}
}

func TestCreateIncomeRecordHandler(t *testing.T) {
	tests := []struct {
		name       string
		authed     bool
		body       any
		wantStatus int
	}{
		{name: "success salary", authed: true, body: validIncomeBody, wantStatus: http.StatusCreated},
		{
			name:   "success side income",
			authed: true,
			body: map[string]any{
				"transaction_date": "2026-06-20", "amount": 18500,
				"name": "ライティング", "income_type": "side", "emoji": "✍️",
			},
			wantStatus: http.StatusCreated,
		},
		{name: "unauthorized", authed: false, body: validIncomeBody, wantStatus: http.StatusUnauthorized},
		{
			name:       "bad request when amount zero",
			authed:     true,
			body:       map[string]any{"transaction_date": "2026-06-25", "amount": 0, "name": "給与", "income_type": "salary", "emoji": "🏢"},
			wantStatus: http.StatusBadRequest,
		},
		{
			name:       "bad request when date invalid",
			authed:     true,
			body:       map[string]any{"transaction_date": "not-a-date", "amount": 280000, "name": "給与", "income_type": "salary", "emoji": "🏢"},
			wantStatus: http.StatusBadRequest,
		},
		{
			name:       "bad request when income_type invalid",
			authed:     true,
			body:       map[string]any{"transaction_date": "2026-06-25", "amount": 280000, "name": "給与", "income_type": "unknown", "emoji": "🏢"},
			wantStatus: http.StatusBadRequest,
		},
		{
			name:       "bad request when name missing",
			authed:     true,
			body:       map[string]any{"transaction_date": "2026-06-25", "amount": 280000, "income_type": "salary", "emoji": "🏢"},
			wantStatus: http.StatusBadRequest,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			r := testutil.NewRequest(t, http.MethodPost, "/income-records", tc.body)
			if tc.authed {
				r = authCtx(r, 1)
			}
			w := testutil.NewRecorder()
			CreateIncomeRecordHandler(&fakeIncomeRepo{})(w, r)
			testutil.AssertStatus(t, w, tc.wantStatus)
		})
	}
}

func TestUpdateIncomeRecordHandler(t *testing.T) {
	tests := []struct {
		name       string
		authed     bool
		pathID     string
		body       any
		repo       *fakeIncomeRepo
		wantStatus int
	}{
		{name: "success", authed: true, pathID: "1", body: validIncomeBody, repo: &fakeIncomeRepo{}, wantStatus: http.StatusOK},
		{name: "unauthorized", authed: false, pathID: "1", body: validIncomeBody, repo: &fakeIncomeRepo{}, wantStatus: http.StatusUnauthorized},
		{
			name: "not found", authed: true, pathID: "99", body: validIncomeBody,
			repo: &fakeIncomeRepo{
				updateIncomeRecord: func(_ context.Context, _ int64, _ repository.UpdateIncomeRecordParams) (*repository.IncomeRecordResult, error) {
					return nil, nil
				},
			},
			wantStatus: http.StatusNotFound,
		},
		{name: "bad request when id not numeric", authed: true, pathID: "abc", body: validIncomeBody, repo: &fakeIncomeRepo{}, wantStatus: http.StatusBadRequest},
		{
			name:   "bad request when amount zero",
			authed: true, pathID: "1",
			body:       map[string]any{"transaction_date": "2026-06-25", "amount": 0, "name": "給与", "income_type": "salary", "emoji": "🏢"},
			repo:       &fakeIncomeRepo{},
			wantStatus: http.StatusBadRequest,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			r := testutil.NewRequest(t, http.MethodPut, "/income-records/"+tc.pathID, tc.body)
			r.SetPathValue("id", tc.pathID)
			if tc.authed {
				r = authCtx(r, 1)
			}
			w := testutil.NewRecorder()
			UpdateIncomeRecordHandler(tc.repo)(w, r)
			testutil.AssertStatus(t, w, tc.wantStatus)
		})
	}
}

func TestDeleteIncomeRecordHandler(t *testing.T) {
	tests := []struct {
		name       string
		authed     bool
		pathID     string
		repo       *fakeIncomeRepo
		wantStatus int
	}{
		{name: "success", authed: true, pathID: "1", repo: &fakeIncomeRepo{}, wantStatus: http.StatusNoContent},
		{name: "unauthorized", authed: false, pathID: "1", repo: &fakeIncomeRepo{}, wantStatus: http.StatusUnauthorized},
		{
			name: "not found", authed: true, pathID: "99",
			repo: &fakeIncomeRepo{
				deleteIncomeRecord: func(_ context.Context, _, _ int64) (bool, error) { return false, nil },
			},
			wantStatus: http.StatusNotFound,
		},
		{name: "bad request when id not numeric", authed: true, pathID: "abc", repo: &fakeIncomeRepo{}, wantStatus: http.StatusBadRequest},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			r := testutil.NewRequest(t, http.MethodDelete, "/income-records/"+tc.pathID, nil)
			r.SetPathValue("id", tc.pathID)
			if tc.authed {
				r = authCtx(r, 1)
			}
			w := testutil.NewRecorder()
			DeleteIncomeRecordHandler(tc.repo)(w, r)
			testutil.AssertStatus(t, w, tc.wantStatus)
		})
	}
}

func TestGetBaseIncomeHandler(t *testing.T) {
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
			r := testutil.NewRequest(t, http.MethodGet, "/base-income", nil)
			if tc.authed {
				r = authCtx(r, 1)
			}
			w := testutil.NewRecorder()
			GetBaseIncomeHandler(&fakeIncomeRepo{})(w, r)
			testutil.AssertStatus(t, w, tc.wantStatus)
		})
	}
}

func TestUpdateBaseIncomeHandler(t *testing.T) {
	tests := []struct {
		name       string
		authed     bool
		body       any
		wantStatus int
	}{
		{name: "success", authed: true, body: map[string]any{"amount": 280000}, wantStatus: http.StatusOK},
		{name: "success with zero amount", authed: true, body: map[string]any{"amount": 0}, wantStatus: http.StatusOK},
		{name: "unauthorized", authed: false, body: map[string]any{"amount": 280000}, wantStatus: http.StatusUnauthorized},
		{
			name:       "bad request when amount negative",
			authed:     true,
			body:       map[string]any{"amount": -1},
			wantStatus: http.StatusBadRequest,
		},
		{
			name:       "bad request when amount missing",
			authed:     true,
			body:       map[string]any{},
			wantStatus: http.StatusBadRequest,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			r := testutil.NewRequest(t, http.MethodPut, "/base-income", tc.body)
			if tc.authed {
				r = authCtx(r, 1)
			}
			w := testutil.NewRecorder()
			UpdateBaseIncomeHandler(&fakeIncomeRepo{})(w, r)
			testutil.AssertStatus(t, w, tc.wantStatus)
		})
	}
}
