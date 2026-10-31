package repository

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/utibori-jp/atoikura/backend/internal/syncrules"
)

// Server-side writes that feed the sync stream (design.md §5.3): monthly postings
// of fixed recurring expenses and savings.

// monthlyPostingPendingQuery reports whether anything is left to post for the
// ledger and month. It runs without locks so that a pull pays for the posting
// transaction only once per month.
const monthlyPostingPendingQuery = `
SELECT EXISTS (
    SELECT 1 FROM lf.recurring_expenses re
    WHERE re.ledger_id = $1::uuid AND re.deleted = false AND re.type = 'fixed' AND re.amount IS NOT NULL
      AND NOT EXISTS (
          SELECT 1 FROM lf.journal_entries je
          WHERE je.recurring_expense_id = re.id AND je.recurring_year_month = $2::text
      )
) OR EXISTS (
    SELECT 1 FROM lf.savings_goals g
    WHERE g.ledger_id = $1::uuid AND g.deleted = false AND g.monthly_amount > 0
      AND NOT EXISTS (
          SELECT 1 FROM lf.savings_postings p
          WHERE p.goal_id = g.id AND p.year_month = $2::text AND p.deleted = false
      )
)`

// postFixedRecurringQuery posts every fixed recurring expense of the ledger once
// for the month, on its billing day clamped to the month's last day. The unique
// index on (recurring_expense_id, recurring_year_month) makes it idempotent, also
// against a posting the user has since deleted (a tombstone still counts).
const postFixedRecurringQuery = `
INSERT INTO lf.journal_entries (
    id, ledger_id, owner_id, seq, field_hlc, transaction_date, item, amount,
    is_excluded, category_id, recurring_expense_id, recurring_year_month
)
SELECT
    gen_random_uuid(), re.ledger_id, re.owner_id, nextval('lf.sync_seq'), $3::jsonb,
    make_date(
        EXTRACT(YEAR FROM m.month_start)::int,
        EXTRACT(MONTH FROM m.month_start)::int,
        LEAST(re.billing_day, EXTRACT(DAY FROM (m.month_start + INTERVAL '1 month - 1 day'))::int)
    ),
    re.name, re.amount, false, re.category_id, re.id, $2::text
FROM lf.recurring_expenses re
CROSS JOIN (SELECT ($2::text || '-01')::date AS month_start) AS m
WHERE re.ledger_id = $1::uuid AND re.deleted = false AND re.type = 'fixed' AND re.amount IS NOT NULL
ORDER BY re.created_at, re.id
ON CONFLICT (recurring_expense_id, recurring_year_month) WHERE recurring_expense_id IS NOT NULL DO NOTHING`

// postMonthlySavingsQuery posts each savings goal's monthly amount once for the
// month. A manual posting for the month counts as that month's posting, as
// last_posted_month did in the legacy schema.
const postMonthlySavingsQuery = `
INSERT INTO lf.savings_postings (id, ledger_id, owner_id, seq, goal_id, year_month, amount, kind)
SELECT gen_random_uuid(), g.ledger_id, g.owner_id, nextval('lf.sync_seq'), g.id, $2::text, g.monthly_amount, 'auto'
FROM lf.savings_goals g
WHERE g.ledger_id = $1::uuid AND g.deleted = false AND g.monthly_amount > 0
  AND NOT EXISTS (
      SELECT 1 FROM lf.savings_postings p
      WHERE p.goal_id = g.id AND p.year_month = $2::text AND p.deleted = false
  )
ORDER BY g.created_at, g.id
ON CONFLICT (goal_id, year_month) WHERE kind = 'auto' DO NOTHING`

// serverPostedEntryFields are the journal entry fields a recurring posting sets.
var serverPostedEntryFields = []string{"transaction_date", "item", "amount", "is_excluded", "category_id"}

// PostMonthlyForLedger posts the ledger's fixed recurring expenses and monthly
// savings for year_month (YYYY-MM). It is idempotent and safe to call
// concurrently: the inserts run under the seq lock and are guarded by unique
// indexes.
func (r *Repository) PostMonthlyForLedger(ctx context.Context, ledger_id string, year_month string) error {
	var is_pending bool
	if err := r.pool.QueryRow(ctx, monthlyPostingPendingQuery, ledger_id, year_month).Scan(&is_pending); err != nil {
		return fmt.Errorf("checking pending monthly posting: %w", err)
	}
	if !is_pending {
		return nil
	}

	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("beginning monthly posting transaction: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	seq_allocator := &txAllocator{tx: tx}
	if err := seq_allocator.lock(ctx); err != nil {
		return err
	}

	posted_field_hlc := map[string]string{}
	server_hlc := syncrules.ServerHLC(time.Now())
	for _, field_name := range serverPostedEntryFields {
		posted_field_hlc[field_name] = server_hlc
	}
	encoded_field_hlc, err := json.Marshal(posted_field_hlc)
	if err != nil {
		return fmt.Errorf("encoding posting field_hlc: %w", err)
	}

	if _, err := tx.Exec(ctx, postFixedRecurringQuery, ledger_id, year_month, string(encoded_field_hlc)); err != nil {
		return fmt.Errorf("posting fixed recurring expenses: %w", err)
	}
	if _, err := tx.Exec(ctx, postMonthlySavingsQuery, ledger_id, year_month); err != nil {
		return fmt.Errorf("posting monthly savings: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("committing monthly posting: %w", err)
	}
	return nil
}
