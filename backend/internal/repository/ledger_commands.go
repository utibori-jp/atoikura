package repository

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"

	"github.com/utibori-jp/atoikura/backend/internal/syncrules"
)

// REST commands for the online-only collections (#213, design.md §2). The server
// is authoritative for these: every command validates, enforces the invariants and
// commits in one transaction, and each written row gets a seq so that it reaches
// every device through pull. The ledger and the author always come from the
// caller's user ID. Table and column names come only from constants in this
// package; every value is bound through a placeholder.

// CommandErrorKind classifies why a ledger command was refused.
type CommandErrorKind int

const (
	// CommandInvalid: the input breaks a rule (400).
	CommandInvalid CommandErrorKind = iota + 1
	// CommandForbidden: the row is visible to the caller but not writable (403).
	CommandForbidden
	// CommandNotFound: no live row with that ID in the caller's ledger (404).
	CommandNotFound
	// CommandConflict: a uniqueness invariant would break (409).
	CommandConflict
)

// CommandError is a refusal with a Japanese message that can be shown to the user.
type CommandError struct {
	Kind    CommandErrorKind
	Message string
}

func (command_error *CommandError) Error() string {
	return command_error.Message
}

func newCommandError(kind CommandErrorKind, message string) error {
	return &CommandError{Kind: kind, Message: message}
}

// conflictOnUniqueViolation maps a unique-index violation to a conflict.
func conflictOnUniqueViolation(err error, message string) error {
	if isUniqueViolation(err) {
		return newCommandError(CommandConflict, message)
	}
	return err
}

// ledgerTx is one command's transaction in the caller's ledger.
type ledgerTx struct {
	tx            pgx.Tx
	seq_allocator *txAllocator
	ledger        *Ledger
	user_id       int64
}

// writtenRow names the row a command returns to the client.
type writtenRow struct {
	collection string
	id         string
}

// runLedgerCommand runs command in a transaction in the caller's ledger and
// returns the written row in the same shape pull returns it.
func (r *Repository) runLedgerCommand(ctx context.Context, user_id int64, command func(context.Context, *ledgerTx) (*writtenRow, error)) (*PulledRow, error) {
	caller_ledger, err := r.EnsurePersonalLedger(ctx, user_id)
	if err != nil {
		return nil, err
	}
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("beginning ledger command: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	ledger_tx := &ledgerTx{tx: tx, seq_allocator: &txAllocator{tx: tx}, ledger: caller_ledger, user_id: user_id}

	written_row_ref, err := command(ctx, ledger_tx)
	if err != nil {
		return nil, err
	}
	written_row, err := ledger_tx.readRow(ctx, written_row_ref.collection, written_row_ref.id)
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("committing ledger command: %w", err)
	}
	return written_row, nil
}

// columnValue is one column written by a command. sqlType is the column type;
// uuid and date values are bound as text and cast in SQL.
type columnValue struct {
	name    string
	value   any
	sqlType string
}

func columnPlaceholder(placeholder_number int, sql_type string) string {
	switch sql_type {
	case "uuid", "date":
		return fmt.Sprintf("$%d::text::%s", placeholder_number, sql_type)
	default:
		return fmt.Sprintf("$%d::%s", placeholder_number, sql_type)
	}
}

// insertRow inserts a row owned by the caller in the caller's ledger and returns
// its server-generated ID.
func (ledger_tx *ledgerTx) insertRow(ctx context.Context, collection string, column_values []columnValue) (string, error) {
	next_seq, err := ledger_tx.seq_allocator.allocateSeq(ctx)
	if err != nil {
		return "", err
	}
	column_names := []string{"id", "ledger_id", "owner_id", "seq"}
	placeholders := []string{"gen_random_uuid()", "$1::uuid", "$2", "$3"}
	insert_values := []any{ledger_tx.ledger.ID, ledger_tx.user_id, next_seq}
	for _, column_value := range column_values {
		insert_values = append(insert_values, column_value.value)
		column_names = append(column_names, column_value.name)
		placeholders = append(placeholders, columnPlaceholder(len(insert_values), column_value.sqlType))
	}
	var inserted_id string
	if err := ledger_tx.tx.QueryRow(ctx,
		"INSERT INTO lf."+collection+" ("+strings.Join(column_names, ", ")+") VALUES ("+strings.Join(placeholders, ", ")+") RETURNING id::text",
		insert_values...,
	).Scan(&inserted_id); err != nil {
		return "", fmt.Errorf("inserting %s row: %w", collection, err)
	}
	return inserted_id, nil
}

// updateRow overwrites columns of a row the caller has already locked.
func (ledger_tx *ledgerTx) updateRow(ctx context.Context, collection string, row_id string, column_values []columnValue) error {
	next_seq, err := ledger_tx.seq_allocator.allocateSeq(ctx)
	if err != nil {
		return err
	}
	assignments := []string{"seq = $2", "updated_at = NOW()"}
	update_values := []any{row_id, next_seq}
	for _, column_value := range column_values {
		update_values = append(update_values, column_value.value)
		assignments = append(assignments, column_value.name+" = "+columnPlaceholder(len(update_values), column_value.sqlType))
	}
	if _, err := ledger_tx.tx.Exec(ctx,
		"UPDATE lf."+collection+" SET "+strings.Join(assignments, ", ")+" WHERE id = $1::uuid",
		update_values...,
	); err != nil {
		return fmt.Errorf("updating %s row: %w", collection, err)
	}
	return nil
}

// tombstoneRow deletes a row the caller has already locked. Deletes are
// tombstones so that the deletion reaches every device through pull.
func (ledger_tx *ledgerTx) tombstoneRow(ctx context.Context, collection string, row_id string) error {
	next_seq, err := ledger_tx.seq_allocator.allocateSeq(ctx)
	if err != nil {
		return err
	}
	if _, err := ledger_tx.tx.Exec(ctx,
		"UPDATE lf."+collection+" SET deleted = true, deleted_at = NOW(), updated_at = NOW(), seq = $2 WHERE id = $1::uuid",
		row_id, next_seq,
	); err != nil {
		return fmt.Errorf("deleting %s row: %w", collection, err)
	}
	return nil
}

// lockedRow is a live row of the caller's ledger, decoded from to_jsonb.
type lockedRow struct {
	ID      string
	OwnerID int64
	Columns map[string]json.RawMessage
}

// text returns a text column, or "" when it is null.
func (locked_row *lockedRow) text(column_name string) string {
	var column_text string
	_ = json.Unmarshal(locked_row.Columns[column_name], &column_text)
	return column_text
}

// lockLiveRow locks a live row of the caller's ledger (row_lock is "UPDATE" or
// "SHARE"). It returns nil when the ID is malformed, belongs to another ledger,
// or the row is deleted, so a command can't tell other ledgers' rows apart from
// missing ones.
func (ledger_tx *ledgerTx) lockLiveRow(ctx context.Context, collection string, row_id string, row_lock string) (*lockedRow, error) {
	if !syncrules.IsUUID(row_id) {
		return nil, nil
	}
	var row_json []byte
	err := ledger_tx.tx.QueryRow(ctx,
		"SELECT to_jsonb(t) FROM lf."+collection+" t WHERE t.id = $1::uuid AND t.ledger_id = $2::uuid AND t.deleted = false FOR "+row_lock,
		row_id, ledger_tx.ledger.ID,
	).Scan(&row_json)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("locking %s row: %w", collection, err)
	}
	locked_row := &lockedRow{}
	if err := json.Unmarshal(row_json, &locked_row.Columns); err != nil {
		return nil, fmt.Errorf("decoding %s row: %w", collection, err)
	}
	_ = json.Unmarshal(locked_row.Columns["id"], &locked_row.ID)
	_ = json.Unmarshal(locked_row.Columns["owner_id"], &locked_row.OwnerID)
	return locked_row, nil
}

func (ledger_tx *ledgerTx) readRow(ctx context.Context, collection string, row_id string) (*PulledRow, error) {
	var row_json []byte
	if err := ledger_tx.tx.QueryRow(ctx,
		"SELECT to_jsonb(t) FROM lf."+collection+" t WHERE t.id = $1::uuid",
		row_id,
	).Scan(&row_json); err != nil {
		return nil, fmt.Errorf("reading written %s row: %w", collection, err)
	}
	written_row, err := decodePulledRow(collection, row_json)
	if err != nil {
		return nil, err
	}
	return &written_row, nil
}

// requireLiveCategory checks that a category is live in the caller's ledger.
func (ledger_tx *ledgerTx) requireLiveCategory(ctx context.Context, category_id string) error {
	category_row, err := ledger_tx.lockLiveRow(ctx, "expense_categories", category_id, "SHARE")
	if err != nil {
		return err
	}
	if category_row == nil {
		return newCommandError(CommandInvalid, "指定されたcategory_idは存在しません")
	}
	return nil
}
