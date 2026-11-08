package service

import (
	"fmt"
	"time"
)

// VariableBudget returns the monthly variable budget: base income minus fixed
// recurring expenses, monthly savings and savings-destined surplus allocations.
// The same formula is mirrored by the client (frontend/src/logic/budget.ts) and
// both are checked against testdata/logic/budget_personal.json.
func VariableBudget(base_income, recurring_total, savings_total, savings_allocated int32) int32 {
	return base_income - recurring_total - savings_total - savings_allocated
}

// DaysInMonth returns the number of days in the YYYY-MM month.
func DaysInMonth(year_month string) (int, error) {
	parsed_month, err := time.Parse("2006-01", year_month)
	if err != nil {
		return 0, fmt.Errorf("parsing year_month: %w", err)
	}
	return parsed_month.AddDate(0, 1, -1).Day(), nil
}

// DailyBudget divides the variable budget evenly over every day of the month.
// Integer division truncates toward zero, also for negative budgets.
func DailyBudget(variable_budget int32, year_month string) (int32, error) {
	total_days, err := DaysInMonth(year_month)
	if err != nil {
		return 0, err
	}
	return variable_budget / int32(total_days), nil
}

// DaysRemaining counts the days left in year_month as seen from today_jst
// (YYYY-MM-DD in Asia/Tokyo), including today. Past months have 0 days left and
// future months have all of their days left.
func DaysRemaining(year_month string, today_jst string) (int32, error) {
	total_days, err := DaysInMonth(year_month)
	if err != nil {
		return 0, err
	}
	today, err := time.Parse("2006-01-02", today_jst)
	if err != nil {
		return 0, fmt.Errorf("parsing today_jst: %w", err)
	}
	current_year_month := today_jst[:7]
	switch {
	case year_month == current_year_month:
		return int32(max(total_days-today.Day()+1, 0)), nil
	case year_month > current_year_month:
		return int32(total_days), nil
	default:
		return 0, nil
	}
}
