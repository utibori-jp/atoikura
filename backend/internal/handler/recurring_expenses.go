package handler

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"

	"github.com/utibori-jp/atoikura/backend/internal/repository"
)

type recurringExpenseRepo interface {
	ListRecurringExpenses(ctx context.Context, user_id int64) ([]repository.RecurringExpenseResult, error)
	ListPendingRecurring(ctx context.Context, user_id int64, year_month string) ([]repository.PendingRecurringResult, error)
	CreateRecurringExpense(ctx context.Context, user_id int64, params repository.CreateRecurringExpenseParams) (*repository.RecurringExpenseResult, error)
	UpdateRecurringExpense(ctx context.Context, user_id int64, params repository.UpdateRecurringExpenseParams) (*repository.RecurringExpenseResult, error)
	DeleteRecurringExpense(ctx context.Context, id int64, user_id int64) (bool, error)
}

type recurringExpenseJSON struct {
	ID           int32  `json:"id"`
	Name         string `json:"name"`
	Emoji        string `json:"emoji"`
	BillingDay   int16  `json:"billing_day"`
	Amount       *int32 `json:"amount"`
	Type         string `json:"type"`
	CategoryID   int32  `json:"category_id"`
	GroupID      int32  `json:"group_id"`
	GroupName    string `json:"group_name"`
	CategoryName string `json:"category_name"`
}

func toRecurringExpenseJSON(r repository.RecurringExpenseResult) recurringExpenseJSON {
	return recurringExpenseJSON{
		ID:           r.ID,
		Name:         r.Name,
		Emoji:        r.Emoji,
		BillingDay:   r.BillingDay,
		Amount:       r.Amount,
		Type:         r.Type,
		CategoryID:   r.CategoryID,
		GroupID:      r.GroupID,
		GroupName:    r.GroupName,
		CategoryName: r.CategoryName,
	}
}

func ListRecurringExpensesHandler(repo recurringExpenseRepo) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user_id, ok := UserIDFromContext(r.Context())
		if !ok {
			WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "認証情報が不正です")
			return
		}

		expenses, err := repo.ListRecurringExpenses(r.Context(), user_id)
		if err != nil {
			slog.Error("listing recurring expenses", "error", err)
			WriteError(w, http.StatusInternalServerError, "INTERNAL_SERVER_ERROR", "予期しないエラーが発生しました")
			return
		}

		items := make([]recurringExpenseJSON, len(expenses))
		for i, e := range expenses {
			items[i] = toRecurringExpenseJSON(e)
		}

		WriteJSON(w, http.StatusOK, map[string]any{"recurring_expenses": items})
	}
}

func ListPendingRecurringHandler(repo recurringExpenseRepo) http.HandlerFunc {
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

		pending, err := repo.ListPendingRecurring(r.Context(), user_id, year_month)
		if err != nil {
			slog.Error("listing pending recurring", "error", err)
			WriteError(w, http.StatusInternalServerError, "INTERNAL_SERVER_ERROR", "予期しないエラーが発生しました")
			return
		}

		type pendingJSON struct {
			ID         int32  `json:"id"`
			Name       string `json:"name"`
			Emoji      string `json:"emoji"`
			BillingDay int16  `json:"billing_day"`
			LastAmount int32  `json:"last_amount"`
			GroupName  string `json:"group_name"`
		}
		items := make([]pendingJSON, len(pending))
		for i, p := range pending {
			items[i] = pendingJSON{
				ID:         p.ID,
				Name:       p.Name,
				Emoji:      p.Emoji,
				BillingDay: p.BillingDay,
				LastAmount: p.LastAmount,
				GroupName:  p.GroupName,
			}
		}

		WriteJSON(w, http.StatusOK, map[string]any{"pending": items})
	}
}

func CreateRecurringExpenseHandler(repo recurringExpenseRepo) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user_id, ok := UserIDFromContext(r.Context())
		if !ok {
			WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "認証情報が不正です")
			return
		}

		type request struct {
			Name       *string `json:"name"`
			Emoji      *string `json:"emoji"`
			BillingDay *int16  `json:"billing_day"`
			Amount     *int32  `json:"amount"`
			Type       *string `json:"type"`
			CategoryID *int32  `json:"category_id"`
		}
		var req request
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "リクエストの形式が不正です")
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
		if req.Emoji == nil {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "emojiは必須です")
			return
		}
		if req.BillingDay == nil || *req.BillingDay < 1 || *req.BillingDay > 31 {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "billing_dayは1〜31の整数で指定してください")
			return
		}
		if req.Type == nil || (*req.Type != "fixed" && *req.Type != "variable") {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "typeはfixedまたはvariableで指定してください")
			return
		}
		if req.CategoryID == nil {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "category_idは必須です")
			return
		}

		expense, err := repo.CreateRecurringExpense(r.Context(), user_id, repository.CreateRecurringExpenseParams{
			Name:       *req.Name,
			Emoji:      *req.Emoji,
			BillingDay: *req.BillingDay,
			Amount:     req.Amount,
			Type:       *req.Type,
			CategoryID: *req.CategoryID,
		})
		if err != nil {
			slog.Error("creating recurring expense", "error", err)
			WriteError(w, http.StatusInternalServerError, "INTERNAL_SERVER_ERROR", "予期しないエラーが発生しました")
			return
		}

		WriteJSON(w, http.StatusCreated, toRecurringExpenseJSON(*expense))
	}
}

func UpdateRecurringExpenseHandler(repo recurringExpenseRepo) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user_id, ok := UserIDFromContext(r.Context())
		if !ok {
			WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "認証情報が不正です")
			return
		}

		expense_id, ok := parsePathID(w, r)
		if !ok {
			return
		}

		type request struct {
			Name       *string `json:"name"`
			Emoji      *string `json:"emoji"`
			BillingDay *int16  `json:"billing_day"`
			Amount     *int32  `json:"amount"`
			Type       *string `json:"type"`
			CategoryID *int32  `json:"category_id"`
		}
		var req request
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "リクエストの形式が不正です")
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
		if req.Emoji == nil {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "emojiは必須です")
			return
		}
		if req.BillingDay == nil || *req.BillingDay < 1 || *req.BillingDay > 31 {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "billing_dayは1〜31の整数で指定してください")
			return
		}
		if req.Type == nil || (*req.Type != "fixed" && *req.Type != "variable") {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "typeはfixedまたはvariableで指定してください")
			return
		}
		if req.CategoryID == nil {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "category_idは必須です")
			return
		}

		expense, err := repo.UpdateRecurringExpense(r.Context(), user_id, repository.UpdateRecurringExpenseParams{
			ID:         int32(expense_id),
			Name:       *req.Name,
			Emoji:      *req.Emoji,
			BillingDay: *req.BillingDay,
			Amount:     req.Amount,
			Type:       *req.Type,
			CategoryID: *req.CategoryID,
		})
		if err != nil {
			slog.Error("updating recurring expense", "error", err)
			WriteError(w, http.StatusInternalServerError, "INTERNAL_SERVER_ERROR", "予期しないエラーが発生しました")
			return
		}
		if expense == nil {
			WriteError(w, http.StatusNotFound, "NOT_FOUND", "定期支出が見つかりません")
			return
		}

		WriteJSON(w, http.StatusOK, toRecurringExpenseJSON(*expense))
	}
}

func DeleteRecurringExpenseHandler(repo recurringExpenseRepo) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user_id, ok := UserIDFromContext(r.Context())
		if !ok {
			WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "認証情報が不正です")
			return
		}

		expense_id, ok := parsePathID(w, r)
		if !ok {
			return
		}

		deleted, err := repo.DeleteRecurringExpense(r.Context(), expense_id, user_id)
		if err != nil {
			slog.Error("deleting recurring expense", "error", err)
			WriteError(w, http.StatusInternalServerError, "INTERNAL_SERVER_ERROR", "予期しないエラーが発生しました")
			return
		}
		if !deleted {
			WriteError(w, http.StatusNotFound, "NOT_FOUND", "定期支出が見つかりません")
			return
		}

		w.WriteHeader(http.StatusNoContent)
	}
}
