package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/utibori-jp/atoikura/backend/internal/db"
)

// SurplusAllocationResult holds the data for a single surplus allocation record.
type SurplusAllocationResult struct {
	ID            int32
	YearMonth     string
	Amount        int32
	Destination   string
	SavingsGoalID *int32
	CreatedAt     time.Time
}

// ListSurplusAllocations returns all surplus allocations for the given user and month.
func (r *Repository) ListSurplusAllocations(ctx context.Context, user_id int64, year_month string) ([]SurplusAllocationResult, error) {
	rows, err := r.queries.ListSurplusAllocationsByMonth(ctx, db.ListSurplusAllocationsByMonthParams{
		UserID:  int32(user_id),
		Column2: year_month,
	})
	if err != nil {
		return nil, fmt.Errorf("listing surplus allocations: %w", err)
	}
	result := make([]SurplusAllocationResult, len(rows))
	for i, row := range rows {
		result[i] = SurplusAllocationResult{
			ID:            row.ID,
			YearMonth:     row.YearMonth,
			Amount:        row.Amount,
			Destination:   row.Destination,
			SavingsGoalID: row.SavingsGoalID,
			CreatedAt:     row.CreatedAt,
		}
	}
	return result, nil
}

// CreateSurplusAllocationParams holds the input for creating a surplus allocation.
type CreateSurplusAllocationParams struct {
	YearMonth     string
	Amount        int32
	Destination   string
	SavingsGoalID *int32
}

// ErrSurplusExceeded is returned when the requested allocation amount exceeds
// the remaining unallocated surplus for the month.
var ErrSurplusExceeded = errors.New("allocation amount exceeds remaining unallocated surplus")

// CreateSurplusAllocation inserts a surplus allocation record. If the destination
// is 'savings', it also increments the savings goal's accumulated_amount in the
// same transaction. Returns ErrSurplusExceeded if amount > remaining surplus.
// Returns nil, nil if savings_goal_id refers to a goal that does not belong to the user.
func (r *Repository) CreateSurplusAllocation(
	ctx context.Context,
	user_id int64,
	income_total int32,
	base_income int32,
	params CreateSurplusAllocationParams,
) (*SurplusAllocationResult, error) {
	// Validate remaining unallocated surplus before beginning the transaction.
	already_allocated, err := r.queries.SumAllocatedByMonth(ctx, db.SumAllocatedByMonthParams{
		UserID:  int32(user_id),
		Column2: params.YearMonth,
	})
	if err != nil {
		return nil, fmt.Errorf("summing allocated surplus: %w", err)
	}

	surplus := income_total - base_income
	if surplus < 0 {
		surplus = 0
	}
	remaining := surplus - already_allocated
	if remaining < 0 {
		remaining = 0
	}
	if params.Amount > remaining {
		return nil, ErrSurplusExceeded
	}

	// For savings destination verify the savings goal belongs to the user before
	// opening the write transaction; pgx.ErrNoRows means the goal doesn't exist for user.
	if params.Destination == "savings" && params.SavingsGoalID != nil {
		_, err := r.queries.GetSavingsGoalByID(ctx, db.GetSavingsGoalByIDParams{
			ID:     *params.SavingsGoalID,
			UserID: int32(user_id),
		})
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil // 404 — savings goal not found for this user
		}
		if err != nil {
			return nil, fmt.Errorf("checking savings goal ownership: %w", err)
		}
	}

	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("beginning surplus allocation transaction: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	tx_queries := r.queries.WithTx(tx)

	row, err := tx_queries.InsertSurplusAllocation(ctx, db.InsertSurplusAllocationParams{
		UserID:        int32(user_id),
		Column2:       params.YearMonth,
		Amount:        params.Amount,
		Destination:   params.Destination,
		SavingsGoalID: params.SavingsGoalID,
	})
	if err != nil {
		return nil, fmt.Errorf("inserting surplus allocation: %w", err)
	}

	if params.Destination == "savings" && params.SavingsGoalID != nil {
		_, err = tx_queries.IncrementSavingsGoalAccumulated(ctx, db.IncrementSavingsGoalAccumulatedParams{
			ID:                *params.SavingsGoalID,
			UserID:            int32(user_id),
			AccumulatedAmount: params.Amount,
		})
		if err != nil {
			return nil, fmt.Errorf("incrementing savings goal accumulated amount: %w", err)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("committing surplus allocation transaction: %w", err)
	}

	return &SurplusAllocationResult{
		ID:            row.ID,
		YearMonth:     row.YearMonth,
		Amount:        row.Amount,
		Destination:   row.Destination,
		SavingsGoalID: row.SavingsGoalID,
		CreatedAt:     row.CreatedAt,
	}, nil
}
