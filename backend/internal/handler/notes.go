package handler

import (
	"encoding/json"
	"log/slog"
	"net/http"

	"github.com/utibori-jp/atoikura/backend/internal/repository"
)

type monthlyReviewNoteJSON struct {
	CategoryID int32  `json:"category_id"`
	Note       string `json:"note"`
}

type monthlyReviewResponseJSON struct {
	YearMonth string                  `json:"year_month"`
	Notes     []monthlyReviewNoteJSON `json:"notes"`
}

func GetMonthlyReviewsHandler(repo *repository.Repository) http.HandlerFunc {
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

func UpdateMonthlyReviewsHandler(repo *repository.Repository) http.HandlerFunc {
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
