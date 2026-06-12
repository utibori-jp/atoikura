package handler

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"github.com/utibori-jp/atoikura/backend/internal/repository"
	"github.com/utibori-jp/atoikura/backend/internal/service"
)

type expenseRepo interface {
	ListMonthlyBreakdown(ctx context.Context, user_id int64, first_day time.Time) ([]repository.MonthlyBreakdownItem, error)
	ListDailyExpenseSumsForMonth(ctx context.Context, user_id int64, first_day time.Time) ([]repository.DailyExpenseSum, error)
	GetBudgetByUser(ctx context.Context, user_id int64) (*repository.BudgetResult, error)
	GetBudgetSummary(ctx context.Context, user_id int64, year_month string) (*repository.BudgetSummaryResult, error)
}

type monthlyBreakdownItemJSON struct {
	CategoryID        int32  `json:"category_id"`
	CategoryName      string `json:"category_name"`
	GroupID           int32  `json:"group_id"`
	GroupName         string `json:"group_name"`
	StatementTypeID   int32  `json:"statement_type_id"`
	StatementTypeName string `json:"statement_type_name"`
	Total             int32  `json:"total"`
}

type monthlyBreakdownResponseJSON struct {
	YearMonth string                     `json:"year_month"`
	Breakdown []monthlyBreakdownItemJSON `json:"breakdown"`
}

func GetMonthlyBreakdownHandler(repo expenseRepo) http.HandlerFunc {
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

		first_day, err := time.Parse("2006-01-02", year_month+"-01")
		if err != nil {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "year_monthはYYYY-MM形式で指定してください")
			return
		}

		items, err := repo.ListMonthlyBreakdown(r.Context(), user_id, first_day)
		if err != nil {
			slog.Error("listing monthly breakdown", "error", err)
			WriteError(w, http.StatusInternalServerError, "INTERNAL_SERVER_ERROR", "予期しないエラーが発生しました")
			return
		}

		breakdown := make([]monthlyBreakdownItemJSON, len(items))
		for i, item := range items {
			breakdown[i] = monthlyBreakdownItemJSON{
				CategoryID:        item.CategoryID,
				CategoryName:      item.CategoryName,
				GroupID:           item.GroupID,
				GroupName:         item.GroupName,
				StatementTypeID:   item.StatementTypeID,
				StatementTypeName: item.StatementTypeName,
				Total:             item.Total,
			}
		}

		WriteJSON(w, http.StatusOK, monthlyBreakdownResponseJSON{
			YearMonth: year_month,
			Breakdown: breakdown,
		})
	}
}

type dailyCumulativeResponseJSON struct {
	YearMonth      string               `json:"year_month"`
	VariableBudget int32                `json:"variable_budget"`
	DailyBudget    int32                `json:"daily_budget"`
	Days           []service.DailyEntry `json:"days"`
}

func GetDailyCumulativeHandler(repo expenseRepo) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user_id, ok := UserIDFromContext(r.Context())
		if !ok {
			WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "認証情報が不正です")
			return
		}

		today_str := time.Now().In(jst).Format("2006-01-02")
		today_ym := today_str[:7]

		year_month := r.URL.Query().Get("year_month")
		if year_month == "" {
			year_month = today_ym
		} else if !yearMonthPattern.MatchString(year_month) {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "year_monthはYYYY-MM形式で指定してください")
			return
		}

		first_day, err := time.Parse("2006-01-02", year_month+"-01")
		if err != nil {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "year_monthはYYYY-MM形式で指定してください")
			return
		}

		is_past_month := year_month < today_ym

		days_in_month := time.Date(first_day.Year(), first_day.Month()+1, 0, 0, 0, 0, 0, time.UTC).Day()

		raw_sums, err := repo.ListDailyExpenseSumsForMonth(r.Context(), user_id, first_day)
		if err != nil {
			slog.Error("listing daily expense sums", "error", err)
			WriteError(w, http.StatusInternalServerError, "INTERNAL_SERVER_ERROR", "予期しないエラーが発生しました")
			return
		}

		budget, err := repo.GetBudgetSummary(r.Context(), user_id, year_month)
		if err != nil {
			slog.Error("getting budget summary", "error", err)
			WriteError(w, http.StatusInternalServerError, "INTERNAL_SERVER_ERROR", "予期しないエラーが発生しました")
			return
		}

		actual_sums := map[string]map[string]int32{}
		for _, row := range raw_sums {
			if _, exists := actual_sums[row.Date]; !exists {
				actual_sums[row.Date] = map[string]int32{}
			}
			actual_sums[row.Date][row.TypeCode] = row.DailySum
		}

		today_t, _ := time.Parse("2006-01-02", today_str)
		today_day_num := today_t.Day()

		days := service.BuildDailyEntries(actual_sums, first_day, days_in_month, today_str, today_day_num, is_past_month)

		WriteJSON(w, http.StatusOK, dailyCumulativeResponseJSON{
			YearMonth:      year_month,
			VariableBudget: budget.VariableBudget,
			DailyBudget:    budget.DailyBudget,
			Days:           days,
		})
	}
}
