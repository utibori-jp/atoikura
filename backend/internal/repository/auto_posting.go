package repository

import (
	"context"
	"fmt"

	"github.com/utibori-jp/atoikura/backend/internal/db"
)

// autoPostingAdvisoryLockNamespace is a fixed key combined with the user id to derive
// a per-user transaction-level advisory lock. It serializes concurrent first-requests
// of a month so the idempotency guards (NOT EXISTS / last_posted_month) cannot race.
const autoPostingAdvisoryLockNamespace = 760001

// MonthlyAutoPostingResult reports how many entries each auto-posting step created.
type MonthlyAutoPostingResult struct {
	RecurringPosted int64
	SavingsPosted   int64
}

// EnsureMonthlyAutoPosting lazily posts the user's fixed recurring expenses and monthly
// savings for year_month (YYYY-MM) on the first relevant request of that month, then
// becomes a no-op once posted. It is invoked from read endpoints the home screens hit
// first (e.g. GET /budget-summary), so no scheduler is required.
//
// Both steps are idempotent per month on their own (recurring via NOT EXISTS on the
// linked journal entry, savings via last_posted_month), and the whole operation runs in
// a single transaction guarded by a per-user advisory lock so concurrent first-requests
// of the month cannot double-post.
func (r *Repository) EnsureMonthlyAutoPosting(ctx context.Context, user_id int64, year_month string) (*MonthlyAutoPostingResult, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("beginning auto-posting transaction: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	// Serialize per user; the lock is released automatically at transaction end.
	if _, err := tx.Exec(ctx,
		"SELECT pg_advisory_xact_lock($1, $2)",
		autoPostingAdvisoryLockNamespace, int32(user_id),
	); err != nil {
		return nil, fmt.Errorf("acquiring auto-posting advisory lock: %w", err)
	}

	tx_queries := r.queries.WithTx(tx)

	recurring_posted, err := tx_queries.AutoPostFixedRecurringForMonth(ctx, db.AutoPostFixedRecurringForMonthParams{
		UserID:  int32(user_id),
		Column2: year_month,
	})
	if err != nil {
		return nil, fmt.Errorf("auto-posting fixed recurring expenses: %w", err)
	}

	savings_posted, err := tx_queries.AutoPostMonthlySavingsForMonth(ctx, db.AutoPostMonthlySavingsForMonthParams{
		UserID:  int32(user_id),
		Column2: year_month,
	})
	if err != nil {
		return nil, fmt.Errorf("auto-posting monthly savings: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("committing auto-posting transaction: %w", err)
	}

	return &MonthlyAutoPostingResult{
		RecurringPosted: recurring_posted,
		SavingsPosted:   savings_posted,
	}, nil
}
