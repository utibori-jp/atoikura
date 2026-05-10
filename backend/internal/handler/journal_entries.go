package handler

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"regexp"
	"strconv"
	"time"

	"github.com/utibori-jp/atoikura/backend/internal/repository"
)

var yearMonthPattern = regexp.MustCompile(`^\d{4}-\d{2}$`)

type journalEntryJSON struct {
	ID              int32   `json:"id"`
	TransactionDate string  `json:"transaction_date"`
	Item            *string `json:"item"`
	Amount          int32   `json:"amount"`
	CategoryID      int32   `json:"category_id"`
	CategoryName    string  `json:"category_name"`
	GroupID         int32   `json:"group_id"`
	GroupName       string  `json:"group_name"`
	IsExcluded      bool    `json:"is_excluded"`
	Note            *string `json:"note"`
	CreatedAt       string  `json:"created_at"`
}

func viewToJournalEntryJSON(e repository.JournalEntryView) journalEntryJSON {
	return journalEntryJSON{
		ID:              e.ID,
		TransactionDate: e.TransactionDate,
		Item:            e.Item,
		Amount:          e.Amount,
		CategoryID:      e.CategoryID,
		CategoryName:    e.CategoryName,
		GroupID:         e.GroupID,
		GroupName:       e.GroupName,
		IsExcluded:      e.IsExcluded,
		Note:            e.Note,
		CreatedAt:       toJST(e.CreatedAt),
	}
}

func CreateJournalEntryHandler(repo *repository.Repository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user_id, ok := UserIDFromContext(r.Context())
		if !ok {
			WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "認証情報が不正です")
			return
		}

		type request struct {
			TransactionDate string  `json:"transaction_date"`
			Item            *string `json:"item"`
			Amount          *int32  `json:"amount"`
			CategoryID      *int32  `json:"category_id"`
			IsExcluded      *bool   `json:"is_excluded"`
			Note            *string `json:"note"`
		}
		var req request
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "リクエストの形式が不正です")
			return
		}

		tx_date, err := time.Parse("2006-01-02", req.TransactionDate)
		if err != nil {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "transaction_dateはYYYY-MM-DD形式で指定してください")
			return
		}

		if req.Amount == nil || *req.Amount < 1 {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "amountは正の整数である必要があります")
			return
		}

		if req.CategoryID == nil {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "category_idは必須です")
			return
		}

		if req.IsExcluded == nil {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "is_excludedは必須です")
			return
		}

		if req.Item != nil && len([]rune(*req.Item)) > 100 {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "itemは100文字以内で入力してください")
			return
		}

		if req.Note != nil && len([]rune(*req.Note)) > 500 {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "noteは500文字以内で入力してください")
			return
		}

		cat, err := repo.GetActiveExpenseCategory(r.Context(), int64(*req.CategoryID), user_id)
		if err != nil {
			slog.Error("getting expense category for validation", "error", err)
			WriteError(w, http.StatusInternalServerError, "INTERNAL_SERVER_ERROR", "予期しないエラーが発生しました")
			return
		}
		if cat == nil {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "指定されたcategory_idは存在しないか削除済みです")
			return
		}

		entry, err := repo.CreateJournalEntry(r.Context(), repository.CreateJournalEntryParams{
			TransactionDate: tx_date,
			Item:            req.Item,
			Amount:          *req.Amount,
			CategoryID:      *req.CategoryID,
			UserID:          int32(user_id),
			IsExcluded:      *req.IsExcluded,
			Note:            req.Note,
		})
		if err != nil {
			slog.Error("creating journal entry", "error", err)
			WriteError(w, http.StatusInternalServerError, "INTERNAL_SERVER_ERROR", "予期しないエラーが発生しました")
			return
		}

		WriteJSON(w, http.StatusCreated, viewToJournalEntryJSON(*entry))
	}
}

func ListJournalEntriesHandler(repo *repository.Repository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user_id, ok := UserIDFromContext(r.Context())
		if !ok {
			WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "認証情報が不正です")
			return
		}

		year_month := r.URL.Query().Get("year_month")
		if !yearMonthPattern.MatchString(year_month) {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "year_monthはYYYY-MM形式で指定してください")
			return
		}

		first_day, err := time.Parse("2006-01-02", year_month+"-01")
		if err != nil {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "year_monthはYYYY-MM形式で指定してください")
			return
		}

		entries, err := repo.ListJournalEntriesByMonth(r.Context(), user_id, first_day)
		if err != nil {
			slog.Error("listing journal entries", "error", err)
			WriteError(w, http.StatusInternalServerError, "INTERNAL_SERVER_ERROR", "予期しないエラーが発生しました")
			return
		}

		type dailyEntriesJSON struct {
			Date           string             `json:"date"`
			JournalEntries []journalEntryJSON `json:"journal_entries"`
		}
		type responseJSON struct {
			YearMonth string             `json:"year_month"`
			Entries   []dailyEntriesJSON `json:"entries"`
		}

		date_order := []string{}
		date_map := map[string][]journalEntryJSON{}
		for _, e := range entries {
			je := viewToJournalEntryJSON(e)
			if _, exists := date_map[e.TransactionDate]; !exists {
				date_order = append(date_order, e.TransactionDate)
			}
			date_map[e.TransactionDate] = append(date_map[e.TransactionDate], je)
		}

		grouped := make([]dailyEntriesJSON, len(date_order))
		for i, date := range date_order {
			grouped[i] = dailyEntriesJSON{
				Date:           date,
				JournalEntries: date_map[date],
			}
		}

		WriteJSON(w, http.StatusOK, responseJSON{
			YearMonth: year_month,
			Entries:   grouped,
		})
	}
}

func UpdateJournalEntryHandler(repo *repository.Repository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user_id, ok := UserIDFromContext(r.Context())
		if !ok {
			WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "認証情報が不正です")
			return
		}

		raw_id := r.PathValue("id")
		entry_id, err := strconv.ParseInt(raw_id, 10, 32)
		if err != nil || entry_id < 1 {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "idは正の整数で指定してください")
			return
		}

		type request struct {
			TransactionDate string  `json:"transaction_date"`
			Item            *string `json:"item"`
			Amount          *int32  `json:"amount"`
			CategoryID      *int32  `json:"category_id"`
			IsExcluded      *bool   `json:"is_excluded"`
			Note            *string `json:"note"`
		}
		var req request
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "リクエストの形式が不正です")
			return
		}

		tx_date, err := time.Parse("2006-01-02", req.TransactionDate)
		if err != nil {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "transaction_dateはYYYY-MM-DD形式で指定してください")
			return
		}

		if req.Amount == nil || *req.Amount < 1 {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "amountは正の整数である必要があります")
			return
		}

		if req.CategoryID == nil {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "category_idは必須です")
			return
		}

		if req.IsExcluded == nil {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "is_excludedは必須です")
			return
		}

		if req.Item != nil && len([]rune(*req.Item)) > 100 {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "itemは100文字以内で入力してください")
			return
		}

		if req.Note != nil && len([]rune(*req.Note)) > 500 {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "noteは500文字以内で入力してください")
			return
		}

		cat, err := repo.GetActiveExpenseCategory(r.Context(), int64(*req.CategoryID), user_id)
		if err != nil {
			slog.Error("getting expense category for validation", "error", err)
			WriteError(w, http.StatusInternalServerError, "INTERNAL_SERVER_ERROR", "予期しないエラーが発生しました")
			return
		}
		if cat == nil {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "指定されたcategory_idは存在しないか削除済みです")
			return
		}

		entry, err := repo.UpdateJournalEntry(r.Context(), repository.UpdateJournalEntryParams{
			ID:              int32(entry_id),
			UserID:          int32(user_id),
			TransactionDate: tx_date,
			Item:            req.Item,
			Amount:          *req.Amount,
			CategoryID:      *req.CategoryID,
			IsExcluded:      *req.IsExcluded,
			Note:            req.Note,
		})
		if err != nil {
			slog.Error("updating journal entry", "error", err)
			WriteError(w, http.StatusInternalServerError, "INTERNAL_SERVER_ERROR", "予期しないエラーが発生しました")
			return
		}
		if entry == nil {
			WriteError(w, http.StatusNotFound, "NOT_FOUND", "仕訳が見つかりません")
			return
		}

		WriteJSON(w, http.StatusOK, viewToJournalEntryJSON(*entry))
	}
}

func DeleteJournalEntryHandler(repo *repository.Repository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user_id, ok := UserIDFromContext(r.Context())
		if !ok {
			WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "認証情報が不正です")
			return
		}

		raw_id := r.PathValue("id")
		entry_id, err := strconv.ParseInt(raw_id, 10, 32)
		if err != nil || entry_id < 1 {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "idは正の整数で指定してください")
			return
		}

		deleted, err := repo.DeleteJournalEntry(r.Context(), entry_id, user_id)
		if err != nil {
			slog.Error("deleting journal entry", "error", err)
			WriteError(w, http.StatusInternalServerError, "INTERNAL_SERVER_ERROR", "予期しないエラーが発生しました")
			return
		}
		if !deleted {
			WriteError(w, http.StatusNotFound, "NOT_FOUND", "仕訳が見つかりません")
			return
		}

		w.WriteHeader(http.StatusNoContent)
	}
}
