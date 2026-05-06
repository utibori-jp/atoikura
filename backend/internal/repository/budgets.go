package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/utibori-jp/atoikura/backend/internal/db"
)

type BudgetResult struct {
	MonthlyBudget int32
	GoalText      *string
	GoalAmount    int32
}

// GetBudgetByUser returns the user's budget record.
// If no record exists, returns a zero-value BudgetResult (MonthlyBudget=0,
// GoalAmount=0, GoalText=nil) — never returns an error for missing rows.
func (r *Repository) GetBudgetByUser(ctx context.Context, user_id int64) (*BudgetResult, error) {
	row, err := r.queries.GetBudgetByUser(ctx, int32(user_id))
	if errors.Is(err, pgx.ErrNoRows) {
		return &BudgetResult{}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("getting budget: %w", err)
	}
	return &BudgetResult{
		MonthlyBudget: row.MonthlyBudget,
		GoalText:      row.GoalText,
		GoalAmount:    row.GoalAmount,
	}, nil
}

func (r *Repository) UpsertBudget(ctx context.Context, user_id int64, monthly_budget int32, goal_text *string, goal_amount int32) (*BudgetResult, error) {
	row, err := r.queries.UpsertBudget(ctx, db.UpsertBudgetParams{
		UserID:        int32(user_id),
		MonthlyBudget: monthly_budget,
		GoalText:      goal_text,
		GoalAmount:    goal_amount,
	})
	if err != nil {
		return nil, fmt.Errorf("upserting budget: %w", err)
	}
	return &BudgetResult{
		MonthlyBudget: row.MonthlyBudget,
		GoalText:      row.GoalText,
		GoalAmount:    row.GoalAmount,
	}, nil
}
