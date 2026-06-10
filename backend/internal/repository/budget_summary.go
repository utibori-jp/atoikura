package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/utibori-jp/atoikura/backend/internal/db"
)

type BudgetHistoryItem struct {
	YearMonth string
	Budget    int32
	Actual    int32
}

type BudgetSummaryResult struct {
	IncomeTotal    int32
	RecurringTotal int32
	SavingsTotal   int32
	VariableBudget int32
	DailyBudget    int32
	DaysRemaining  int32
	History        []BudgetHistoryItem
}

// GetBudgetSummary computes the budget summary for the given year_month (YYYY-MM).
func (r *Repository) GetBudgetSummary(ctx context.Context, user_id int64, year_month string) (*BudgetSummaryResult, error) {
	income_total, err := r.queries.SumIncomeByMonth(ctx, db.SumIncomeByMonthParams{
		UserID:  int32(user_id),
		Column2: year_month,
	})
	if err != nil {
		return nil, fmt.Errorf("summing income by month: %w", err)
	}

	recurring_total, err := r.queries.SumRecurringFixed(ctx, int32(user_id))
	if err != nil {
		return nil, fmt.Errorf("summing recurring fixed: %w", err)
	}

	savings_total, err := r.queries.SumSavingsMonthly(ctx, int32(user_id))
	if err != nil {
		return nil, fmt.Errorf("summing savings monthly: %w", err)
	}

	variable_budget := income_total - recurring_total - savings_total

	// Compute days remaining in the target month
	parsed_month, err := time.Parse("2006-01", year_month)
	if err != nil {
		return nil, fmt.Errorf("parsing year_month: %w", err)
	}
	// First day of next month
	first_of_next := parsed_month.AddDate(0, 1, 0)
	// Last day of this month
	last_day_of_month := first_of_next.AddDate(0, 0, -1)
	total_days := last_day_of_month.Day()

	now_jst := time.Now().In(jstLocation())
	var days_remaining int32
	// Only compute remaining days if the target month is the current month
	current_ym := now_jst.Format("2006-01")
	if year_month == current_ym {
		days_remaining = int32(last_day_of_month.Day() - now_jst.Day() + 1)
		if days_remaining < 0 {
			days_remaining = 0
		}
	} else if year_month > current_ym {
		// Future month: all days remaining
		days_remaining = int32(total_days)
	} else {
		// Past month: 0 days remaining
		days_remaining = 0
	}

	var daily_budget int32
	if total_days > 0 {
		daily_budget = variable_budget / int32(total_days)
	}

	// Build 3-month history: current month + 2 previous months
	history := make([]BudgetHistoryItem, 3)
	for i := 2; i >= 0; i-- {
		month_time := parsed_month.AddDate(0, -(2 - i), 0)
		ym := month_time.Format("2006-01")

		h_income, err := r.queries.SumIncomeByMonth(ctx, db.SumIncomeByMonthParams{
			UserID:  int32(user_id),
			Column2: ym,
		})
		if err != nil {
			return nil, fmt.Errorf("summing income for history month %s: %w", ym, err)
		}

		h_actual, err := r.queries.SumActualSpendByMonth(ctx, db.SumActualSpendByMonthParams{
			UserID:  int32(user_id),
			Column2: ym,
		})
		if err != nil {
			return nil, fmt.Errorf("summing actual spend for history month %s: %w", ym, err)
		}

		h_budget := h_income - recurring_total - savings_total
		history[i] = BudgetHistoryItem{
			YearMonth: ym,
			Budget:    h_budget,
			Actual:    h_actual,
		}
	}

	return &BudgetSummaryResult{
		IncomeTotal:    income_total,
		RecurringTotal: recurring_total,
		SavingsTotal:   savings_total,
		VariableBudget: variable_budget,
		DailyBudget:    daily_budget,
		DaysRemaining:  days_remaining,
		History:        history,
	}, nil
}

// jstLocation returns Asia/Tokyo timezone location.
func jstLocation() *time.Location {
	loc, err := time.LoadLocation("Asia/Tokyo")
	if err != nil {
		return time.FixedZone("JST", 9*60*60)
	}
	return loc
}
