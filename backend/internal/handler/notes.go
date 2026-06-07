package handler

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"

	"github.com/utibori-jp/atoikura/backend/internal/repository"
)

type noteRepo interface {
	GetMonthlyReviewNotes(ctx context.Context, user_id int64, year_month string) ([]repository.MonthlyReviewNote, error)
	UpsertMonthlyReviewNotes(ctx context.Context, user_id int64, year_month string, notes []repository.MonthlyReviewNote) ([]repository.MonthlyReviewNote, error)
	GetDailyNotesByMonth(ctx context.Context, user_id int64, year_month string) ([]repository.DailyNote, error)
	UpsertDailyNote(ctx context.Context, user_id int64, date string, note_text string) (*repository.DailyNote, error)
}

type monthlyReviewNoteJSON struct {
	CategoryID int32  `json:"category_id"`
	Note       string `json:"note"`
}

type monthlyReviewResponseJSON struct {
	YearMonth string                  `json:"year_month"`
	Notes     []monthlyReviewNoteJSON `json:"notes"`
}

func GetMonthlyReviewsHandler(repo noteRepo) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user_id, ok := UserIDFromContext(r.Context())
		if !ok {
			WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "認証情報が不正です")
			return
		}

		year_month := r.URL.Query().Get("year_month")
		if year_month == "" || !yearMonthPattern.MatchString(year_month) {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "year_monthはYYYY-MM形式で指定してください")
			return
		}

		notes, err := repo.GetMonthlyReviewNotes(r.Context(), user_id, year_month)
		if err != nil {
			slog.Error("getting monthly review notes", "error", err)
			WriteError(w, http.StatusInternalServerError, "INTERNAL_SERVER_ERROR", "予期しないエラーが発生しました")
			return
		}

		note_json := make([]monthlyReviewNoteJSON, len(notes))
		for i, n := range notes {
			note_json[i] = monthlyReviewNoteJSON{CategoryID: n.CategoryID, Note: n.Note}
		}

		WriteJSON(w, http.StatusOK, monthlyReviewResponseJSON{
			YearMonth: year_month,
			Notes:     note_json,
		})
	}
}

type monthlyReviewRequestJSON struct {
	YearMonth string                  `json:"year_month"`
	Notes     []monthlyReviewNoteJSON `json:"notes"`
}

func UpdateMonthlyReviewsHandler(repo noteRepo) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user_id, ok := UserIDFromContext(r.Context())
		if !ok {
			WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "認証情報が不正です")
			return
		}

		var req monthlyReviewRequestJSON
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "リクエストの形式が不正です")
			return
		}

		if !yearMonthPattern.MatchString(req.YearMonth) {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "year_monthはYYYY-MM形式で指定してください")
			return
		}

		repo_notes := make([]repository.MonthlyReviewNote, len(req.Notes))
		for i, n := range req.Notes {
			repo_notes[i] = repository.MonthlyReviewNote{CategoryID: n.CategoryID, Note: n.Note}
		}

		saved, err := repo.UpsertMonthlyReviewNotes(r.Context(), user_id, req.YearMonth, repo_notes)
		if err != nil {
			slog.Error("upserting monthly review notes", "error", err)
			WriteError(w, http.StatusInternalServerError, "INTERNAL_SERVER_ERROR", "予期しないエラーが発生しました")
			return
		}

		note_json := make([]monthlyReviewNoteJSON, len(saved))
		for i, n := range saved {
			note_json[i] = monthlyReviewNoteJSON{CategoryID: n.CategoryID, Note: n.Note}
		}

		WriteJSON(w, http.StatusOK, monthlyReviewResponseJSON{
			YearMonth: req.YearMonth,
			Notes:     note_json,
		})
	}
}

type dailyNoteJSON struct {
	Date string  `json:"date"`
	Note *string `json:"note"`
}

type dailyNoteListResponseJSON struct {
	YearMonth string          `json:"year_month"`
	Notes     []dailyNoteJSON `json:"notes"`
}

func GetDailyNotesHandler(repo noteRepo) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user_id, ok := UserIDFromContext(r.Context())
		if !ok {
			WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "認証情報が不正です")
			return
		}

		year_month := r.URL.Query().Get("year_month")
		if year_month == "" || !yearMonthPattern.MatchString(year_month) {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "year_monthはYYYY-MM形式で指定してください")
			return
		}

		notes, err := repo.GetDailyNotesByMonth(r.Context(), user_id, year_month)
		if err != nil {
			slog.Error("getting daily notes", "error", err)
			WriteError(w, http.StatusInternalServerError, "INTERNAL_SERVER_ERROR", "予期しないエラーが発生しました")
			return
		}

		note_json := make([]dailyNoteJSON, len(notes))
		for i, n := range notes {
			note_json[i] = dailyNoteJSON{Date: n.Date, Note: n.Note}
		}

		WriteJSON(w, http.StatusOK, dailyNoteListResponseJSON{
			YearMonth: year_month,
			Notes:     note_json,
		})
	}
}

func UpdateDailyNoteHandler(repo noteRepo) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user_id, ok := UserIDFromContext(r.Context())
		if !ok {
			WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "認証情報が不正です")
			return
		}

		date := r.PathValue("date")
		if !datePattern.MatchString(date) {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "dateはYYYY-MM-DD形式で指定してください")
			return
		}

		type request struct {
			Note string `json:"note"`
		}
		var req request
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "リクエストの形式が不正です")
			return
		}

		saved, err := repo.UpsertDailyNote(r.Context(), user_id, date, req.Note)
		if err != nil {
			slog.Error("upserting daily note", "error", err)
			WriteError(w, http.StatusInternalServerError, "INTERNAL_SERVER_ERROR", "予期しないエラーが発生しました")
			return
		}

		WriteJSON(w, http.StatusOK, dailyNoteJSON{Date: saved.Date, Note: saved.Note})
	}
}
