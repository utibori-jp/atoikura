package handler

import (
	"encoding/json"
	"log/slog"
	"net/http"

	"github.com/utibori-jp/atoikura/backend/internal/repository"
)

type budgetResponseJSON struct {
	MonthlyBudget int32   `json:"monthly_budget"`
	GoalText      *string `json:"goal_text"`
	GoalAmount    int32   `json:"goal_amount"`
}

func GetBudgetsHandler(repo *repository.Repository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user_id, ok := UserIDFromContext(r.Context())
		if !ok {
			WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "認証情報が不正です")
			return
		}

		budget, err := repo.GetBudgetByUser(r.Context(), user_id)
		if err != nil {
			slog.Error("getting budget", "error", err)
			WriteError(w, http.StatusInternalServerError, "INTERNAL_SERVER_ERROR", "予期しないエラーが発生しました")
			return
		}

		WriteJSON(w, http.StatusOK, budgetResponseJSON{
			MonthlyBudget: budget.MonthlyBudget,
			GoalText:      budget.GoalText,
			GoalAmount:    budget.GoalAmount,
		})
	}
}

func UpdateBudgetsHandler(repo *repository.Repository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user_id, ok := UserIDFromContext(r.Context())
		if !ok {
			WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "認証情報が不正です")
			return
		}

		type budgetRequestJSON struct {
			MonthlyBudget *int32  `json:"monthly_budget"`
			GoalText      *string `json:"goal_text"`
			GoalAmount    *int32  `json:"goal_amount"`
		}
		var req budgetRequestJSON
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "リクエストの形式が不正です")
			return
		}

		if req.MonthlyBudget != nil && *req.MonthlyBudget < 0 {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "monthly_budgetは0以上の整数である必要があります")
			return
		}
		if req.GoalAmount != nil && *req.GoalAmount < 0 {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "goal_amountは0以上の整数である必要があります")
			return
		}
		if req.GoalText != nil && len([]rune(*req.GoalText)) > 200 {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "goal_textは200文字以内で入力してください")
			return
		}

		current, err := repo.GetBudgetByUser(r.Context(), user_id)
		if err != nil {
			slog.Error("getting budget for merge", "error", err)
			WriteError(w, http.StatusInternalServerError, "INTERNAL_SERVER_ERROR", "予期しないエラーが発生しました")
			return
		}

		merged_monthly_budget := current.MonthlyBudget
		if req.MonthlyBudget != nil {
			merged_monthly_budget = *req.MonthlyBudget
		}
		merged_goal_text := current.GoalText
		if req.GoalText != nil {
			merged_goal_text = req.GoalText
		}
		merged_goal_amount := current.GoalAmount
		if req.GoalAmount != nil {
			merged_goal_amount = *req.GoalAmount
		}

		budget, err := repo.UpsertBudget(r.Context(), user_id, merged_monthly_budget, merged_goal_text, merged_goal_amount)
		if err != nil {
			slog.Error("upserting budget", "error", err)
			WriteError(w, http.StatusInternalServerError, "INTERNAL_SERVER_ERROR", "予期しないエラーが発生しました")
			return
		}

		WriteJSON(w, http.StatusOK, budgetResponseJSON{
			MonthlyBudget: budget.MonthlyBudget,
			GoalText:      budget.GoalText,
			GoalAmount:    budget.GoalAmount,
		})
	}
}
