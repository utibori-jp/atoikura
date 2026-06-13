package handler

import (
	"context"
	"log/slog"
	"net/http"

	"github.com/utibori-jp/atoikura/backend/internal/repository"
)

type budgetSummaryRepo interface {
	EnsureMonthlyAutoPosting(ctx context.Context, user_id int64, year_month string) (*repository.MonthlyAutoPostingResult, error)
	GetBudgetSummary(ctx context.Context, user_id int64, year_month string) (*repository.BudgetSummaryResult, error)
}

func GetBudgetSummaryHandler(repo budgetSummaryRepo) http.HandlerFunc {
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

		// Lazily post this month's fixed recurring expenses and monthly savings on the
		// first dashboard read of the month. Idempotent and advisory-lock guarded, so it
		// is safe to run on every request. Failures here must not break the dashboard, so
		// they are logged and the summary is still served.
		if _, err := repo.EnsureMonthlyAutoPosting(r.Context(), user_id, year_month); err != nil {
			slog.Error("auto-posting monthly entries", "error", err, "year_month", year_month)
		}

		summary, err := repo.GetBudgetSummary(r.Context(), user_id, year_month)
		if err != nil {
			slog.Error("getting budget summary", "error", err)
			WriteError(w, http.StatusInternalServerError, "INTERNAL_SERVER_ERROR", "予期しないエラーが発生しました")
			return
		}

		type historyItemJSON struct {
			YearMonth string `json:"year_month"`
			Budget    int32  `json:"budget"`
			Actual    int32  `json:"actual"`
		}
		type responseJSON struct {
			IncomeTotal    int32             `json:"income_total"`
			RecurringTotal int32             `json:"recurring_total"`
			SavingsTotal   int32             `json:"savings_total"`
			VariableBudget int32             `json:"variable_budget"`
			DailyBudget    int32             `json:"daily_budget"`
			DaysRemaining  int32             `json:"days_remaining"`
			History        []historyItemJSON `json:"history"`
		}

		history := make([]historyItemJSON, len(summary.History))
		for i, h := range summary.History {
			history[i] = historyItemJSON{
				YearMonth: h.YearMonth,
				Budget:    h.Budget,
				Actual:    h.Actual,
			}
		}

		WriteJSON(w, http.StatusOK, responseJSON{
			IncomeTotal:    summary.IncomeTotal,
			RecurringTotal: summary.RecurringTotal,
			SavingsTotal:   summary.SavingsTotal,
			VariableBudget: summary.VariableBudget,
			DailyBudget:    summary.DailyBudget,
			DaysRemaining:  summary.DaysRemaining,
			History:        history,
		})
	}
}
