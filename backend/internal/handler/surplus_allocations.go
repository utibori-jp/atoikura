package handler

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"

	"github.com/utibori-jp/atoikura/backend/internal/repository"
)

type surplusAllocationRepo interface {
	ListSurplusAllocations(ctx context.Context, user_id int64, year_month string) ([]repository.SurplusAllocationResult, error)
	CreateSurplusAllocation(ctx context.Context, user_id int64, income_total int32, base_income int32, params repository.CreateSurplusAllocationParams) (*repository.SurplusAllocationResult, error)
	GetIncomeTotal(ctx context.Context, user_id int64, year_month string) (int32, error)
	GetBaseIncome(ctx context.Context, user_id int64) (int32, error)
}

type surplusAllocationJSON struct {
	ID            int32  `json:"id"`
	YearMonth     string `json:"year_month"`
	Amount        int32  `json:"amount"`
	Destination   string `json:"destination"`
	SavingsGoalID *int32 `json:"savings_goal_id"`
	CreatedAt     string `json:"created_at"`
}

func toSurplusAllocationJSON(a repository.SurplusAllocationResult) surplusAllocationJSON {
	return surplusAllocationJSON{
		ID:            a.ID,
		YearMonth:     a.YearMonth,
		Amount:        a.Amount,
		Destination:   a.Destination,
		SavingsGoalID: a.SavingsGoalID,
		CreatedAt:     toJST(a.CreatedAt),
	}
}

func ListSurplusAllocationsHandler(repo surplusAllocationRepo) http.HandlerFunc {
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

		allocations, err := repo.ListSurplusAllocations(r.Context(), user_id, year_month)
		if err != nil {
			slog.Error("listing surplus allocations", "error", err)
			WriteError(w, http.StatusInternalServerError, "INTERNAL_SERVER_ERROR", "予期しないエラーが発生しました")
			return
		}

		items := make([]surplusAllocationJSON, len(allocations))
		for i, a := range allocations {
			items[i] = toSurplusAllocationJSON(a)
		}

		WriteJSON(w, http.StatusOK, map[string]any{"surplus_allocations": items})
	}
}

func CreateSurplusAllocationHandler(repo surplusAllocationRepo) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user_id, ok := UserIDFromContext(r.Context())
		if !ok {
			WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "認証情報が不正です")
			return
		}

		type request struct {
			YearMonth     *string `json:"year_month"`
			Amount        *int32  `json:"amount"`
			Destination   *string `json:"destination"`
			SavingsGoalID *int32  `json:"savings_goal_id"`
		}
		var req request
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "リクエストの形式が不正です")
			return
		}

		if req.YearMonth == nil || !yearMonthPattern.MatchString(*req.YearMonth) {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "year_monthはYYYY-MM形式で指定してください")
			return
		}
		if req.Amount == nil || *req.Amount < 1 {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "amountは正の整数で指定してください")
			return
		}
		if req.Destination == nil || (*req.Destination != "budget" && *req.Destination != "savings") {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "destinationはbudgetまたはsavingsで指定してください")
			return
		}
		if *req.Destination == "savings" && req.SavingsGoalID == nil {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "destination=savingsの場合はsavings_goal_idは必須です")
			return
		}
		if *req.Destination == "budget" && req.SavingsGoalID != nil {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "destination=budgetの場合はsavings_goal_idは指定できません")
			return
		}

		income_total, err := repo.GetIncomeTotal(r.Context(), user_id, *req.YearMonth)
		if err != nil {
			slog.Error("getting income total for surplus validation", "error", err)
			WriteError(w, http.StatusInternalServerError, "INTERNAL_SERVER_ERROR", "予期しないエラーが発生しました")
			return
		}

		base_income, err := repo.GetBaseIncome(r.Context(), user_id)
		if err != nil {
			slog.Error("getting base income for surplus validation", "error", err)
			WriteError(w, http.StatusInternalServerError, "INTERNAL_SERVER_ERROR", "予期しないエラーが発生しました")
			return
		}

		allocation, err := repo.CreateSurplusAllocation(r.Context(), user_id, income_total, base_income, repository.CreateSurplusAllocationParams{
			YearMonth:     *req.YearMonth,
			Amount:        *req.Amount,
			Destination:   *req.Destination,
			SavingsGoalID: req.SavingsGoalID,
		})
		if errors.Is(err, repository.ErrSurplusExceeded) {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "指定金額が振り分け可能な余剰を超えています")
			return
		}
		if err != nil {
			slog.Error("creating surplus allocation", "error", err)
			WriteError(w, http.StatusInternalServerError, "INTERNAL_SERVER_ERROR", "予期しないエラーが発生しました")
			return
		}
		if allocation == nil {
			WriteError(w, http.StatusNotFound, "NOT_FOUND", "貯金目標が見つかりません")
			return
		}

		WriteJSON(w, http.StatusCreated, toSurplusAllocationJSON(*allocation))
	}
}
