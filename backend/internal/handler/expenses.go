package handler

import (
	"log/slog"
	"math"
	"net/http"
	"time"

	"github.com/utibori-jp/atoikura/backend/internal/repository"
)

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

func GetMonthlyBreakdownHandler(repo *repository.Repository) http.HandlerFunc {
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

type dailyEntryJSON struct {
	Date     string `json:"date"`
	Food     int32  `json:"food"`
	Other    int32  `json:"other"`
	Total    int32  `json:"total"`
	IsActual bool   `json:"is_actual"`
}

type dailyCumulativeResponseJSON struct {
	YearMonth     string           `json:"year_month"`
	MonthlyBudget int32            `json:"monthly_budget"`
	DailyBudget   int32            `json:"daily_budget"`
	Days          []dailyEntryJSON `json:"days"`
}

func buildDaysArray(
	actual_sums map[string]map[string]int32,
	first_day time.Time,
	days_in_month int,
	today_str string,
	today_day_num int,
	is_past_month bool,
) []dailyEntryJSON {
	days := make([]dailyEntryJSON, days_in_month)

	var cumulative_food, cumulative_other int32
	var cumulative_food_today, cumulative_other_today int32
	pace_computed := false
	var pace_food, pace_other float64

	for day_num := 1; day_num <= days_in_month; day_num++ {
		date_str := first_day.AddDate(0, 0, day_num-1).Format("2006-01-02")

		if is_past_month || date_str <= today_str {
			cumulative_food += actual_sums[date_str]["food"]
			cumulative_other += actual_sums[date_str]["other"]

			days[day_num-1] = dailyEntryJSON{
				Date:     date_str,
				Food:     cumulative_food,
				Other:    cumulative_other,
				Total:    cumulative_food + cumulative_other,
				IsActual: true,
			}

			if !is_past_month && date_str == today_str {
				cumulative_food_today = cumulative_food
				cumulative_other_today = cumulative_other
			}
		} else {
			if !pace_computed {
				days_elapsed := today_day_num
				if days_elapsed > 0 && (cumulative_food_today != 0 || cumulative_other_today != 0) {
					pace_food = float64(cumulative_food_today) / float64(days_elapsed)
					pace_other = float64(cumulative_other_today) / float64(days_elapsed)
				}
				pace_computed = true
			}

			days_ahead := day_num - today_day_num
			forecast_food := cumulative_food_today + int32(math.Floor(pace_food*float64(days_ahead)))
			forecast_other := cumulative_other_today + int32(math.Floor(pace_other*float64(days_ahead)))

			days[day_num-1] = dailyEntryJSON{
				Date:     date_str,
				Food:     forecast_food,
				Other:    forecast_other,
				Total:    forecast_food + forecast_other,
				IsActual: false,
			}
		}
	}

	return days
}

func GetDailyCumulativeHandler(repo *repository.Repository) http.HandlerFunc {
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

		budget, err := repo.GetBudgetByUser(r.Context(), user_id)
		if err != nil {
			slog.Error("getting budget", "error", err)
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

		days := buildDaysArray(actual_sums, first_day, days_in_month, today_str, today_day_num, is_past_month)

		var daily_budget int32
		if budget.MonthlyBudget > 0 {
			daily_budget = budget.MonthlyBudget / int32(days_in_month)
		}

		WriteJSON(w, http.StatusOK, dailyCumulativeResponseJSON{
			YearMonth:     year_month,
			MonthlyBudget: budget.MonthlyBudget,
			DailyBudget:   daily_budget,
			Days:          days,
		})
	}
}
