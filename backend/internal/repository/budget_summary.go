package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/utibori-jp/atoikura/backend/internal/db"
	"github.com/utibori-jp/atoikura/backend/internal/service"
)

type BudgetHistoryItem struct {
	YearMonth string
	Budget    int32
	Actual    int32
}

type BudgetSummaryResult struct {
	IncomeTotal    int32
	BaseIncome     int32
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

	base_income, err := r.GetBaseIncome(ctx, user_id)
	if err != nil {
		return nil, fmt.Errorf("getting base income for budget summary: %w", err)
	}

	recurring_total, err := r.queries.SumRecurringFixed(ctx, int32(user_id))
	if err != nil {
		return nil, fmt.Errorf("summing recurring fixed: %w", err)
	}

	savings_total, err := r.queries.SumSavingsMonthly(ctx, int32(user_id))
	if err != nil {
		return nil, fmt.Errorf("summing savings monthly: %w", err)
	}

	savings_allocated, err := r.queries.SumSavingsAllocatedByMonth(ctx, db.SumSavingsAllocatedByMonthParams{
		UserID:  int32(user_id),
		Column2: year_month,
	})
	if err != nil {
		return nil, fmt.Errorf("summing savings-destined surplus allocations: %w", err)
	}

	variable_budget := service.VariableBudget(base_income, recurring_total, savings_total, savings_allocated)

	parsed_month, err := time.Parse("2006-01", year_month)
	if err != nil {
		return nil, fmt.Errorf("parsing year_month: %w", err)
	}

	today_jst := time.Now().In(jstLocation()).Format("2006-01-02")
	days_remaining, err := service.DaysRemaining(year_month, today_jst)
	if err != nil {
		return nil, fmt.Errorf("computing days remaining: %w", err)
	}

	daily_budget, err := service.DailyBudget(variable_budget, year_month)
	if err != nil {
		return nil, fmt.Errorf("computing daily budget: %w", err)
	}

	// Build 3-month history: current month + 2 previous months.
	// History budget uses base_income (stable, not actual recorded income) so months are comparable.
	history := make([]BudgetHistoryItem, 3)
	for i := 2; i >= 0; i-- {
		month_time := parsed_month.AddDate(0, -(2 - i), 0)
		ym := month_time.Format("2006-01")

		h_actual, err := r.queries.SumActualSpendByMonth(ctx, db.SumActualSpendByMonthParams{
			UserID:  int32(user_id),
			Column2: ym,
		})
		if err != nil {
			return nil, fmt.Errorf("summing actual spend for history month %s: %w", ym, err)
		}

		h_savings_allocated, err := r.queries.SumSavingsAllocatedByMonth(ctx, db.SumSavingsAllocatedByMonthParams{
			UserID:  int32(user_id),
			Column2: ym,
		})
		if err != nil {
			return nil, fmt.Errorf("summing savings allocations for history month %s: %w", ym, err)
		}

		h_budget := service.VariableBudget(base_income, recurring_total, savings_total, h_savings_allocated)
		history[i] = BudgetHistoryItem{
			YearMonth: ym,
			Budget:    h_budget,
			Actual:    h_actual,
		}
	}

	return &BudgetSummaryResult{
		IncomeTotal:    income_total,
		BaseIncome:     base_income,
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
