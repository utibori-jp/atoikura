package repository

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"time"

	"github.com/utibori-jp/atoikura/backend/internal/syncrules"
)

// Server-side writes that feed the sync stream (design.md §5.3): monthly postings
// of fixed recurring expenses and savings, and the allowance_totals view.

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
    id, ledger_id, owner_id, seq, field_hlc, wallet, transaction_date, item, amount,
    is_excluded, category_id, recurring_expense_id, recurring_year_month
)
SELECT
    gen_random_uuid(), re.ledger_id, re.owner_id, nextval('lf.sync_seq'), $3::jsonb, re.wallet,
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
ON CONFLICT (recurring_expense_id, recurring_year_month) WHERE recurring_expense_id IS NOT NULL DO NOTHING
RETURNING owner_id, wallet`

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
var serverPostedEntryFields = []string{"wallet", "transaction_date", "item", "amount", "is_excluded", "category_id"}

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

	posted_rows, err := tx.Query(ctx, postFixedRecurringQuery, ledger_id, year_month, string(encoded_field_hlc))
	if err != nil {
		return fmt.Errorf("posting fixed recurring expenses: %w", err)
	}
	allowance_owner_ids := map[int64]bool{}
	for posted_rows.Next() {
		var posted_owner_id int64
		var posted_wallet string
		if err := posted_rows.Scan(&posted_owner_id, &posted_wallet); err != nil {
			posted_rows.Close()
			return fmt.Errorf("scanning recurring posting: %w", err)
		}
		if posted_wallet == "allowance" {
			allowance_owner_ids[posted_owner_id] = true
		}
	}
	posted_rows.Close()
	if err := posted_rows.Err(); err != nil {
		return fmt.Errorf("posting fixed recurring expenses: %w", err)
	}
	for allowance_owner_id := range allowance_owner_ids {
		if err := recomputeAllowanceTotals(ctx, seq_allocator, ledger_id, allowance_owner_id, []string{year_month}); err != nil {
			return err
		}
	}

	if _, err := tx.Exec(ctx, postMonthlySavingsQuery, ledger_id, year_month); err != nil {
		return fmt.Errorf("posting monthly savings: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("committing monthly posting: %w", err)
	}
	return nil
}

// recomputeAllowanceTotalsQuery stores one member's allowance spending for a
// month: every non-excluded, live allowance entry, recurring postings included
// (design.md Q6). The row only gets a new seq when the total changed.
const recomputeAllowanceTotalsQuery = `
INSERT INTO lf.allowance_totals (id, ledger_id, owner_id, seq, member_id, year_month, spent)
SELECT $3::integer::text || ':' || $4::text, $1::uuid, $3::integer, $2, $3::integer, $4::text, COALESCE(SUM(je.amount), 0)
FROM lf.journal_entries je
WHERE je.ledger_id = $1::uuid AND je.owner_id = $3::integer AND je.wallet = 'allowance'
  AND je.deleted = false AND je.is_excluded = false
  AND je.transaction_date >= ($4::text || '-01')::date
  AND je.transaction_date < ($4::text || '-01')::date + INTERVAL '1 month'
ON CONFLICT (ledger_id, id) DO UPDATE
    SET spent = EXCLUDED.spent, seq = EXCLUDED.seq, updated_at = NOW()
    WHERE lf.allowance_totals.spent <> EXCLUDED.spent`

// recomputeAllowanceTotals refreshes allowance_totals for a member and months
// inside the caller's write transaction.
func recomputeAllowanceTotals(ctx context.Context, seq_allocator *txAllocator, ledger_id string, member_id int64, year_months []string) error {
	for _, year_month := range year_months {
		next_seq, err := seq_allocator.allocateSeq(ctx)
		if err != nil {
			return err
		}
		if _, err := seq_allocator.tx.Exec(ctx, recomputeAllowanceTotalsQuery, ledger_id, next_seq, member_id, year_month); err != nil {
			return fmt.Errorf("recomputing allowance totals: %w", err)
		}
	}
	return nil
}

// allowanceMonthsTouched returns the months whose allowance totals a journal
// entry write can change: the entry's month before and after the write.
func allowanceMonthsTouched(row_versions ...syncrules.Row) []string {
	touched_months := map[string]bool{}
	for _, row_version := range row_versions {
		if row_version["wallet"] != "allowance" {
			continue
		}
		if transaction_date, is_text := row_version["transaction_date"].(string); is_text && len(transaction_date) >= len("2006-01") {
			touched_months[transaction_date[:len("2006-01")]] = true
		}
	}
	sorted_months := make([]string, 0, len(touched_months))
	for touched_month := range touched_months {
		sorted_months = append(sorted_months, touched_month)
	}
	sort.Strings(sorted_months)
	return sorted_months
}
