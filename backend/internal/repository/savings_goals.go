package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/utibori-jp/atoikura/backend/internal/db"
)

type SavingsGoalResult struct {
	ID                int32
	Name              string
	Emoji             string
	MonthlyAmount     int32
	TargetAmount      int32
	AccumulatedAmount int32
	Deadline          *string
	LastPostedMonth   *string
	Memo              string
}

func (r *Repository) ListSavingsGoals(ctx context.Context, user_id int64) ([]SavingsGoalResult, error) {
	rows, err := r.queries.ListSavingsGoals(ctx, int32(user_id))
	if err != nil {
		return nil, fmt.Errorf("listing savings goals: %w", err)
	}
	result := make([]SavingsGoalResult, len(rows))
	for i, row := range rows {
		result[i] = SavingsGoalResult{
			ID:                row.ID,
			Name:              row.Name,
			Emoji:             row.Emoji,
			MonthlyAmount:     row.MonthlyAmount,
			TargetAmount:      row.TargetAmount,
			AccumulatedAmount: row.AccumulatedAmount,
			Deadline:          row.Deadline,
			LastPostedMonth:   row.LastPostedMonth,
			Memo:              row.Memo,
		}
	}
	return result, nil
}

type CreateSavingsGoalParams struct {
	Name          string
	Emoji         string
	MonthlyAmount int32
	TargetAmount  int32
	Deadline      *string
	Memo          string
}

func (r *Repository) CreateSavingsGoal(ctx context.Context, user_id int64, params CreateSavingsGoalParams) (*SavingsGoalResult, error) {
	row, err := r.queries.CreateSavingsGoal(ctx, db.CreateSavingsGoalParams{
		UserID:        int32(user_id),
		Name:          params.Name,
		Emoji:         params.Emoji,
		MonthlyAmount: params.MonthlyAmount,
		TargetAmount:  params.TargetAmount,
		Deadline:      params.Deadline,
		Memo:          params.Memo,
	})
	if err != nil {
		return nil, fmt.Errorf("creating savings goal: %w", err)
	}
	return &SavingsGoalResult{
		ID:                row.ID,
		Name:              row.Name,
		Emoji:             row.Emoji,
		MonthlyAmount:     row.MonthlyAmount,
		TargetAmount:      row.TargetAmount,
		AccumulatedAmount: row.AccumulatedAmount,
		Deadline:          row.Deadline,
		LastPostedMonth:   row.LastPostedMonth,
		Memo:              row.Memo,
	}, nil
}

type UpdateSavingsGoalParams struct {
	ID            int32
	Name          string
	Emoji         string
	MonthlyAmount int32
	TargetAmount  int32
	Deadline      *string
	Memo          string
}

// UpdateSavingsGoal updates a savings goal. Returns nil, nil if not found.
func (r *Repository) UpdateSavingsGoal(ctx context.Context, user_id int64, params UpdateSavingsGoalParams) (*SavingsGoalResult, error) {
	row, err := r.queries.UpdateSavingsGoal(ctx, db.UpdateSavingsGoalParams{
		ID:            params.ID,
		UserID:        int32(user_id),
		Name:          params.Name,
		Emoji:         params.Emoji,
		MonthlyAmount: params.MonthlyAmount,
		TargetAmount:  params.TargetAmount,
		Deadline:      params.Deadline,
		Memo:          params.Memo,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("updating savings goal: %w", err)
	}
	return &SavingsGoalResult{
		ID:                row.ID,
		Name:              row.Name,
		Emoji:             row.Emoji,
		MonthlyAmount:     row.MonthlyAmount,
		TargetAmount:      row.TargetAmount,
		AccumulatedAmount: row.AccumulatedAmount,
		Deadline:          row.Deadline,
		LastPostedMonth:   row.LastPostedMonth,
		Memo:              row.Memo,
	}, nil
}

// PostMonthlySavings adds to accumulated_amount and records last_posted_month.
// Returns nil, nil if not found.
func (r *Repository) PostMonthlySavings(ctx context.Context, id int64, user_id int64, amount int32, year_month string) (*SavingsGoalResult, error) {
	row, err := r.queries.PostMonthlySavings(ctx, db.PostMonthlySavingsParams{
		ID:                int32(id),
		UserID:            int32(user_id),
		AccumulatedAmount: amount,
		LastPostedMonth:   &year_month,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("posting monthly savings: %w", err)
	}
	return &SavingsGoalResult{
		ID:                row.ID,
		Name:              row.Name,
		Emoji:             row.Emoji,
		MonthlyAmount:     row.MonthlyAmount,
		TargetAmount:      row.TargetAmount,
		AccumulatedAmount: row.AccumulatedAmount,
		Deadline:          row.Deadline,
		LastPostedMonth:   row.LastPostedMonth,
		Memo:              row.Memo,
	}, nil
}

// DeleteSavingsGoal deletes a savings goal. Returns false if not found.
func (r *Repository) DeleteSavingsGoal(ctx context.Context, id int64, user_id int64) (bool, error) {
	tag, err := r.pool.Exec(ctx,
		"DELETE FROM savings_goals WHERE id = $1 AND user_id = $2",
		id, user_id,
	)
	if err != nil {
		return false, fmt.Errorf("deleting savings goal: %w", err)
	}
	return tag.RowsAffected() > 0, nil
}
