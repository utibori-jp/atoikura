package repository

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
)

// Which ledgers a caller can see and write (design.md D5, D15). Everything here
// is resolved from the caller's user ID: a request names a target ("personal"
// or "household"), never a ledger ID.

// LedgerTarget names one of the caller's writable ledgers.
type LedgerTarget string

const (
	TargetPersonal  LedgerTarget = "personal"
	TargetHousehold LedgerTarget = "household"
)

// ParseLedgerTarget accepts "personal" and "household"; "" means personal.
func ParseLedgerTarget(target_text string) (LedgerTarget, bool) {
	switch LedgerTarget(target_text) {
	case "", TargetPersonal:
		return TargetPersonal, true
	case TargetHousehold:
		return TargetHousehold, true
	}
	return "", false
}

// Caller is the signed-in user and the ledger a command writes to.
type Caller struct {
	UserID int64
	Target LedgerTarget
}

// PersonalCaller is a caller writing to their personal ledger.
func PersonalCaller(user_id int64) Caller {
	return Caller{UserID: user_id, Target: TargetPersonal}
}

// HouseholdCaller is a caller writing to their household ledger.
func HouseholdCaller(user_id int64) Caller {
	return Caller{UserID: user_id, Target: TargetHousehold}
}

// CallerLedgers lists the ledgers a user is an active member of.
type CallerLedgers struct {
	PersonalID string
	// HouseholdID is "" when no household is attached.
	HouseholdID string
	ArchiveIDs  []string
}

// Resolve maps a target to a ledger ID. It reports false for "household" when
// no household is attached.
func (caller_ledgers *CallerLedgers) Resolve(target LedgerTarget) (string, bool) {
	switch target {
	case TargetPersonal:
		return caller_ledgers.PersonalID, true
	case TargetHousehold:
		return caller_ledgers.HouseholdID, caller_ledgers.HouseholdID != ""
	}
	return "", false
}

// TargetOf returns the target that names a writable ledger of the caller.
func (caller_ledgers *CallerLedgers) TargetOf(ledger_id string) (LedgerTarget, bool) {
	switch {
	case ledger_id == caller_ledgers.PersonalID:
		return TargetPersonal, true
	case caller_ledgers.HouseholdID != "" && ledger_id == caller_ledgers.HouseholdID:
		return TargetHousehold, true
	}
	return "", false
}

// IsWritable reports whether rows of the ledger can be written by the caller:
// their personal ledger and their attached household. Archives are read-only.
func (caller_ledgers *CallerLedgers) IsWritable(ledger_id string) bool {
	_, is_writable := caller_ledgers.TargetOf(ledger_id)
	return is_writable
}

// WritableIDs returns the personal ledger and, if attached, the household.
func (caller_ledgers *CallerLedgers) WritableIDs() []string {
	writable_ids := []string{caller_ledgers.PersonalID}
	if caller_ledgers.HouseholdID != "" {
		writable_ids = append(writable_ids, caller_ledgers.HouseholdID)
	}
	return writable_ids
}

// VisibleIDs returns every ledger the caller pulls from.
func (caller_ledgers *CallerLedgers) VisibleIDs() []string {
	return append(caller_ledgers.WritableIDs(), caller_ledgers.ArchiveIDs...)
}

// rowQuerier is a pool or a transaction.
type rowQuerier interface {
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
}

// loadCallerLedgers reads the user's active memberships. PersonalID is "" when
// the personal ledger does not exist yet. Inside a write transaction the
// membership rows stay share-locked until commit, so a concurrent leave waits
// and a write can never land in a household the caller has just left.
func loadCallerLedgers(ctx context.Context, querier rowQuerier, user_id int64) (*CallerLedgers, error) {
	membership_rows, err := querier.Query(ctx,
		`SELECT l.id::text, l.kind
		 FROM lf.ledger_members m
		 JOIN lf.ledgers l ON l.id = m.ledger_id
		 WHERE m.user_id = $1 AND m.left_at IS NULL AND m.deleted = false AND l.deleted = false
		 ORDER BY m.joined_at, l.id
		 FOR SHARE OF m`,
		user_id,
	)
	if err != nil {
		return nil, fmt.Errorf("loading caller ledgers: %w", err)
	}
	defer membership_rows.Close()

	caller_ledgers := &CallerLedgers{ArchiveIDs: []string{}}
	for membership_rows.Next() {
		var ledger_id, ledger_kind string
		if err := membership_rows.Scan(&ledger_id, &ledger_kind); err != nil {
			return nil, fmt.Errorf("scanning caller ledger: %w", err)
		}
		switch ledger_kind {
		case "personal":
			caller_ledgers.PersonalID = ledger_id
		case "household":
			caller_ledgers.HouseholdID = ledger_id
		case "archive":
			caller_ledgers.ArchiveIDs = append(caller_ledgers.ArchiveIDs, ledger_id)
		}
	}
	if err := membership_rows.Err(); err != nil {
		return nil, fmt.Errorf("reading caller ledgers: %w", err)
	}
	return caller_ledgers, nil
}

// EnsureCallerLedgers returns the user's ledgers, creating the personal ledger
// with the user as its owner the first time.
func (r *Repository) EnsureCallerLedgers(ctx context.Context, user_id int64) (*CallerLedgers, error) {
	for attempt_number := 0; attempt_number < 2; attempt_number++ {
		caller_ledgers, err := loadCallerLedgers(ctx, r.pool, user_id)
		if err != nil || caller_ledgers.PersonalID != "" {
			return caller_ledgers, err
		}
		err = r.createPersonalLedger(ctx, user_id)
		if err == nil || isUniqueViolation(err) {
			// Created here, or concurrently by another request: read it back.
			continue
		}
		return nil, err
	}
	return loadCallerLedgers(ctx, r.pool, user_id)
}
