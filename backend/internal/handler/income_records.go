package handler

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"time"

	"github.com/utibori-jp/atoikura/backend/internal/repository"
)

type incomeRecordRepo interface {
	ListIncomeRecords(ctx context.Context, user_id int64, year_month string) ([]repository.IncomeRecordResult, error)
	CreateIncomeRecord(ctx context.Context, user_id int64, params repository.CreateIncomeRecordParams) (*repository.IncomeRecordResult, error)
	UpdateIncomeRecord(ctx context.Context, user_id int64, params repository.UpdateIncomeRecordParams) (*repository.IncomeRecordResult, error)
	DeleteIncomeRecord(ctx context.Context, id int64, user_id int64) (bool, error)
	GetBaseIncome(ctx context.Context, user_id int64) (int32, error)
	UpsertBaseIncome(ctx context.Context, user_id int64, amount int32) (int32, error)
}

type incomeRecordJSON struct {
	ID              int32  `json:"id"`
	TransactionDate string `json:"transaction_date"`
	Amount          int32  `json:"amount"`
	Name            string `json:"name"`
	IncomeType      string `json:"income_type"`
	Emoji           string `json:"emoji"`
	Note            string `json:"note"`
}

func toIncomeRecordJSON(e repository.IncomeRecordResult) incomeRecordJSON {
	return incomeRecordJSON{
		ID:              e.ID,
		TransactionDate: e.TransactionDate,
		Amount:          e.Amount,
		Name:            e.Name,
		IncomeType:      e.IncomeType,
		Emoji:           e.Emoji,
		Note:            e.Note,
	}
}

var validIncomeTypes = map[string]bool{
	"salary": true,
	"side":   true,
	"bonus":  true,
	"oneoff": true,
}

func ListIncomeRecordsHandler(repo incomeRecordRepo) http.HandlerFunc {
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

		records, err := repo.ListIncomeRecords(r.Context(), user_id, year_month)
		if err != nil {
			slog.Error("listing income records", "error", err)
			WriteError(w, http.StatusInternalServerError, "INTERNAL_SERVER_ERROR", "予期しないエラーが発生しました")
			return
		}

		items := make([]incomeRecordJSON, len(records))
		for i, e := range records {
			items[i] = toIncomeRecordJSON(e)
		}

		WriteJSON(w, http.StatusOK, map[string]any{"income_records": items})
	}
}

func CreateIncomeRecordHandler(repo incomeRecordRepo) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user_id, ok := UserIDFromContext(r.Context())
		if !ok {
			WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "認証情報が不正です")
			return
		}

		type request struct {
			TransactionDate string  `json:"transaction_date"`
			Amount          *int32  `json:"amount"`
			Name            *string `json:"name"`
			IncomeType      *string `json:"income_type"`
			Emoji           *string `json:"emoji"`
			Note            string  `json:"note"`
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
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "amountは正の整数で指定してください")
			return
		}
		if req.Name == nil || *req.Name == "" {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "nameは必須です")
			return
		}
		if len([]rune(*req.Name)) > 50 {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "nameは50文字以内で入力してください")
			return
		}
		if req.IncomeType == nil || !validIncomeTypes[*req.IncomeType] {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "income_typeはsalary/side/bonus/oneoffのいずれかで指定してください")
			return
		}
		if req.Emoji == nil {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "emojiは必須です")
			return
		}

		record, err := repo.CreateIncomeRecord(r.Context(), user_id, repository.CreateIncomeRecordParams{
			TransactionDate: tx_date,
			Amount:          *req.Amount,
			Name:            *req.Name,
			IncomeType:      *req.IncomeType,
			Emoji:           *req.Emoji,
			Note:            req.Note,
		})
		if err != nil {
			slog.Error("creating income record", "error", err)
			WriteError(w, http.StatusInternalServerError, "INTERNAL_SERVER_ERROR", "予期しないエラーが発生しました")
			return
		}

		WriteJSON(w, http.StatusCreated, toIncomeRecordJSON(*record))
	}
}

func UpdateIncomeRecordHandler(repo incomeRecordRepo) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user_id, ok := UserIDFromContext(r.Context())
		if !ok {
			WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "認証情報が不正です")
			return
		}

		record_id, ok := parsePathID(w, r)
		if !ok {
			return
		}

		type request struct {
			TransactionDate string  `json:"transaction_date"`
			Amount          *int32  `json:"amount"`
			Name            *string `json:"name"`
			IncomeType      *string `json:"income_type"`
			Emoji           *string `json:"emoji"`
			Note            string  `json:"note"`
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
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "amountは正の整数で指定してください")
			return
		}
		if req.Name == nil || *req.Name == "" {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "nameは必須です")
			return
		}
		if len([]rune(*req.Name)) > 50 {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "nameは50文字以内で入力してください")
			return
		}
		if req.IncomeType == nil || !validIncomeTypes[*req.IncomeType] {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "income_typeはsalary/side/bonus/oneoffのいずれかで指定してください")
			return
		}
		if req.Emoji == nil {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "emojiは必須です")
			return
		}

		record, err := repo.UpdateIncomeRecord(r.Context(), user_id, repository.UpdateIncomeRecordParams{
			ID:              int32(record_id),
			TransactionDate: tx_date,
			Amount:          *req.Amount,
			Name:            *req.Name,
			IncomeType:      *req.IncomeType,
			Emoji:           *req.Emoji,
			Note:            req.Note,
		})
		if err != nil {
			slog.Error("updating income record", "error", err)
			WriteError(w, http.StatusInternalServerError, "INTERNAL_SERVER_ERROR", "予期しないエラーが発生しました")
			return
		}
		if record == nil {
			WriteError(w, http.StatusNotFound, "NOT_FOUND", "収入記録が見つかりません")
			return
		}

		WriteJSON(w, http.StatusOK, toIncomeRecordJSON(*record))
	}
}

func DeleteIncomeRecordHandler(repo incomeRecordRepo) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user_id, ok := UserIDFromContext(r.Context())
		if !ok {
			WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "認証情報が不正です")
			return
		}

		record_id, ok := parsePathID(w, r)
		if !ok {
			return
		}

		deleted, err := repo.DeleteIncomeRecord(r.Context(), record_id, user_id)
		if err != nil {
			slog.Error("deleting income record", "error", err)
			WriteError(w, http.StatusInternalServerError, "INTERNAL_SERVER_ERROR", "予期しないエラーが発生しました")
			return
		}
		if !deleted {
			WriteError(w, http.StatusNotFound, "NOT_FOUND", "収入記録が見つかりません")
			return
		}

		w.WriteHeader(http.StatusNoContent)
	}
}

func GetBaseIncomeHandler(repo incomeRecordRepo) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user_id, ok := UserIDFromContext(r.Context())
		if !ok {
			WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "認証情報が不正です")
			return
		}

		amount, err := repo.GetBaseIncome(r.Context(), user_id)
		if err != nil {
			slog.Error("getting base income", "error", err)
			WriteError(w, http.StatusInternalServerError, "INTERNAL_SERVER_ERROR", "予期しないエラーが発生しました")
			return
		}

		WriteJSON(w, http.StatusOK, map[string]any{"amount": amount})
	}
}

func UpdateBaseIncomeHandler(repo incomeRecordRepo) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user_id, ok := UserIDFromContext(r.Context())
		if !ok {
			WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "認証情報が不正です")
			return
		}

		type request struct {
			Amount *int32 `json:"amount"`
		}
		var req request
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "リクエストの形式が不正です")
			return
		}

		if req.Amount == nil || *req.Amount < 0 {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "amountは0以上の整数で指定してください")
			return
		}

		amount, err := repo.UpsertBaseIncome(r.Context(), user_id, *req.Amount)
		if err != nil {
			slog.Error("upserting base income", "error", err)
			WriteError(w, http.StatusInternalServerError, "INTERNAL_SERVER_ERROR", "予期しないエラーが発生しました")
			return
		}

		WriteJSON(w, http.StatusOK, map[string]any{"amount": amount})
	}
}
