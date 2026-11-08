package repository

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/utibori-jp/atoikura/backend/internal/syncrules"
)

// Household lifecycle commands (design.md §6): create, invite, join, leave,
// remove and dissolve. The household and the member acting on it are always
// resolved from the caller's user ID; a request never names a ledger.

const (
	// invitationLifetime is how long an invitation can be redeemed (Q8).
	invitationLifetime = 24 * time.Hour
	// maxOpenInvitations bounds the invitations a household can have open.
	maxOpenInvitations = 10
	// ShortCodeAlphabet leaves out characters that are easy to misread (0/O, 1/I).
	ShortCodeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	// ShortCodeLength is the number of characters of an invitation's short code.
	ShortCodeLength = 8
	// maxJoinFailures failed redemptions per user within joinFailureWindow make
	// further attempts wait, so short codes can't be guessed.
	maxJoinFailures   = 10
	joinFailureWindow = time.Hour
)

const (
	alreadyInHouseholdMessage   = "すでに家計に参加しています"
	invitationNotFoundMessage   = "招待が見つからないか、有効期限が切れています"
	householdOwnerOnlyMessage   = "この操作は家計のオーナーだけができます"
	householdMemberNotFoundText = "メンバーが見つかりません"
)

// householdTx is one household command's transaction.
type householdTx struct {
	tx             pgx.Tx
	seq_allocator  *txAllocator
	user_id        int64
	caller_ledgers *CallerLedgers
}

// runHouseholdCommand runs command in a transaction with the caller's
// memberships read (and share-locked) inside it.
func (r *Repository) runHouseholdCommand(ctx context.Context, user_id int64, command func(context.Context, *householdTx) error) error {
	if _, err := r.EnsureCallerLedgers(ctx, user_id); err != nil {
		return err
	}
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("beginning household command: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	caller_ledgers, err := loadCallerLedgers(ctx, tx, user_id)
	if err != nil {
		return err
	}
	household_tx := &householdTx{tx: tx, seq_allocator: &txAllocator{tx: tx}, user_id: user_id, caller_ledgers: caller_ledgers}
	if err := command(ctx, household_tx); err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("committing household command: %w", err)
	}
	return nil
}

// requireHousehold returns the caller's attached household.
func (household_tx *householdTx) requireHousehold() (string, error) {
	if household_tx.caller_ledgers.HouseholdID == "" {
		return "", newCommandError(CommandForbidden, householdNotAttachedMessage)
	}
	return household_tx.caller_ledgers.HouseholdID, nil
}

// householdMembership is an active membership of the household, locked for update.
type householdMembership struct {
	id      string
	user_id int64
	role    string
}

// lockMembership locks a user's active membership of a ledger, or returns nil.
func (household_tx *householdTx) lockMembership(ctx context.Context, ledger_id string, member_id int64) (*householdMembership, error) {
	membership := &householdMembership{user_id: member_id}
	err := household_tx.tx.QueryRow(ctx,
		`SELECT id::text, role FROM lf.ledger_members
		 WHERE ledger_id = $1::uuid AND user_id = $2 AND left_at IS NULL AND deleted = false
		 FOR UPDATE`,
		ledger_id, member_id,
	).Scan(&membership.id, &membership.role)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("locking membership: %w", err)
	}
	return membership, nil
}

// countOtherMembers counts the household's active members other than member_id.
func (household_tx *householdTx) countOtherMembers(ctx context.Context, household_id string, member_id int64) (int, error) {
	var other_member_count int
	if err := household_tx.tx.QueryRow(ctx,
		`SELECT COUNT(*) FROM lf.ledger_members
		 WHERE ledger_id = $1::uuid AND user_id <> $2 AND left_at IS NULL AND deleted = false`,
		household_id, member_id,
	).Scan(&other_member_count); err != nil {
		return 0, fmt.Errorf("counting household members: %w", err)
	}
	return other_member_count, nil
}

// insertLedger creates a ledger owned by owner_id.
func (household_tx *householdTx) insertLedger(ctx context.Context, owner_id int64, ledger_kind string, ledger_name string) (string, error) {
	ledger_seq, err := household_tx.seq_allocator.allocateSeq(ctx)
	if err != nil {
		return "", err
	}
	var ledger_id string
	if err := household_tx.tx.QueryRow(ctx,
		`INSERT INTO lf.ledgers (id, ledger_id, owner_id, seq, kind, name)
		 SELECT generated.id, generated.id, $1, $2, $3, $4 FROM (SELECT gen_random_uuid() AS id) generated
		 RETURNING id::text`,
		owner_id, ledger_seq, ledger_kind, ledger_name,
	).Scan(&ledger_id); err != nil {
		return "", fmt.Errorf("creating %s ledger: %w", ledger_kind, err)
	}
	return ledger_id, nil
}

// insertMembership adds member_id to a ledger. The display name is copied from
// users so that the other members can see who is in the household.
func (household_tx *householdTx) insertMembership(ctx context.Context, ledger_id string, member_id int64, role string, ledger_kind string) error {
	member_seq, err := household_tx.seq_allocator.allocateSeq(ctx)
	if err != nil {
		return err
	}
	if _, err := household_tx.tx.Exec(ctx,
		`INSERT INTO lf.ledger_members (id, ledger_id, owner_id, seq, user_id, role, ledger_kind, display_name)
		 SELECT gen_random_uuid(), $1::uuid, $2, $3, $2, $4, $5, u.display_name FROM users u WHERE u.id = $2`,
		ledger_id, member_id, member_seq, role, ledger_kind,
	); err != nil {
		if isUniqueViolation(err) {
			return newCommandError(CommandConflict, alreadyInHouseholdMessage)
		}
		return fmt.Errorf("adding ledger member: %w", err)
	}
	return nil
}

// copyRow copies one row of collection into target_ledger_id with a new ID and
// seq, overriding the given columns. Collection names come from constants.
func (household_tx *householdTx) copyRow(ctx context.Context, collection string, source_id string, target_ledger_id string, column_overrides map[string]any) (string, error) {
	next_seq, err := household_tx.seq_allocator.allocateSeq(ctx)
	if err != nil {
		return "", err
	}
	encoded_overrides, err := json.Marshal(column_overrides)
	if err != nil {
		return "", fmt.Errorf("encoding %s overrides: %w", collection, err)
	}
	var copied_id string
	if err := household_tx.tx.QueryRow(ctx,
		"INSERT INTO lf."+collection+
			` SELECT copied.* FROM lf.`+collection+` t,
			  LATERAL jsonb_populate_record(NULL::lf.`+collection+`, to_jsonb(t) || $2::jsonb || jsonb_build_object(
			      'id', gen_random_uuid(), 'ledger_id', $3::uuid, 'seq', $4::bigint, 'updated_at', NOW())) AS copied
			  WHERE t.id = $1::uuid
			  RETURNING id::text`,
		source_id, string(encoded_overrides), target_ledger_id, next_seq,
	).Scan(&copied_id); err != nil {
		return "", fmt.Errorf("copying %s row: %w", collection, err)
	}
	return copied_id, nil
}

// sourceRow is a row to copy and the reference it carries to another copied row.
type sourceRow struct {
	id           string
	reference_id string
}

func (household_tx *householdTx) listSourceRows(ctx context.Context, select_sql string, select_values ...any) ([]sourceRow, error) {
	source_rows, err := household_tx.tx.Query(ctx, select_sql, select_values...)
	if err != nil {
		return nil, fmt.Errorf("listing rows to copy: %w", err)
	}
	defer source_rows.Close()
	listed_rows := []sourceRow{}
	for source_rows.Next() {
		var listed_row sourceRow
		if err := source_rows.Scan(&listed_row.id, &listed_row.reference_id); err != nil {
			return nil, fmt.Errorf("scanning row to copy: %w", err)
		}
		listed_rows = append(listed_rows, listed_row)
	}
	if err := source_rows.Err(); err != nil {
		return nil, fmt.Errorf("listing rows to copy: %w", err)
	}
	return listed_rows, nil
}

// copyMaster copies the live category groups, categories and recurring
// expenses of one ledger into another, with new IDs (Q7). A recurring expense
// whose category is gone is not copied.
func (household_tx *householdTx) copyMaster(ctx context.Context, source_ledger_id string, target_ledger_id string) error {
	group_rows, err := household_tx.listSourceRows(ctx,
		`SELECT id::text, '' FROM lf.category_groups WHERE ledger_id = $1::uuid AND deleted = false ORDER BY created_at, id`,
		source_ledger_id)
	if err != nil {
		return err
	}
	copied_group_ids := map[string]string{}
	for _, group_row := range group_rows {
		copied_group_id, err := household_tx.copyRow(ctx, "category_groups", group_row.id, target_ledger_id, map[string]any{})
		if err != nil {
			return err
		}
		copied_group_ids[group_row.id] = copied_group_id
	}

	category_rows, err := household_tx.listSourceRows(ctx,
		`SELECT id::text, group_id::text FROM lf.expense_categories WHERE ledger_id = $1::uuid AND deleted = false ORDER BY created_at, id`,
		source_ledger_id)
	if err != nil {
		return err
	}
	copied_category_ids := map[string]string{}
	for _, category_row := range category_rows {
		copied_group_id, has_group := copied_group_ids[category_row.reference_id]
		if !has_group {
			continue
		}
		copied_category_id, err := household_tx.copyRow(ctx, "expense_categories", category_row.id, target_ledger_id, map[string]any{"group_id": copied_group_id})
		if err != nil {
			return err
		}
		copied_category_ids[category_row.id] = copied_category_id
	}

	recurring_rows, err := household_tx.listSourceRows(ctx,
		`SELECT id::text, category_id::text FROM lf.recurring_expenses WHERE ledger_id = $1::uuid AND deleted = false ORDER BY created_at, id`,
		source_ledger_id)
	if err != nil {
		return err
	}
	for _, recurring_row := range recurring_rows {
		copied_category_id, has_category := copied_category_ids[recurring_row.reference_id]
		if !has_category {
			continue
		}
		if _, err := household_tx.copyRow(ctx, "recurring_expenses", recurring_row.id, target_ledger_id, map[string]any{"category_id": copied_category_id}); err != nil {
			return err
		}
	}
	return nil
}

// copyBaseIncome copies a member's base income from one ledger to another,
// replacing the target's row. It reports false when the source has none.
func (household_tx *householdTx) copyBaseIncome(ctx context.Context, source_ledger_id string, target_ledger_id string, member_id int64) (bool, error) {
	var base_income_amount int32
	err := household_tx.tx.QueryRow(ctx,
		`SELECT amount FROM lf.base_incomes WHERE ledger_id = $1::uuid AND member_id = $2 AND deleted = false`,
		source_ledger_id, member_id,
	).Scan(&base_income_amount)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("reading base income: %w", err)
	}
	next_seq, err := household_tx.seq_allocator.allocateSeq(ctx)
	if err != nil {
		return false, err
	}
	if _, err := household_tx.tx.Exec(ctx,
		`INSERT INTO lf.base_incomes (id, ledger_id, owner_id, seq, member_id, amount)
		 VALUES (gen_random_uuid(), $1::uuid, $2, $3, $2, $4)
		 ON CONFLICT (ledger_id, member_id) WHERE deleted = false
		 DO UPDATE SET amount = EXCLUDED.amount, seq = EXCLUDED.seq, updated_at = NOW()`,
		target_ledger_id, member_id, next_seq, base_income_amount,
	); err != nil {
		return false, fmt.Errorf("copying base income: %w", err)
	}
	return true, nil
}

// CreateHousehold creates a household with the caller as its owner and returns
// its ledger ID. It starts with a copy of the caller's categories, recurring
// expenses and base income, and no history (Q7).
func (r *Repository) CreateHousehold(ctx context.Context, user_id int64, household_name string) (string, error) {
	var household_id string
	err := r.runHouseholdCommand(ctx, user_id, func(ctx context.Context, household_tx *householdTx) error {
		if household_tx.caller_ledgers.HouseholdID != "" {
			return newCommandError(CommandConflict, alreadyInHouseholdMessage)
		}
		created_ledger_id, err := household_tx.insertLedger(ctx, user_id, "household", household_name)
		if err != nil {
			return err
		}
		household_id = created_ledger_id
		if err := household_tx.insertMembership(ctx, household_id, user_id, "owner", "household"); err != nil {
			return err
		}
		if err := household_tx.copyMaster(ctx, household_tx.caller_ledgers.PersonalID, household_id); err != nil {
			return err
		}
		if _, err := household_tx.copyBaseIncome(ctx, household_tx.caller_ledgers.PersonalID, household_id, user_id); err != nil {
			return err
		}
		return refreshAllowanceTotals(ctx, household_tx.seq_allocator, household_tx.caller_ledgers.PersonalID, []string{currentJSTMonth()})
	})
	if err != nil {
		return "", err
	}
	return household_id, nil
}

func currentJSTMonth() string {
	return time.Now().In(jstLocation()).Format("2006-01")
}

// CreatedInvitation is a new invitation. The token is returned only here: the
// server keeps its hash.
type CreatedInvitation struct {
	ID        string
	Token     string
	ShortCode string
	ExpiresAt time.Time
}

// OpenInvitation is an invitation that can still be redeemed.
type OpenInvitation struct {
	ID        string
	ShortCode string
	CreatedBy int64
	ExpiresAt time.Time
}

func hashInvitationToken(token string) []byte {
	token_hash := sha256.Sum256([]byte(token))
	return token_hash[:]
}

func newInvitationToken() (string, error) {
	token_bytes := make([]byte, 32)
	if _, err := rand.Read(token_bytes); err != nil {
		return "", fmt.Errorf("generating invitation token: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(token_bytes), nil
}

func newShortCode() (string, error) {
	random_bytes := make([]byte, ShortCodeLength)
	if _, err := rand.Read(random_bytes); err != nil {
		return "", fmt.Errorf("generating short code: %w", err)
	}
	var code_builder strings.Builder
	for _, random_byte := range random_bytes {
		// 256 is a multiple of the alphabet size (32), so every character is
		// equally likely.
		code_builder.WriteByte(ShortCodeAlphabet[int(random_byte)%len(ShortCodeAlphabet)])
	}
	return code_builder.String(), nil
}

// NormalizeShortCode upper-cases a typed code and drops separators.
func NormalizeShortCode(typed_code string) string {
	return strings.Map(func(code_rune rune) rune {
		if code_rune == '-' || code_rune == ' ' {
			return -1
		}
		return code_rune
	}, strings.ToUpper(strings.TrimSpace(typed_code)))
}

// CreateHouseholdInvitation creates a single-use invitation to the caller's
// household, valid for 24 hours (Q8).
func (r *Repository) CreateHouseholdInvitation(ctx context.Context, user_id int64) (*CreatedInvitation, error) {
	var created_invitation *CreatedInvitation
	err := r.runHouseholdCommand(ctx, user_id, func(ctx context.Context, household_tx *householdTx) error {
		household_id, err := household_tx.requireHousehold()
		if err != nil {
			return err
		}
		// Invitations of one household are created one at a time, so the bound
		// on open invitations holds.
		if _, err := household_tx.tx.Exec(ctx, "SELECT 1 FROM lf.ledgers WHERE id = $1::uuid FOR UPDATE", household_id); err != nil {
			return fmt.Errorf("locking household: %w", err)
		}
		var open_invitation_count int
		if err := household_tx.tx.QueryRow(ctx,
			`SELECT COUNT(*) FROM lf.household_invitations
			 WHERE ledger_id = $1::uuid AND used_at IS NULL AND revoked_at IS NULL AND expires_at > NOW()`,
			household_id,
		).Scan(&open_invitation_count); err != nil {
			return fmt.Errorf("counting open invitations: %w", err)
		}
		if open_invitation_count >= maxOpenInvitations {
			return newCommandError(CommandConflict, "有効な招待が多すぎます。使わない招待を取り消してください")
		}
		token, err := newInvitationToken()
		if err != nil {
			return err
		}
		expires_at := time.Now().Add(invitationLifetime)
		for attempt_number := 0; attempt_number < 5; attempt_number++ {
			short_code, err := newShortCode()
			if err != nil {
				return err
			}
			// A savepoint, so that a short code collision only undoes this insert.
			savepoint_tx, err := household_tx.tx.Begin(ctx)
			if err != nil {
				return fmt.Errorf("beginning invitation savepoint: %w", err)
			}
			var invitation_id string
			err = savepoint_tx.QueryRow(ctx,
				`INSERT INTO lf.household_invitations (id, ledger_id, created_by, token_hash, short_code, expires_at)
				 VALUES (gen_random_uuid(), $1::uuid, $2, $3, $4, $5)
				 RETURNING id::text`,
				household_id, user_id, hashInvitationToken(token), short_code, expires_at,
			).Scan(&invitation_id)
			if err != nil {
				_ = savepoint_tx.Rollback(ctx)
				if isUniqueViolation(err) {
					continue
				}
				return fmt.Errorf("creating invitation: %w", err)
			}
			if err := savepoint_tx.Commit(ctx); err != nil {
				return fmt.Errorf("releasing invitation savepoint: %w", err)
			}
			created_invitation = &CreatedInvitation{ID: invitation_id, Token: token, ShortCode: short_code, ExpiresAt: expires_at}
			return nil
		}
		return errors.New("creating invitation: no free short code")
	})
	if err != nil {
		return nil, err
	}
	return created_invitation, nil
}

// ListHouseholdInvitations returns the open invitations of the caller's household.
func (r *Repository) ListHouseholdInvitations(ctx context.Context, user_id int64) ([]OpenInvitation, error) {
	open_invitations := []OpenInvitation{}
	err := r.runHouseholdCommand(ctx, user_id, func(ctx context.Context, household_tx *householdTx) error {
		household_id, err := household_tx.requireHousehold()
		if err != nil {
			return err
		}
		invitation_rows, err := household_tx.tx.Query(ctx,
			`SELECT id::text, short_code, created_by, expires_at FROM lf.household_invitations
			 WHERE ledger_id = $1::uuid AND used_at IS NULL AND revoked_at IS NULL AND expires_at > NOW()
			 ORDER BY created_at, id`,
			household_id,
		)
		if err != nil {
			return fmt.Errorf("listing invitations: %w", err)
		}
		defer invitation_rows.Close()
		for invitation_rows.Next() {
			var open_invitation OpenInvitation
			if err := invitation_rows.Scan(&open_invitation.ID, &open_invitation.ShortCode, &open_invitation.CreatedBy, &open_invitation.ExpiresAt); err != nil {
				return fmt.Errorf("scanning invitation: %w", err)
			}
			open_invitations = append(open_invitations, open_invitation)
		}
		return invitation_rows.Err()
	})
	if err != nil {
		return nil, err
	}
	return open_invitations, nil
}

// RevokeHouseholdInvitation revokes an open invitation of the caller's household.
func (r *Repository) RevokeHouseholdInvitation(ctx context.Context, user_id int64, invitation_id string) error {
	return r.runHouseholdCommand(ctx, user_id, func(ctx context.Context, household_tx *householdTx) error {
		household_id, err := household_tx.requireHousehold()
		if err != nil {
			return err
		}
		if !syncrules.IsUUID(invitation_id) {
			return newCommandError(CommandNotFound, "招待が見つかりません")
		}
		command_tag, err := household_tx.tx.Exec(ctx,
			`UPDATE lf.household_invitations SET revoked_at = NOW()
			 WHERE id = $1::uuid AND ledger_id = $2::uuid AND used_at IS NULL AND revoked_at IS NULL`,
			invitation_id, household_id,
		)
		if err != nil {
			return fmt.Errorf("revoking invitation: %w", err)
		}
		if command_tag.RowsAffected() == 0 {
			return newCommandError(CommandNotFound, "招待が見つかりません")
		}
		return nil
	})
}

// JoinInput names an invitation by its link token or by its short code.
type JoinInput struct {
	Token     string
	ShortCode string
}

// errInvitationNotRedeemable marks a failed redemption, which counts toward the
// caller's rate limit.
var errInvitationNotRedeemable = errors.New("invitation not redeemable")

// JoinHousehold redeems an invitation and returns the household's ledger ID.
// The caller's base income is copied into the household (Q10); the rest of
// their personal ledger stays as it is.
func (r *Repository) JoinHousehold(ctx context.Context, user_id int64, join_input JoinInput) (string, error) {
	var recent_failure_count int
	if err := r.pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM lf.household_join_failures WHERE user_id = $1 AND failed_at > NOW() - make_interval(secs => $2)`,
		user_id, joinFailureWindow.Seconds(),
	).Scan(&recent_failure_count); err != nil {
		return "", fmt.Errorf("counting join failures: %w", err)
	}
	if recent_failure_count >= maxJoinFailures {
		return "", newCommandError(CommandTooManyRequests, "試行回数が多すぎます。しばらくしてからもう一度お試しください")
	}

	var household_id string
	err := r.runHouseholdCommand(ctx, user_id, func(ctx context.Context, household_tx *householdTx) error {
		if household_tx.caller_ledgers.HouseholdID != "" {
			return newCommandError(CommandConflict, alreadyInHouseholdMessage)
		}
		invitation_predicate, invitation_key := "i.short_code = $1", any(NormalizeShortCode(join_input.ShortCode))
		if join_input.Token != "" {
			invitation_predicate, invitation_key = "i.token_hash = $1", any(hashInvitationToken(join_input.Token))
		}
		var invitation_id string
		err := household_tx.tx.QueryRow(ctx,
			`SELECT i.id::text, i.ledger_id::text FROM lf.household_invitations i
			 JOIN lf.ledgers l ON l.id = i.ledger_id
			 WHERE `+invitation_predicate+` AND i.used_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > NOW()
			   AND l.kind = 'household' AND l.deleted = false
			 FOR UPDATE OF i`,
			invitation_key,
		).Scan(&invitation_id, &household_id)
		if errors.Is(err, pgx.ErrNoRows) {
			return errInvitationNotRedeemable
		}
		if err != nil {
			return fmt.Errorf("finding invitation: %w", err)
		}
		if _, err := household_tx.tx.Exec(ctx,
			"UPDATE lf.household_invitations SET used_by = $2, used_at = NOW() WHERE id = $1::uuid",
			invitation_id, user_id,
		); err != nil {
			return fmt.Errorf("using invitation: %w", err)
		}
		if err := household_tx.insertMembership(ctx, household_id, user_id, "member", "household"); err != nil {
			return err
		}
		if _, err := household_tx.copyBaseIncome(ctx, household_tx.caller_ledgers.PersonalID, household_id, user_id); err != nil {
			return err
		}
		// The allowance balance starts in the join month (design.md §3).
		return refreshAllowanceTotals(ctx, household_tx.seq_allocator, household_tx.caller_ledgers.PersonalID, []string{currentJSTMonth()})
	})
	if errors.Is(err, errInvitationNotRedeemable) {
		// Old failures no longer count; they are dropped as new ones come in.
		if _, record_err := r.pool.Exec(ctx,
			`WITH dropped AS (
			     DELETE FROM lf.household_join_failures WHERE user_id = $1 AND failed_at < NOW() - INTERVAL '1 day'
			 )
			 INSERT INTO lf.household_join_failures (user_id) VALUES ($1)`, user_id,
		); record_err != nil {
			return "", fmt.Errorf("recording join failure: %w", record_err)
		}
		return "", newCommandError(CommandNotFound, invitationNotFoundMessage)
	}
	if err != nil {
		return "", err
	}
	return household_id, nil
}

// archiveHouseholdFor copies the household's journal entries and income records
// up to today, with the categories the entries reference, into a new read-only
// archive ledger owned by member_id (Q9).
func (household_tx *householdTx) archiveHouseholdFor(ctx context.Context, household_id string, member_id int64) error {
	var household_name *string
	if err := household_tx.tx.QueryRow(ctx, "SELECT name FROM lf.ledgers WHERE id = $1::uuid", household_id).Scan(&household_name); err != nil {
		return fmt.Errorf("reading household: %w", err)
	}
	archive_name := ""
	if household_name != nil {
		archive_name = *household_name
	}
	archive_id, err := household_tx.insertLedger(ctx, member_id, "archive", archive_name)
	if err != nil {
		return err
	}
	if err := household_tx.insertMembership(ctx, archive_id, member_id, "owner", "archive"); err != nil {
		return err
	}

	// Categories are copied with their groups, deleted ones included, so the
	// archived entries keep their names.
	group_rows, err := household_tx.listSourceRows(ctx,
		`SELECT g.id::text, '' FROM lf.category_groups g
		 WHERE g.id IN (
		     SELECT c.group_id FROM lf.expense_categories c
		     WHERE c.ledger_id = $1::uuid AND c.id IN (
		         SELECT je.category_id FROM lf.journal_entries je
		         WHERE je.ledger_id = $1::uuid AND je.deleted = false AND je.transaction_date <= $2::text::date))
		 ORDER BY g.created_at, g.id`,
		household_id, todayJST())
	if err != nil {
		return err
	}
	copied_group_ids := map[string]string{}
	for _, group_row := range group_rows {
		copied_group_id, err := household_tx.copyRow(ctx, "category_groups", group_row.id, archive_id, map[string]any{})
		if err != nil {
			return err
		}
		copied_group_ids[group_row.id] = copied_group_id
	}
	category_rows, err := household_tx.listSourceRows(ctx,
		`SELECT c.id::text, c.group_id::text FROM lf.expense_categories c
		 WHERE c.ledger_id = $1::uuid AND c.id IN (
		     SELECT je.category_id FROM lf.journal_entries je
		     WHERE je.ledger_id = $1::uuid AND je.deleted = false AND je.transaction_date <= $2::text::date)
		 ORDER BY c.created_at, c.id`,
		household_id, todayJST())
	if err != nil {
		return err
	}
	copied_category_ids := map[string]string{}
	for _, category_row := range category_rows {
		copied_category_id, err := household_tx.copyRow(ctx, "expense_categories", category_row.id, archive_id,
			map[string]any{"group_id": copied_group_ids[category_row.reference_id]})
		if err != nil {
			return err
		}
		copied_category_ids[category_row.id] = copied_category_id
	}

	entry_rows, err := household_tx.listSourceRows(ctx,
		`SELECT id::text, category_id::text FROM lf.journal_entries
		 WHERE ledger_id = $1::uuid AND deleted = false AND transaction_date <= $2::text::date
		 ORDER BY transaction_date, id`,
		household_id, todayJST())
	if err != nil {
		return err
	}
	for _, entry_row := range entry_rows {
		// The archive has no recurring expenses, and a posting's unique key must
		// stay with the household's row.
		entry_overrides := map[string]any{"recurring_expense_id": nil, "recurring_year_month": nil}
		if copied_category_id, has_category := copied_category_ids[entry_row.reference_id]; has_category {
			entry_overrides["category_id"] = copied_category_id
		}
		if _, err := household_tx.copyRow(ctx, "journal_entries", entry_row.id, archive_id, entry_overrides); err != nil {
			return err
		}
	}

	income_rows, err := household_tx.listSourceRows(ctx,
		`SELECT id::text, '' FROM lf.income_records
		 WHERE ledger_id = $1::uuid AND deleted = false AND transaction_date <= $2::text::date
		 ORDER BY transaction_date, id`,
		household_id, todayJST())
	if err != nil {
		return err
	}
	for _, income_row := range income_rows {
		if _, err := household_tx.copyRow(ctx, "income_records", income_row.id, archive_id, map[string]any{}); err != nil {
			return err
		}
	}
	return nil
}

func todayJST() string {
	return time.Now().In(jstLocation()).Format("2006-01-02")
}

// returnBaseIncome copies the member's household base income back to their
// personal ledger.
func (household_tx *householdTx) returnBaseIncome(ctx context.Context, household_id string, member_id int64) (bool, error) {
	member_ledgers, err := loadCallerLedgers(ctx, household_tx.tx, member_id)
	if err != nil {
		return false, err
	}
	return household_tx.copyBaseIncome(ctx, household_id, member_ledgers.PersonalID, member_id)
}

// detachMember ends a membership: the member gets an archive of the household,
// their base income goes back to their personal ledger, and the household no
// longer counts it (§6).
func (household_tx *householdTx) detachMember(ctx context.Context, household_id string, membership *householdMembership) error {
	member_seq, err := household_tx.seq_allocator.allocateSeq(ctx)
	if err != nil {
		return err
	}
	if _, err := household_tx.tx.Exec(ctx,
		"UPDATE lf.ledger_members SET left_at = NOW(), updated_at = NOW(), seq = $2 WHERE id = $1::uuid",
		membership.id, member_seq,
	); err != nil {
		return fmt.Errorf("ending membership: %w", err)
	}
	if err := household_tx.archiveHouseholdFor(ctx, household_id, membership.user_id); err != nil {
		return err
	}
	has_base_income, err := household_tx.returnBaseIncome(ctx, household_id, membership.user_id)
	if err != nil || !has_base_income {
		return err
	}
	base_income_seq, err := household_tx.seq_allocator.allocateSeq(ctx)
	if err != nil {
		return err
	}
	if _, err := household_tx.tx.Exec(ctx,
		`UPDATE lf.base_incomes SET deleted = true, deleted_at = NOW(), updated_at = NOW(), seq = $3
		 WHERE ledger_id = $1::uuid AND member_id = $2 AND deleted = false`,
		household_id, membership.user_id, base_income_seq,
	); err != nil {
		return fmt.Errorf("removing household base income: %w", err)
	}
	return nil
}

// LeaveHousehold detaches the caller from their household. The owner can't
// leave; they remove the other members and dissolve the household instead.
func (r *Repository) LeaveHousehold(ctx context.Context, user_id int64) error {
	return r.runHouseholdCommand(ctx, user_id, func(ctx context.Context, household_tx *householdTx) error {
		household_id, err := household_tx.requireHousehold()
		if err != nil {
			return err
		}
		membership, err := household_tx.lockMembership(ctx, household_id, user_id)
		if err != nil {
			return err
		}
		if membership == nil {
			return newCommandError(CommandForbidden, householdNotAttachedMessage)
		}
		if membership.role == "owner" {
			return newCommandError(CommandConflict, "オーナーは退出できません。ほかのメンバーを外してから家計を解散してください")
		}
		return household_tx.detachMember(ctx, household_id, membership)
	})
}

// RemoveHouseholdMember lets the owner detach another member.
func (r *Repository) RemoveHouseholdMember(ctx context.Context, user_id int64, member_id int64) error {
	return r.runHouseholdCommand(ctx, user_id, func(ctx context.Context, household_tx *householdTx) error {
		household_id, err := household_tx.requireOwnedHousehold(ctx)
		if err != nil {
			return err
		}
		if member_id == user_id {
			return newCommandError(CommandConflict, "オーナー自身は外せません")
		}
		membership, err := household_tx.lockMembership(ctx, household_id, member_id)
		if err != nil {
			return err
		}
		if membership == nil {
			return newCommandError(CommandNotFound, householdMemberNotFoundText)
		}
		return household_tx.detachMember(ctx, household_id, membership)
	})
}

// requireOwnedHousehold returns the caller's household when they own it.
func (household_tx *householdTx) requireOwnedHousehold(ctx context.Context) (string, error) {
	household_id, err := household_tx.requireHousehold()
	if err != nil {
		return "", err
	}
	owner_membership, err := household_tx.lockMembership(ctx, household_id, household_tx.user_id)
	if err != nil {
		return "", err
	}
	if owner_membership == nil || owner_membership.role != "owner" {
		return "", newCommandError(CommandForbidden, householdOwnerOnlyMessage)
	}
	return household_id, nil
}

// DissolveHousehold turns the household into the owner's archive once they are
// its only member (§6). Its base income goes back to their personal ledger.
func (r *Repository) DissolveHousehold(ctx context.Context, user_id int64) error {
	return r.runHouseholdCommand(ctx, user_id, func(ctx context.Context, household_tx *householdTx) error {
		household_id, err := household_tx.requireOwnedHousehold(ctx)
		if err != nil {
			return err
		}
		other_member_count, err := household_tx.countOtherMembers(ctx, household_id, user_id)
		if err != nil {
			return err
		}
		if other_member_count > 0 {
			return newCommandError(CommandConflict, "ほかのメンバーがいる間は解散できません")
		}
		if _, err := household_tx.returnBaseIncome(ctx, household_id, user_id); err != nil {
			return err
		}
		if err := household_tx.seq_allocator.lock(ctx); err != nil {
			return err
		}
		archive_statements := []string{
			`UPDATE lf.ledgers SET kind = 'archive', updated_at = NOW(), seq = nextval('lf.sync_seq')
			 WHERE id = $1::uuid`,
			`UPDATE lf.ledger_members SET ledger_kind = 'archive', updated_at = NOW(), seq = nextval('lf.sync_seq')
			 WHERE ledger_id = $1::uuid AND left_at IS NULL AND deleted = false`,
			// The totals only make sense in a live household; dropping them also
			// keeps their ids free for a household the owner creates later.
			`UPDATE lf.allowance_totals SET deleted = true, deleted_at = NOW(), updated_at = NOW(), seq = nextval('lf.sync_seq')
			 WHERE ledger_id = $1::uuid AND deleted = false`,
			`UPDATE lf.household_invitations SET revoked_at = NOW()
			 WHERE ledger_id = $1::uuid AND used_at IS NULL AND revoked_at IS NULL`,
		}
		for _, archive_statement := range archive_statements {
			if _, err := household_tx.tx.Exec(ctx, archive_statement, household_id); err != nil {
				return fmt.Errorf("dissolving household: %w", err)
			}
		}
		return nil
	})
}

// PutHouseholdAllowance sets a member's allowance from effective_from (YYYY-MM)
// on. Any member can set any active member's allowance (design.md Q4).
func (r *Repository) PutHouseholdAllowance(ctx context.Context, user_id int64, member_id int64, effective_from string, amount int32) (*PulledRow, error) {
	return r.runLedgerCommand(ctx, HouseholdCaller(user_id), func(ctx context.Context, ledger_tx *ledgerTx) (*writtenRow, error) {
		var is_active_member bool
		if err := ledger_tx.tx.QueryRow(ctx,
			`SELECT EXISTS (
			     SELECT 1 FROM lf.ledger_members
			     WHERE ledger_id = $1::uuid AND user_id = $2 AND left_at IS NULL AND deleted = false
			     FOR SHARE)`,
			ledger_tx.ledger_id, member_id,
		).Scan(&is_active_member); err != nil {
			return nil, fmt.Errorf("checking allowance member: %w", err)
		}
		if !is_active_member {
			return nil, newCommandError(CommandNotFound, householdMemberNotFoundText)
		}
		next_seq, err := ledger_tx.seq_allocator.allocateSeq(ctx)
		if err != nil {
			return nil, err
		}
		var allowance_id string
		if err := ledger_tx.tx.QueryRow(ctx,
			`INSERT INTO lf.allowances (id, ledger_id, owner_id, seq, member_id, effective_from, amount)
			 VALUES (gen_random_uuid(), $1::uuid, $2, $3, $4, $5, $6)
			 ON CONFLICT (ledger_id, member_id, effective_from) WHERE deleted = false
			 DO UPDATE SET amount = EXCLUDED.amount, seq = EXCLUDED.seq, updated_at = NOW()
			 RETURNING id::text`,
			ledger_tx.ledger_id, ledger_tx.user_id, next_seq, member_id, effective_from, amount,
		).Scan(&allowance_id); err != nil {
			return nil, fmt.Errorf("upserting allowance: %w", err)
		}
		return &writtenRow{collection: "allowances", id: allowance_id}, nil
	})
}
