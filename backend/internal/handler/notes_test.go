package handler

import (
	"context"
	"net/http"
	"testing"

	"github.com/utibori-jp/atoikura/backend/internal/repository"
	"github.com/utibori-jp/atoikura/backend/internal/testutil"
)

type fakeNoteRepo struct {
	getMonthlyReviewNotes    func(context.Context, int64, string) ([]repository.MonthlyReviewNote, error)
	upsertMonthlyReviewNotes func(context.Context, int64, string, []repository.MonthlyReviewNote) ([]repository.MonthlyReviewNote, error)
	getDailyNotesByMonth     func(context.Context, int64, string) ([]repository.DailyNote, error)
	upsertDailyNote          func(context.Context, int64, string, string) (*repository.DailyNote, error)
}

func (f *fakeNoteRepo) GetMonthlyReviewNotes(ctx context.Context, user_id int64, year_month string) ([]repository.MonthlyReviewNote, error) {
	if f.getMonthlyReviewNotes != nil {
		return f.getMonthlyReviewNotes(ctx, user_id, year_month)
	}
	return []repository.MonthlyReviewNote{}, nil
}

func (f *fakeNoteRepo) UpsertMonthlyReviewNotes(ctx context.Context, user_id int64, year_month string, notes []repository.MonthlyReviewNote) ([]repository.MonthlyReviewNote, error) {
	if f.upsertMonthlyReviewNotes != nil {
		return f.upsertMonthlyReviewNotes(ctx, user_id, year_month, notes)
	}
	return notes, nil
}

func (f *fakeNoteRepo) GetDailyNotesByMonth(ctx context.Context, user_id int64, year_month string) ([]repository.DailyNote, error) {
	if f.getDailyNotesByMonth != nil {
		return f.getDailyNotesByMonth(ctx, user_id, year_month)
	}
	return []repository.DailyNote{}, nil
}

func (f *fakeNoteRepo) UpsertDailyNote(ctx context.Context, user_id int64, date string, note_text string) (*repository.DailyNote, error) {
	if f.upsertDailyNote != nil {
		return f.upsertDailyNote(ctx, user_id, date, note_text)
	}
	return &repository.DailyNote{Date: date, Note: &note_text}, nil
}

func TestGetMonthlyReviewsHandler(t *testing.T) {
	tests := []struct {
		name       string
		authed     bool
		yearMonth  string
		repo       *fakeNoteRepo
		wantStatus int
	}{
		{
			name:       "success",
			authed:     true,
			yearMonth:  "2026-06",
			repo:       &fakeNoteRepo{},
			wantStatus: http.StatusOK,
		},
		{
			name:       "unauthorized",
			authed:     false,
			yearMonth:  "2026-06",
			repo:       &fakeNoteRepo{},
			wantStatus: http.StatusUnauthorized,
		},
		{
			name:       "bad request when year_month missing",
			authed:     true,
			yearMonth:  "",
			repo:       &fakeNoteRepo{},
			wantStatus: http.StatusBadRequest,
		},
		{
			name:       "bad request when year_month invalid",
			authed:     true,
			yearMonth:  "2026-6",
			repo:       &fakeNoteRepo{},
			wantStatus: http.StatusBadRequest,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			path := "/notes/monthly-reviews"
			if tc.yearMonth != "" {
				path += "?year_month=" + tc.yearMonth
			}
			r := testutil.NewRequest(t, http.MethodGet, path, nil)
			if tc.authed {
				r = authCtx(r, 1)
			}
			w := testutil.NewRecorder()
			GetMonthlyReviewsHandler(tc.repo)(w, r)
			testutil.AssertStatus(t, w, tc.wantStatus)
		})
	}
}

func TestUpdateMonthlyReviewsHandler(t *testing.T) {
	tests := []struct {
		name       string
		authed     bool
		body       any
		repo       *fakeNoteRepo
		wantStatus int
	}{
		{
			name:   "success",
			authed: true,
			body: map[string]any{
				"year_month": "2026-06",
				"notes":      []map[string]any{{"category_id": 1, "note": "食費を抑えた"}},
			},
			repo:       &fakeNoteRepo{},
			wantStatus: http.StatusOK,
		},
		{
			name:   "success with empty notes",
			authed: true,
			body: map[string]any{
				"year_month": "2026-06",
				"notes":      []map[string]any{},
			},
			repo:       &fakeNoteRepo{},
			wantStatus: http.StatusOK,
		},
		{
			name:       "unauthorized",
			authed:     false,
			body:       map[string]any{"year_month": "2026-06", "notes": []map[string]any{}},
			repo:       &fakeNoteRepo{},
			wantStatus: http.StatusUnauthorized,
		},
		{
			name:   "bad request when year_month invalid",
			authed: true,
			body: map[string]any{
				"year_month": "invalid",
				"notes":      []map[string]any{},
			},
			repo:       &fakeNoteRepo{},
			wantStatus: http.StatusBadRequest,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			r := testutil.NewRequest(t, http.MethodPut, "/notes/monthly-reviews", tc.body)
			if tc.authed {
				r = authCtx(r, 1)
			}
			w := testutil.NewRecorder()
			UpdateMonthlyReviewsHandler(tc.repo)(w, r)
			testutil.AssertStatus(t, w, tc.wantStatus)
		})
	}
}

func TestGetDailyNotesHandler(t *testing.T) {
	tests := []struct {
		name       string
		authed     bool
		yearMonth  string
		repo       *fakeNoteRepo
		wantStatus int
	}{
		{
			name:       "success",
			authed:     true,
			yearMonth:  "2026-06",
			repo:       &fakeNoteRepo{},
			wantStatus: http.StatusOK,
		},
		{
			name:       "unauthorized",
			authed:     false,
			yearMonth:  "2026-06",
			repo:       &fakeNoteRepo{},
			wantStatus: http.StatusUnauthorized,
		},
		{
			name:       "bad request when year_month missing",
			authed:     true,
			yearMonth:  "",
			repo:       &fakeNoteRepo{},
			wantStatus: http.StatusBadRequest,
		},
		{
			name:       "bad request when year_month invalid",
			authed:     true,
			yearMonth:  "2026-6",
			repo:       &fakeNoteRepo{},
			wantStatus: http.StatusBadRequest,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			path := "/notes/daily"
			if tc.yearMonth != "" {
				path += "?year_month=" + tc.yearMonth
			}
			r := testutil.NewRequest(t, http.MethodGet, path, nil)
			if tc.authed {
				r = authCtx(r, 1)
			}
			w := testutil.NewRecorder()
			GetDailyNotesHandler(tc.repo)(w, r)
			testutil.AssertStatus(t, w, tc.wantStatus)
		})
	}
}

func TestUpdateDailyNoteHandler(t *testing.T) {
	tests := []struct {
		name       string
		authed     bool
		pathDate   string
		body       any
		repo       *fakeNoteRepo
		wantStatus int
	}{
		{
			name:       "success",
			authed:     true,
			pathDate:   "2026-06-01",
			body:       map[string]any{"note": "今日は節約した"},
			repo:       &fakeNoteRepo{},
			wantStatus: http.StatusOK,
		},
		{
			name:       "success with empty note deletes it",
			authed:     true,
			pathDate:   "2026-06-01",
			body:       map[string]any{"note": ""},
			repo:       &fakeNoteRepo{},
			wantStatus: http.StatusOK,
		},
		{
			name:       "unauthorized",
			authed:     false,
			pathDate:   "2026-06-01",
			body:       map[string]any{"note": "test"},
			repo:       &fakeNoteRepo{},
			wantStatus: http.StatusUnauthorized,
		},
		{
			name:       "bad request when date format invalid",
			authed:     true,
			pathDate:   "not-a-date",
			body:       map[string]any{"note": "test"},
			repo:       &fakeNoteRepo{},
			wantStatus: http.StatusBadRequest,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			r := testutil.NewRequest(t, http.MethodPut, "/notes/daily/"+tc.pathDate, tc.body)
			r.SetPathValue("date", tc.pathDate)
			if tc.authed {
				r = authCtx(r, 1)
			}
			w := testutil.NewRecorder()
			UpdateDailyNoteHandler(tc.repo)(w, r)
			testutil.AssertStatus(t, w, tc.wantStatus)
		})
	}
}
