package repository

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/utibori-jp/atoikura/backend/internal/syncrules"
)

// Local-first sync storage (docs/local-first/sync-protocol.md). Table and column
// names in the SQL below come only from the constant collection lists in this file
// and in package syncrules; every value is bound through a placeholder.

// syncSeqLockKey serializes seq allocation. A writer takes this transaction-level
// advisory lock right before nextval and holds it until commit, so seq order equals
// commit order and a pull can never see seq N+1 before seq N is visible. This is
// the "safe watermark" of sync-protocol.md §2, enforced on the write side. Every
// writer of lf.* tables must allocate seq through allocateSeq.
const syncSeqLockKey int64 = 0x6c66_7365_71 // "lfseq"

const pgUniqueViolation = "23505"

// Ledger is the caller's current ledger.
type Ledger struct {
	ID   string
	Kind string
}

type txAllocator struct {
	tx        pgx.Tx
	is_locked bool
}

// lock takes the seq lock once per transaction. Statements that call
// nextval('lf.sync_seq') themselves must run after it.
func (seq_allocator *txAllocator) lock(ctx context.Context) error {
	if seq_allocator.is_locked {
		return nil
	}
	if _, err := seq_allocator.tx.Exec(ctx, "SELECT pg_advisory_xact_lock($1)", syncSeqLockKey); err != nil {
		return fmt.Errorf("acquiring seq lock: %w", err)
	}
	seq_allocator.is_locked = true
	return nil
}

// allocateSeq takes the seq lock (once per transaction) and returns the next seq.
func (seq_allocator *txAllocator) allocateSeq(ctx context.Context) (int64, error) {
	if err := seq_allocator.lock(ctx); err != nil {
		return 0, err
	}
	var next_seq int64
	if err := seq_allocator.tx.QueryRow(ctx, "SELECT nextval('lf.sync_seq')").Scan(&next_seq); err != nil {
		return 0, fmt.Errorf("allocating seq: %w", err)
	}
	return next_seq, nil
}

func isUniqueViolation(err error) bool {
	var pg_error *pgconn.PgError
	return errors.As(err, &pg_error) && pg_error.Code == pgUniqueViolation
}

// EnsurePersonalLedger returns the user's current ledger, creating a personal
// ledger with the user as its owner the first time.
func (r *Repository) EnsurePersonalLedger(ctx context.Context, user_id int64) (*Ledger, error) {
	for attempt_number := 0; attempt_number < 2; attempt_number++ {
		current_ledger, err := r.currentLedger(ctx, user_id)
		if err != nil || current_ledger != nil {
			return current_ledger, err
		}
		err = r.createPersonalLedger(ctx, user_id)
		if err == nil || isUniqueViolation(err) {
			// Created here, or concurrently by another request: read it back.
			continue
		}
		return nil, err
	}
	return r.currentLedger(ctx, user_id)
}

func (r *Repository) currentLedger(ctx context.Context, user_id int64) (*Ledger, error) {
	var current_ledger Ledger
	err := r.pool.QueryRow(ctx,
		`SELECT l.id::text, l.kind
		 FROM lf.ledger_members m
		 JOIN lf.ledgers l ON l.id = m.ledger_id
		 WHERE m.user_id = $1 AND m.left_at IS NULL AND m.deleted = false AND l.deleted = false`,
		user_id,
	).Scan(&current_ledger.ID, &current_ledger.Kind)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("loading current ledger: %w", err)
	}
	return &current_ledger, nil
}

func (r *Repository) createPersonalLedger(ctx context.Context, user_id int64) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("beginning ledger transaction: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	seq_allocator := &txAllocator{tx: tx}

	ledger_seq, err := seq_allocator.allocateSeq(ctx)
	if err != nil {
		return err
	}
	var ledger_id string
	if err := tx.QueryRow(ctx,
		`INSERT INTO lf.ledgers (id, ledger_id, owner_id, seq, kind)
		 SELECT generated.id, generated.id, $1, $2, 'personal' FROM (SELECT gen_random_uuid() AS id) generated
		 RETURNING id::text`,
		user_id, ledger_seq,
	).Scan(&ledger_id); err != nil {
		return fmt.Errorf("creating personal ledger: %w", err)
	}
	member_seq, err := seq_allocator.allocateSeq(ctx)
	if err != nil {
		return err
	}
	if _, err := tx.Exec(ctx,
		`INSERT INTO lf.ledger_members (id, ledger_id, owner_id, seq, user_id, role)
		 VALUES (gen_random_uuid(), $1::uuid, $2, $3, $2, 'owner')`,
		ledger_id, user_id, member_seq,
	); err != nil {
		return fmt.Errorf("adding ledger owner: %w", err)
	}
	if err := insertDefaultLedgerCategories(ctx, seq_allocator, ledger_id, user_id); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// PushInput is one change of a push request with its encoded size in bytes.
type PushInput struct {
	Change syncrules.Change
	Size   int
}

// PushResult is the per-change outcome reported to the client.
type PushResult struct {
	ID         string
	Applied    bool
	Seq        *int64
	Superseded []string
	MergedInto *string
	Reason     string
	Message    string
}

func rejectedResult(change_id string, rejection *syncrules.Rejection) PushResult {
	return PushResult{ID: change_id, Reason: rejection.Reason, Message: rejection.Message}
}

// Push applies each change in its own transaction. The caller's ledger and owner
// come from user_id only; nothing in a change can name another owner or ledger.
func (r *Repository) Push(ctx context.Context, user_id int64, push_inputs []PushInput) ([]PushResult, error) {
	caller_ledger, err := r.EnsurePersonalLedger(ctx, user_id)
	if err != nil {
		return nil, err
	}
	now := time.Now()
	push_results := make([]PushResult, 0, len(push_inputs))
	for _, push_input := range push_inputs {
		collection_spec, rejection := syncrules.CheckEnvelope(push_input.Change, push_input.Size, now)
		if rejection != nil {
			push_results = append(push_results, rejectedResult(push_input.Change.ID, rejection))
			continue
		}
		push_result, err := r.pushChangeWithRetry(ctx, user_id, caller_ledger, collection_spec, push_input.Change)
		if err != nil {
			return nil, err
		}
		push_results = append(push_results, push_result)
	}
	return push_results, nil
}

// pushChangeWithRetry retries once when a concurrent push created the same natural
// key first; the retry then merges into that record.
func (r *Repository) pushChangeWithRetry(ctx context.Context, user_id int64, caller_ledger *Ledger, collection_spec *syncrules.CollectionSpec, change syncrules.Change) (PushResult, error) {
	push_result, err := r.pushChange(ctx, user_id, caller_ledger, collection_spec, change)
	if err != nil && isUniqueViolation(err) {
		push_result, err = r.pushChange(ctx, user_id, caller_ledger, collection_spec, change)
	}
	return push_result, err
}

func (r *Repository) pushChange(ctx context.Context, user_id int64, caller_ledger *Ledger, collection_spec *syncrules.CollectionSpec, change syncrules.Change) (PushResult, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return PushResult{}, fmt.Errorf("beginning push transaction: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	stored_record, err := loadStoredRecord(ctx, tx, collection_spec, "t.id = $1::uuid", change.ID)
	if err != nil {
		return PushResult{}, err
	}
	if stored_record != nil && !syncrules.CanWrite(&stored_record.StoredRecord, user_id, caller_ledger.ID) {
		return rejectedResult(change.ID, &syncrules.Rejection{Reason: syncrules.ReasonForbidden, Message: "このデータは変更できません"}), nil
	}

	decoded_row := syncrules.DecodeFields(collection_spec, change)
	var stored_state *syncrules.StoredRecord
	if stored_record != nil {
		stored_state = &stored_record.StoredRecord
	}
	merge_result, rejection := syncrules.Merge(collection_spec, stored_state, change, decoded_row)
	if rejection != nil {
		return rejectedResult(change.ID, rejection), nil
	}
	push_result := PushResult{ID: change.ID, Applied: true, Superseded: merge_result.Superseded}
	if !merge_result.Changed {
		return push_result, nil
	}

	write_target_id := change.ID
	if !merge_result.Tombstone {
		validation_context := syncrules.ValidationContext{
			IsHousehold: caller_ledger.Kind == "household",
			CategoryInLedger: func(category_id string) (bool, error) {
				return categoryInLedger(ctx, tx, category_id, caller_ledger.ID)
			},
		}
		rejection, err := syncrules.ValidateRow(collection_spec, merge_result.Candidate, validation_context)
		if err != nil {
			return PushResult{}, err
		}
		if rejection != nil {
			return rejectedResult(change.ID, rejection), nil
		}

		if stored_record == nil && len(collection_spec.NaturalKey) > 0 {
			duplicate_record, err := loadNaturalKeyDuplicate(ctx, tx, collection_spec, caller_ledger.ID, user_id, merge_result.Candidate)
			if err != nil {
				return PushResult{}, err
			}
			if duplicate_record != nil {
				merged_into := duplicate_record.ID
				push_result.MergedInto = &merged_into
				merge_result = syncrules.MergeNaturalKeyDuplicate(collection_spec, &duplicate_record.StoredRecord, change, decoded_row)
				if !merge_result.Changed {
					return push_result, tx.Commit(ctx)
				}
				stored_record = duplicate_record
				write_target_id = duplicate_record.ID
			}
		}
	}

	seq_allocator := &txAllocator{tx: tx}
	next_seq, err := seq_allocator.allocateSeq(ctx)
	if err != nil {
		return PushResult{}, err
	}
	switch {
	case merge_result.Tombstone:
		err = writeTombstone(ctx, tx, collection_spec, write_target_id, next_seq, *change.DeletedHLC)
	case stored_record == nil:
		err = insertRecord(ctx, tx, collection_spec, write_target_id, caller_ledger.ID, user_id, next_seq, merge_result)
	default:
		err = updateRecord(ctx, tx, collection_spec, write_target_id, next_seq, merge_result)
	}
	if err != nil {
		return PushResult{}, err
	}
	if collection_spec.Name == "journal_entries" {
		entry_owner_id := user_id
		var stored_values syncrules.Row
		if stored_record != nil {
			entry_owner_id = stored_record.OwnerID
			stored_values = stored_record.Values
		}
		allowance_months := allowanceMonthsTouched(stored_values, merge_result.Candidate)
		if err := recomputeAllowanceTotals(ctx, seq_allocator, caller_ledger.ID, entry_owner_id, allowance_months); err != nil {
			return PushResult{}, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return PushResult{}, fmt.Errorf("committing push: %w", err)
	}
	push_result.Seq = &next_seq
	return push_result, nil
}

type loadedRecord struct {
	syncrules.StoredRecord
	ID string
}

// loadStoredRecord locks and loads one record of the collection. where_sql is a
// constant predicate on alias t whose values are bound from where_values.
func loadStoredRecord(ctx context.Context, tx pgx.Tx, collection_spec *syncrules.CollectionSpec, where_sql string, where_values ...any) (*loadedRecord, error) {
	var row_json []byte
	err := tx.QueryRow(ctx,
		"SELECT to_jsonb(t) FROM lf."+collection_spec.Name+" t WHERE "+where_sql+" FOR UPDATE",
		where_values...,
	).Scan(&row_json)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("loading %s record: %w", collection_spec.Name, err)
	}

	var stored_columns map[string]json.RawMessage
	if err := json.Unmarshal(row_json, &stored_columns); err != nil {
		return nil, fmt.Errorf("decoding %s record: %w", collection_spec.Name, err)
	}
	loaded_record := &loadedRecord{StoredRecord: syncrules.StoredRecord{Values: syncrules.Row{}, FieldHLC: map[string]string{}}}
	_ = json.Unmarshal(stored_columns["id"], &loaded_record.ID)
	_ = json.Unmarshal(stored_columns["ledger_id"], &loaded_record.LedgerID)
	_ = json.Unmarshal(stored_columns["owner_id"], &loaded_record.OwnerID)
	_ = json.Unmarshal(stored_columns["deleted"], &loaded_record.Deleted)
	_ = json.Unmarshal(stored_columns["field_hlc"], &loaded_record.FieldHLC)
	if recurring_json, found := stored_columns["recurring_expense_id"]; found && !bytes.Equal(recurring_json, []byte("null")) {
		var recurring_expense_id string
		_ = json.Unmarshal(recurring_json, &recurring_expense_id)
		loaded_record.RecurringExpenseID = &recurring_expense_id
	}
	for _, field_spec := range collection_spec.Fields {
		if stored_value, found := stored_columns[field_spec.Name]; found {
			loaded_record.Values[field_spec.Name] = syncrules.DecodeValue(stored_value)
		}
	}
	return loaded_record, nil
}

func loadNaturalKeyDuplicate(ctx context.Context, tx pgx.Tx, collection_spec *syncrules.CollectionSpec, ledger_id string, owner_id int64, candidate_row syncrules.Row) (*loadedRecord, error) {
	predicates := []string{"t.ledger_id = $1::uuid", "t.owner_id = $2", "t.deleted = false"}
	where_values := []any{ledger_id, owner_id}
	for _, key_field_name := range collection_spec.NaturalKey {
		field_spec, _ := collection_spec.Field(key_field_name)
		where_values = append(where_values, candidate_row[key_field_name])
		predicates = append(predicates, fmt.Sprintf("t.%s = $%d::text::%s", key_field_name, len(where_values), field_spec.Kind))
	}
	return loadStoredRecord(ctx, tx, collection_spec, strings.Join(predicates, " AND "), where_values...)
}

func categoryInLedger(ctx context.Context, tx pgx.Tx, category_id string, ledger_id string) (bool, error) {
	var is_in_ledger bool
	err := tx.QueryRow(ctx,
		"SELECT EXISTS (SELECT 1 FROM lf.expense_categories WHERE id = $1::uuid AND ledger_id = $2::uuid)",
		category_id, ledger_id,
	).Scan(&is_in_ledger)
	if err != nil {
		return false, fmt.Errorf("checking category ledger: %w", err)
	}
	return is_in_ledger, nil
}

// fieldPlaceholder casts a bound value to the field's column type. Text-encoded
// values go through ::text first so pgx can bind plain Go strings.
func fieldPlaceholder(placeholder_number int, field_kind syncrules.ColumnKind) string {
	switch field_kind {
	case syncrules.KindDate, syncrules.KindUUID:
		return fmt.Sprintf("$%d::text::%s", placeholder_number, field_kind)
	default:
		return fmt.Sprintf("$%d::%s", placeholder_number, field_kind)
	}
}

func encodeFieldHLC(field_hlc map[string]string) ([]byte, error) {
	encoded_hlc, err := json.Marshal(field_hlc)
	if err != nil {
		return nil, fmt.Errorf("encoding field_hlc: %w", err)
	}
	return encoded_hlc, nil
}

func insertRecord(ctx context.Context, tx pgx.Tx, collection_spec *syncrules.CollectionSpec, record_id string, ledger_id string, owner_id int64, next_seq int64, merge_result syncrules.MergeResult) error {
	encoded_hlc, err := encodeFieldHLC(merge_result.FieldHLC)
	if err != nil {
		return err
	}
	column_names := []string{"id", "ledger_id", "owner_id", "seq", "field_hlc"}
	placeholders := []string{"$1::uuid", "$2::uuid", "$3", "$4", "$5::jsonb"}
	insert_values := []any{record_id, ledger_id, owner_id, next_seq, string(encoded_hlc)}
	for _, field_spec := range collection_spec.Fields {
		field_value, has_value := merge_result.Candidate[field_spec.Name]
		if !has_value || field_value == nil {
			continue
		}
		insert_values = append(insert_values, field_value)
		column_names = append(column_names, field_spec.Name)
		placeholders = append(placeholders, fieldPlaceholder(len(insert_values), field_spec.Kind))
	}
	if _, err := tx.Exec(ctx,
		"INSERT INTO lf."+collection_spec.Name+" ("+strings.Join(column_names, ", ")+") VALUES ("+strings.Join(placeholders, ", ")+")",
		insert_values...,
	); err != nil {
		return fmt.Errorf("inserting %s record: %w", collection_spec.Name, err)
	}
	return nil
}

func updateRecord(ctx context.Context, tx pgx.Tx, collection_spec *syncrules.CollectionSpec, record_id string, next_seq int64, merge_result syncrules.MergeResult) error {
	encoded_hlc, err := encodeFieldHLC(merge_result.FieldHLC)
	if err != nil {
		return err
	}
	assignments := []string{"seq = $2", "field_hlc = $3::jsonb", "updated_at = NOW()"}
	update_values := []any{record_id, next_seq, string(encoded_hlc)}
	for _, field_spec := range collection_spec.Fields {
		update_values = append(update_values, merge_result.Candidate[field_spec.Name])
		assignments = append(assignments, field_spec.Name+" = "+fieldPlaceholder(len(update_values), field_spec.Kind))
	}
	if _, err := tx.Exec(ctx,
		"UPDATE lf."+collection_spec.Name+" SET "+strings.Join(assignments, ", ")+" WHERE id = $1::uuid",
		update_values...,
	); err != nil {
		return fmt.Errorf("updating %s record: %w", collection_spec.Name, err)
	}
	return nil
}

func writeTombstone(ctx context.Context, tx pgx.Tx, collection_spec *syncrules.CollectionSpec, record_id string, next_seq int64, deleted_hlc string) error {
	if _, err := tx.Exec(ctx,
		"UPDATE lf."+collection_spec.Name+
			` SET deleted = true, deleted_at = NOW(), updated_at = NOW(), seq = $2,
			      field_hlc = field_hlc || jsonb_build_object('__deleted', $3::text)
			  WHERE id = $1::uuid`,
		record_id, next_seq, deleted_hlc,
	); err != nil {
		return fmt.Errorf("tombstoning %s record: %w", collection_spec.Name, err)
	}
	return nil
}

// pullCollection is one synced table and the extra visibility rule applied to the
// caller ($3 is the caller's user ID) on top of "same ledger".
type pullCollection struct {
	name       string
	visibility string
}

// pullCollections lists every synced table in lf (design.md §3.1). Allowance-wallet
// rows and notes are visible to their owner only.
var pullCollections = []pullCollection{
	{name: "ledgers"},
	{name: "ledger_members"},
	{name: "category_groups"},
	{name: "expense_categories"},
	{name: "income_records"},
	{name: "base_incomes"},
	{name: "recurring_expenses", visibility: "(t.wallet = 'ledger' OR t.owner_id = $3)"},
	{name: "savings_goals"},
	{name: "savings_postings"},
	{name: "budgets"},
	{name: "allowances"},
	{name: "surplus_allocations"},
	{name: "allowance_totals"},
	{name: "journal_entries", visibility: "(t.wallet = 'ledger' OR t.owner_id = $3)"},
	{name: "daily_notes", visibility: "t.owner_id = $3"},
	{name: "monthly_review_notes", visibility: "t.owner_id = $3"},
}

var pullQuery = buildPullQuery()

func buildPullQuery() string {
	collection_selects := make([]string, 0, len(pullCollections))
	for _, pull_collection := range pullCollections {
		visibility_sql := "TRUE"
		if pull_collection.visibility != "" {
			visibility_sql = pull_collection.visibility
		}
		collection_selects = append(collection_selects, fmt.Sprintf(
			"SELECT '%s' AS collection, t.seq, to_jsonb(t) AS row_data FROM lf.%s t WHERE t.ledger_id = $1::uuid AND t.seq > $2 AND %s",
			pull_collection.name, pull_collection.name, visibility_sql,
		))
	}
	return strings.Join(collection_selects, "\nUNION ALL\n") + "\nORDER BY seq\nLIMIT $4"
}

// PulledRow is one changed row returned by pull.
type PulledRow struct {
	Collection string
	ID         string
	OwnerID    int64
	Seq        int64
	Deleted    bool
	Data       map[string]json.RawMessage
	FieldHLC   map[string]string
}

// PullResult is one page of changes after a cursor.
type PullResult struct {
	LedgerID  string
	Rows      []PulledRow
	NextSince int64
	HasMore   bool
}

// envelopeColumns are returned outside of data (or not at all).
var envelopeColumns = []string{"id", "ledger_id", "owner_id", "seq", "deleted", "field_hlc"}

// Pull returns the rows of the caller's ledger visible to the caller, with
// seq > since, ordered by seq.
func (r *Repository) Pull(ctx context.Context, user_id int64, since int64, limit int) (*PullResult, error) {
	caller_ledger, err := r.EnsurePersonalLedger(ctx, user_id)
	if err != nil {
		return nil, err
	}
	// The first pull of a month posts that month's fixed recurring expenses and
	// savings (design.md §5.3), so the postings are part of this very pull.
	if err := r.PostMonthlyForLedger(ctx, caller_ledger.ID, time.Now().In(jstLocation()).Format("2006-01")); err != nil {
		return nil, err
	}
	pulled_rows, err := r.pool.Query(ctx, pullQuery, caller_ledger.ID, since, user_id, limit+1)
	if err != nil {
		return nil, fmt.Errorf("pulling changes: %w", err)
	}
	defer pulled_rows.Close()

	pull_result := &PullResult{LedgerID: caller_ledger.ID, NextSince: since, Rows: []PulledRow{}}
	for pulled_rows.Next() {
		var collection_name string
		var row_seq int64
		var row_json []byte
		if err := pulled_rows.Scan(&collection_name, &row_seq, &row_json); err != nil {
			return nil, fmt.Errorf("scanning pulled row: %w", err)
		}
		if len(pull_result.Rows) == limit {
			pull_result.HasMore = true
			break
		}
		pulled_row, err := decodePulledRow(collection_name, row_json)
		if err != nil {
			return nil, err
		}
		pull_result.Rows = append(pull_result.Rows, pulled_row)
		pull_result.NextSince = row_seq
	}
	if err := pulled_rows.Err(); err != nil {
		return nil, fmt.Errorf("reading pulled rows: %w", err)
	}
	return pull_result, nil
}

// decodePulledRow turns a to_jsonb row into the shape pull returns: envelope
// columns are lifted out of data.
func decodePulledRow(collection_name string, row_json []byte) (PulledRow, error) {
	var row_columns map[string]json.RawMessage
	if err := json.Unmarshal(row_json, &row_columns); err != nil {
		return PulledRow{}, fmt.Errorf("decoding %s row: %w", collection_name, err)
	}
	pulled_row := PulledRow{Collection: collection_name}
	_ = json.Unmarshal(row_columns["id"], &pulled_row.ID)
	_ = json.Unmarshal(row_columns["owner_id"], &pulled_row.OwnerID)
	_ = json.Unmarshal(row_columns["seq"], &pulled_row.Seq)
	_ = json.Unmarshal(row_columns["deleted"], &pulled_row.Deleted)
	if field_hlc_json, found := row_columns["field_hlc"]; found {
		_ = json.Unmarshal(field_hlc_json, &pulled_row.FieldHLC)
	}
	for _, envelope_column := range envelopeColumns {
		delete(row_columns, envelope_column)
	}
	pulled_row.Data = row_columns
	return pulled_row, nil
}
