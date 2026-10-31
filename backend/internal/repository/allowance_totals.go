package repository

import (
	"context"
	"errors"
	"fmt"
	"sort"

	"github.com/jackc/pgx/v5"
)

// The allowance_totals view (design.md §3, §3.1): for each member of a
// household, what they spent and put into personal savings per month, summed
// from their personal ledger. It is the only window other members have into a
// personal ledger; the entries themselves never leave it.

// allowanceMember is a personal ledger whose owner has a household attached.
type allowanceMember struct {
	member_id           int64
	personal_ledger_id  string
	household_ledger_id string
	// join_month (YYYY-MM, Asia/Tokyo) is the first month the totals cover.
	join_month string
}

// allowanceMemberOfPersonalLedger returns the owner of a personal ledger and
// their attached household, or nil when the ledger is not a personal ledger or
// no household is attached.
func allowanceMemberOfPersonalLedger(ctx context.Context, tx pgx.Tx, personal_ledger_id string) (*allowanceMember, error) {
	allowance_member := &allowanceMember{personal_ledger_id: personal_ledger_id}
	err := tx.QueryRow(ctx,
		`SELECT pm.user_id, hm.ledger_id::text, to_char(hm.joined_at AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM')
		 FROM lf.ledger_members pm
		 JOIN lf.ledger_members hm
		   ON hm.user_id = pm.user_id AND hm.ledger_kind = 'household'
		  AND hm.left_at IS NULL AND hm.deleted = false
		 WHERE pm.ledger_id = $1::uuid AND pm.ledger_kind = 'personal'
		   AND pm.left_at IS NULL AND pm.deleted = false`,
		personal_ledger_id,
	).Scan(&allowance_member.member_id, &allowance_member.household_ledger_id, &allowance_member.join_month)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("loading allowance member: %w", err)
	}
	return allowance_member, nil
}

// allowanceMember returns the caller as an allowance member when the command
// writes to their personal ledger while a household is attached, else nil.
func (ledger_tx *ledgerTx) allowanceMember(ctx context.Context) (*allowanceMember, error) {
	if ledger_tx.caller_ledgers.HouseholdID == "" || ledger_tx.ledger_id != ledger_tx.caller_ledgers.PersonalID {
		return nil, nil
	}
	return allowanceMemberOfPersonalLedger(ctx, ledger_tx.tx, ledger_tx.ledger_id)
}

// refreshAllowanceTotalsQuery stores one member's totals for a month: every
// live, non-excluded journal entry of their personal ledger (recurring postings
// included, design.md Q6) as spent, and their personal savings postings plus
// surplus allocations to savings as saved. The row only gets a new seq when a
// total changed.
const refreshAllowanceTotalsQuery = `
INSERT INTO lf.allowance_totals (id, ledger_id, owner_id, seq, member_id, year_month, spent, saved)
SELECT $3::integer::text || ':' || $5::text, $1::uuid, $3::integer, $4, $3::integer, $5::text,
    (SELECT COALESCE(SUM(je.amount), 0) FROM lf.journal_entries je
     WHERE je.ledger_id = $2::uuid AND je.deleted = false AND je.is_excluded = false
       AND je.transaction_date >= ($5::text || '-01')::date
       AND je.transaction_date < ($5::text || '-01')::date + INTERVAL '1 month'),
    (SELECT COALESCE(SUM(sp.amount), 0) FROM lf.savings_postings sp
     WHERE sp.ledger_id = $2::uuid AND sp.deleted = false AND sp.year_month = $5::text)
  + (SELECT COALESCE(SUM(sa.amount), 0) FROM lf.surplus_allocations sa
     WHERE sa.ledger_id = $2::uuid AND sa.deleted = false AND sa.destination = 'savings'
       AND sa.year_month = $5::text)
ON CONFLICT (ledger_id, id) DO UPDATE
    SET spent = EXCLUDED.spent, saved = EXCLUDED.saved, seq = EXCLUDED.seq,
        deleted = false, deleted_at = NULL, updated_at = NOW()
    WHERE lf.allowance_totals.spent <> EXCLUDED.spent
       OR lf.allowance_totals.saved <> EXCLUDED.saved
       OR lf.allowance_totals.deleted`

// refreshAllowanceTotals recomputes the totals of a personal ledger's owner in
// their attached household for the given months (YYYY-MM), inside the write
// transaction that changed them. Months before the member joined are skipped,
// and nothing happens when the ledger has no household attached.
func refreshAllowanceTotals(ctx context.Context, seq_allocator *txAllocator, personal_ledger_id string, year_months []string) error {
	if len(year_months) == 0 {
		return nil
	}
	allowance_member, err := allowanceMemberOfPersonalLedger(ctx, seq_allocator.tx, personal_ledger_id)
	if err != nil || allowance_member == nil {
		return err
	}
	for _, year_month := range sortedUniqueMonths(year_months) {
		if year_month < allowance_member.join_month {
			continue
		}
		next_seq, err := seq_allocator.allocateSeq(ctx)
		if err != nil {
			return err
		}
		if _, err := seq_allocator.tx.Exec(ctx, refreshAllowanceTotalsQuery,
			allowance_member.household_ledger_id, allowance_member.personal_ledger_id,
			allowance_member.member_id, next_seq, year_month,
		); err != nil {
			return fmt.Errorf("refreshing allowance totals: %w", err)
		}
	}
	return nil
}

func sortedUniqueMonths(year_months []string) []string {
	month_set := map[string]bool{}
	for _, year_month := range year_months {
		if len(year_month) == len("2006-01") {
			month_set[year_month] = true
		}
	}
	unique_months := make([]string, 0, len(month_set))
	for year_month := range month_set {
		unique_months = append(unique_months, year_month)
	}
	sort.Strings(unique_months)
	return unique_months
}

// monthOfDate returns the YYYY-MM of a YYYY-MM-DD value, or "".
func monthOfDate(date_value any) string {
	date_text, is_text := date_value.(string)
	if !is_text || len(date_text) < len("2006-01-02") {
		return ""
	}
	return date_text[:len("2006-01")]
}

// allowanceBalanceQuery is a member's allowance balance at the end of a month
// (design.md §3): from the join month on, each month adds the allowance in
// effect and subtracts what the personal ledger spent and saved.
const allowanceBalanceQuery = `
SELECT COALESCE(SUM(
    COALESCE((SELECT a.amount FROM lf.allowances a
              WHERE a.ledger_id = $1::uuid AND a.member_id = $3 AND a.deleted = false
                AND a.effective_from <= months.year_month
              ORDER BY a.effective_from DESC LIMIT 1), 0)
  - (SELECT COALESCE(SUM(je.amount), 0) FROM lf.journal_entries je
     WHERE je.ledger_id = $2::uuid AND je.deleted = false AND je.is_excluded = false
       AND je.transaction_date >= months.month_start
       AND je.transaction_date < months.month_start + INTERVAL '1 month')
  - (SELECT COALESCE(SUM(sp.amount), 0) FROM lf.savings_postings sp
     WHERE sp.ledger_id = $2::uuid AND sp.deleted = false AND sp.year_month = months.year_month)
  - (SELECT COALESCE(SUM(sa.amount), 0) FROM lf.surplus_allocations sa
     WHERE sa.ledger_id = $2::uuid AND sa.deleted = false AND sa.destination = 'savings'
       AND sa.year_month = months.year_month)
), 0)::bigint
FROM (
    SELECT month_start::date AS month_start, to_char(month_start, 'YYYY-MM') AS year_month
    FROM generate_series(($4::text || '-01')::date, ($5::text || '-01')::date, INTERVAL '1 month') AS month_start
) AS months`

// allowanceBalance returns the member's allowance balance at the end of
// year_month; 0 for a month before they joined.
func allowanceBalance(ctx context.Context, tx pgx.Tx, allowance_member *allowanceMember, year_month string) (int64, error) {
	if year_month < allowance_member.join_month {
		return 0, nil
	}
	var balance int64
	if err := tx.QueryRow(ctx, allowanceBalanceQuery,
		allowance_member.household_ledger_id, allowance_member.personal_ledger_id,
		allowance_member.member_id, allowance_member.join_month, year_month,
	).Scan(&balance); err != nil {
		return 0, fmt.Errorf("computing allowance balance: %w", err)
	}
	return balance, nil
}
