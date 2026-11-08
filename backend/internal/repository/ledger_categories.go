package repository

import (
	"context"
	"fmt"
)

// Category master commands (design.md D9): one master per ledger, editable by
// any member.

const (
	categoryGroupNotFoundMessage   = "大分類が見つかりません"
	categoryGroupDuplicateMessage  = "同名の大分類が既に存在します"
	expenseCategoryNotFoundMessage = "生活区分が見つかりません"
	expenseCategoryDuplicate       = "同名の生活区分が既に存在します"
)

// CategoryGroupInput is the editable content of a category group.
type CategoryGroupInput struct {
	Name              string
	StatementTypeCode string
	Description       *string
}

func (category_group_input CategoryGroupInput) columns() []columnValue {
	return []columnValue{
		{name: "name", value: category_group_input.Name, sqlType: "text"},
		{name: "statement_type_code", value: category_group_input.StatementTypeCode, sqlType: "text"},
		{name: "description", value: category_group_input.Description, sqlType: "text"},
	}
}

// CreateLedgerCategoryGroup adds a category group to the caller's ledger.
func (r *Repository) CreateLedgerCategoryGroup(ctx context.Context, caller Caller, category_group_input CategoryGroupInput) (*PulledRow, error) {
	return r.runLedgerCommand(ctx, caller, func(ctx context.Context, ledger_tx *ledgerTx) (*writtenRow, error) {
		group_id, err := ledger_tx.insertRow(ctx, "category_groups", category_group_input.columns())
		if err != nil {
			return nil, conflictOnUniqueViolation(err, categoryGroupDuplicateMessage)
		}
		return &writtenRow{collection: "category_groups", id: group_id}, nil
	})
}

// UpdateLedgerCategoryGroup overwrites a category group of the caller's ledger.
func (r *Repository) UpdateLedgerCategoryGroup(ctx context.Context, caller Caller, group_id string, category_group_input CategoryGroupInput) (*PulledRow, error) {
	return r.runLedgerCommand(ctx, caller, func(ctx context.Context, ledger_tx *ledgerTx) (*writtenRow, error) {
		group_row, err := ledger_tx.lockLiveRow(ctx, "category_groups", group_id, "UPDATE")
		if err != nil {
			return nil, err
		}
		if group_row == nil {
			return nil, newCommandError(CommandNotFound, categoryGroupNotFoundMessage)
		}
		if err := ledger_tx.updateRow(ctx, "category_groups", group_row.ID, category_group_input.columns()); err != nil {
			return nil, conflictOnUniqueViolation(err, categoryGroupDuplicateMessage)
		}
		return &writtenRow{collection: "category_groups", id: group_row.ID}, nil
	})
}

// DeleteLedgerCategoryGroup deletes a category group that has no live
// categories left, as the legacy API does.
func (r *Repository) DeleteLedgerCategoryGroup(ctx context.Context, caller Caller, group_id string) (*PulledRow, error) {
	return r.runLedgerCommand(ctx, caller, func(ctx context.Context, ledger_tx *ledgerTx) (*writtenRow, error) {
		// FOR UPDATE here and FOR SHARE in category writes serialize the two, so a
		// category can't be added to a group that is being deleted.
		group_row, err := ledger_tx.lockLiveRow(ctx, "category_groups", group_id, "UPDATE")
		if err != nil {
			return nil, err
		}
		if group_row == nil {
			return nil, newCommandError(CommandNotFound, categoryGroupNotFoundMessage)
		}
		var has_live_categories bool
		if err := ledger_tx.tx.QueryRow(ctx,
			"SELECT EXISTS (SELECT 1 FROM lf.expense_categories WHERE group_id = $1::uuid AND deleted = false)",
			group_row.ID,
		).Scan(&has_live_categories); err != nil {
			return nil, fmt.Errorf("checking categories of group: %w", err)
		}
		if has_live_categories {
			return nil, newCommandError(CommandInvalid, "紐づく生活区分が存在するため削除できません")
		}
		if err := ledger_tx.tombstoneRow(ctx, "category_groups", group_row.ID); err != nil {
			return nil, err
		}
		return &writtenRow{collection: "category_groups", id: group_row.ID}, nil
	})
}

// ExpenseCategoryInput is the editable content of a category.
type ExpenseCategoryInput struct {
	GroupID     string
	Name        string
	Description *string
}

func (ledger_tx *ledgerTx) requireLiveGroup(ctx context.Context, group_id string) (string, error) {
	group_row, err := ledger_tx.lockLiveRow(ctx, "category_groups", group_id, "SHARE")
	if err != nil {
		return "", err
	}
	if group_row == nil {
		return "", newCommandError(CommandInvalid, "指定した大分類が見つかりません")
	}
	return group_row.ID, nil
}

func expenseCategoryColumns(group_id string, expense_category_input ExpenseCategoryInput) []columnValue {
	return []columnValue{
		{name: "group_id", value: group_id, sqlType: "uuid"},
		{name: "name", value: expense_category_input.Name, sqlType: "text"},
		{name: "description", value: expense_category_input.Description, sqlType: "text"},
	}
}

// CreateLedgerExpenseCategory adds a category to a live group of the caller's ledger.
func (r *Repository) CreateLedgerExpenseCategory(ctx context.Context, caller Caller, expense_category_input ExpenseCategoryInput) (*PulledRow, error) {
	return r.runLedgerCommand(ctx, caller, func(ctx context.Context, ledger_tx *ledgerTx) (*writtenRow, error) {
		group_id, err := ledger_tx.requireLiveGroup(ctx, expense_category_input.GroupID)
		if err != nil {
			return nil, err
		}
		category_id, err := ledger_tx.insertRow(ctx, "expense_categories", expenseCategoryColumns(group_id, expense_category_input))
		if err != nil {
			return nil, conflictOnUniqueViolation(err, expenseCategoryDuplicate)
		}
		return &writtenRow{collection: "expense_categories", id: category_id}, nil
	})
}

// UpdateLedgerExpenseCategory overwrites a category, possibly moving it to
// another live group of the same ledger.
func (r *Repository) UpdateLedgerExpenseCategory(ctx context.Context, caller Caller, category_id string, expense_category_input ExpenseCategoryInput) (*PulledRow, error) {
	return r.runLedgerCommand(ctx, caller, func(ctx context.Context, ledger_tx *ledgerTx) (*writtenRow, error) {
		category_row, err := ledger_tx.lockLiveRow(ctx, "expense_categories", category_id, "UPDATE")
		if err != nil {
			return nil, err
		}
		if category_row == nil {
			return nil, newCommandError(CommandNotFound, expenseCategoryNotFoundMessage)
		}
		group_id, err := ledger_tx.requireLiveGroup(ctx, expense_category_input.GroupID)
		if err != nil {
			return nil, err
		}
		if err := ledger_tx.updateRow(ctx, "expense_categories", category_row.ID, expenseCategoryColumns(group_id, expense_category_input)); err != nil {
			return nil, conflictOnUniqueViolation(err, expenseCategoryDuplicate)
		}
		return &writtenRow{collection: "expense_categories", id: category_row.ID}, nil
	})
}

// DeleteLedgerExpenseCategory deletes a category. Entries that reference it stay
// valid; devices flag them (design.md §5.1).
func (r *Repository) DeleteLedgerExpenseCategory(ctx context.Context, caller Caller, category_id string) (*PulledRow, error) {
	return r.runLedgerCommand(ctx, caller, func(ctx context.Context, ledger_tx *ledgerTx) (*writtenRow, error) {
		category_row, err := ledger_tx.lockLiveRow(ctx, "expense_categories", category_id, "UPDATE")
		if err != nil {
			return nil, err
		}
		if category_row == nil {
			return nil, newCommandError(CommandNotFound, expenseCategoryNotFoundMessage)
		}
		if err := ledger_tx.tombstoneRow(ctx, "expense_categories", category_row.ID); err != nil {
			return nil, err
		}
		return &writtenRow{collection: "expense_categories", id: category_row.ID}, nil
	})
}
