package repository

import (
	"context"
	"fmt"
)

// Income, base income, budget and surplus allocation commands.

const (
	incomeRecordNotFoundMessage = "収入記録が見つかりません"
	savingsGoalNotFoundMessage  = "貯金目標が見つかりません"
)

// IncomeRecordInput is the editable content of an income record.
type IncomeRecordInput struct {
	TransactionDate string
	Amount          int32
	Name            string
	IncomeType      string
	Emoji           string
	Note            string
}

func (income_record_input IncomeRecordInput) columns() []columnValue {
	return []columnValue{
		{name: "transaction_date", value: income_record_input.TransactionDate, sqlType: "date"},
		{name: "amount", value: income_record_input.Amount, sqlType: "integer"},
		{name: "name", value: income_record_input.Name, sqlType: "text"},
		{name: "income_type", value: income_record_input.IncomeType, sqlType: "text"},
		{name: "emoji", value: income_record_input.Emoji, sqlType: "text"},
		{name: "note", value: income_record_input.Note, sqlType: "text"},
	}
}

// CreateLedgerIncomeRecord records income earned by the caller. Income is shared
// within the ledger, but only its earner edits it.
func (r *Repository) CreateLedgerIncomeRecord(ctx context.Context, caller Caller, income_record_input IncomeRecordInput) (*PulledRow, error) {
	return r.runLedgerCommand(ctx, caller, func(ctx context.Context, ledger_tx *ledgerTx) (*writtenRow, error) {
		income_columns := append(income_record_input.columns(), columnValue{name: "earner_id", value: ledger_tx.user_id, sqlType: "integer"})
		income_id, err := ledger_tx.insertRow(ctx, "income_records", income_columns)
		if err != nil {
			return nil, err
		}
		return &writtenRow{collection: "income_records", id: income_id}, nil
	})
}

// lockOwnIncomeRecord locks an income record that the caller earned.
func (ledger_tx *ledgerTx) lockOwnIncomeRecord(ctx context.Context, income_id string) (*lockedRow, error) {
	income_row, err := ledger_tx.lockLiveRow(ctx, "income_records", income_id, "UPDATE")
	if err != nil {
		return nil, err
	}
	if income_row == nil {
		return nil, newCommandError(CommandNotFound, incomeRecordNotFoundMessage)
	}
	if income_row.OwnerID != ledger_tx.user_id {
		return nil, newCommandError(CommandForbidden, "他のメンバーの収入は変更できません")
	}
	return income_row, nil
}

// UpdateLedgerIncomeRecord overwrites one of the caller's income records.
func (r *Repository) UpdateLedgerIncomeRecord(ctx context.Context, caller Caller, income_id string, income_record_input IncomeRecordInput) (*PulledRow, error) {
	return r.runLedgerCommand(ctx, caller, func(ctx context.Context, ledger_tx *ledgerTx) (*writtenRow, error) {
		income_row, err := ledger_tx.lockOwnIncomeRecord(ctx, income_id)
		if err != nil {
			return nil, err
		}
		if err := ledger_tx.updateRow(ctx, "income_records", income_row.ID, income_record_input.columns()); err != nil {
			return nil, err
		}
		return &writtenRow{collection: "income_records", id: income_row.ID}, nil
	})
}

// DeleteLedgerIncomeRecord deletes one of the caller's income records.
func (r *Repository) DeleteLedgerIncomeRecord(ctx context.Context, caller Caller, income_id string) (*PulledRow, error) {
	return r.runLedgerCommand(ctx, caller, func(ctx context.Context, ledger_tx *ledgerTx) (*writtenRow, error) {
		income_row, err := ledger_tx.lockOwnIncomeRecord(ctx, income_id)
		if err != nil {
			return nil, err
		}
		if err := ledger_tx.tombstoneRow(ctx, "income_records", income_row.ID); err != nil {
			return nil, err
		}
		return &writtenRow{collection: "income_records", id: income_row.ID}, nil
	})
}

// PutLedgerBaseIncome sets the caller's base income. The ledger's base income is
// the sum over its members (design.md Q3).
func (r *Repository) PutLedgerBaseIncome(ctx context.Context, caller Caller, amount int32) (*PulledRow, error) {
	return r.runLedgerCommand(ctx, caller, func(ctx context.Context, ledger_tx *ledgerTx) (*writtenRow, error) {
		next_seq, err := ledger_tx.seq_allocator.allocateSeq(ctx)
		if err != nil {
			return nil, err
		}
		var base_income_id string
		if err := ledger_tx.tx.QueryRow(ctx,
			`INSERT INTO lf.base_incomes (id, ledger_id, owner_id, seq, member_id, amount)
			 VALUES (gen_random_uuid(), $1::uuid, $2, $3, $2, $4)
			 ON CONFLICT (ledger_id, member_id) WHERE deleted = false
			 DO UPDATE SET amount = EXCLUDED.amount, seq = EXCLUDED.seq, updated_at = NOW()
			 RETURNING id::text`,
			ledger_tx.ledger_id, ledger_tx.user_id, next_seq, amount,
		).Scan(&base_income_id); err != nil {
			return nil, fmt.Errorf("upserting base income: %w", err)
		}
		return &writtenRow{collection: "base_incomes", id: base_income_id}, nil
	})
}

// BudgetInput is the ledger's budget setting.
type BudgetInput struct {
	MonthlyBudget int32
	GoalText      *string
	GoalAmount    int32
}

// PutLedgerBudget sets the ledger's budget (one row per ledger).
func (r *Repository) PutLedgerBudget(ctx context.Context, caller Caller, budget_input BudgetInput) (*PulledRow, error) {
	return r.runLedgerCommand(ctx, caller, func(ctx context.Context, ledger_tx *ledgerTx) (*writtenRow, error) {
		next_seq, err := ledger_tx.seq_allocator.allocateSeq(ctx)
		if err != nil {
			return nil, err
		}
		var budget_id string
		if err := ledger_tx.tx.QueryRow(ctx,
			`INSERT INTO lf.budgets (id, ledger_id, owner_id, seq, monthly_budget, goal_text, goal_amount)
			 VALUES (gen_random_uuid(), $1::uuid, $2, $3, $4, $5, $6)
			 ON CONFLICT (ledger_id) WHERE deleted = false
			 DO UPDATE SET monthly_budget = EXCLUDED.monthly_budget, goal_text = EXCLUDED.goal_text,
			     goal_amount = EXCLUDED.goal_amount, seq = EXCLUDED.seq, updated_at = NOW()
			 RETURNING id::text`,
			ledger_tx.ledger_id, ledger_tx.user_id, next_seq, budget_input.MonthlyBudget, budget_input.GoalText, budget_input.GoalAmount,
		).Scan(&budget_id); err != nil {
			return nil, fmt.Errorf("upserting budget: %w", err)
		}
		return &writtenRow{collection: "budgets", id: budget_id}, nil
	})
}

// SurplusAllocationInput is a new surplus allocation.
type SurplusAllocationInput struct {
	YearMonth     string
	Amount        int32
	Destination   string
	SavingsGoalID *string
}

// remainingSurplusQuery is the month's unallocated surplus of the ledger:
// max(0, income − Σ base incomes) − already allocated, never below 0.
const remainingSurplusQuery = `
SELECT GREATEST(0,
    GREATEST(0,
        (SELECT COALESCE(SUM(amount), 0) FROM lf.income_records
         WHERE ledger_id = $1::uuid AND deleted = false
           AND transaction_date >= ($2::text || '-01')::date
           AND transaction_date < ($2::text || '-01')::date + INTERVAL '1 month')
      - (SELECT COALESCE(SUM(amount), 0) FROM lf.base_incomes WHERE ledger_id = $1::uuid AND deleted = false))
    - (SELECT COALESCE(SUM(amount), 0) FROM lf.surplus_allocations
       WHERE ledger_id = $1::uuid AND deleted = false AND year_month = $2::text)
)::bigint`

// CreateLedgerSurplusAllocation allocates part of a month's surplus. Allocations
// are append-only, and the upper bound is a hard error as today (design.md §5.2).
// An allocation to savings counts toward the goal's accumulated amount, which
// devices derive from savings postings plus these allocations.
func (r *Repository) CreateLedgerSurplusAllocation(ctx context.Context, caller Caller, surplus_input SurplusAllocationInput) (*PulledRow, error) {
	return r.runLedgerCommand(ctx, caller, func(ctx context.Context, ledger_tx *ledgerTx) (*writtenRow, error) {
		// Allocations of one ledger are serialized on the ledger row so that two
		// concurrent allocations can't both fit under the bound.
		if _, err := ledger_tx.tx.Exec(ctx, "SELECT 1 FROM lf.ledgers WHERE id = $1::uuid FOR UPDATE", ledger_tx.ledger_id); err != nil {
			return nil, fmt.Errorf("locking ledger: %w", err)
		}
		var savings_goal_id *string
		if surplus_input.SavingsGoalID != nil {
			goal_row, err := ledger_tx.lockLiveRow(ctx, "savings_goals", *surplus_input.SavingsGoalID, "SHARE")
			if err != nil {
				return nil, err
			}
			if goal_row == nil {
				return nil, newCommandError(CommandNotFound, savingsGoalNotFoundMessage)
			}
			savings_goal_id = &goal_row.ID
		}
		var remaining_surplus int64
		if err := ledger_tx.tx.QueryRow(ctx, remainingSurplusQuery, ledger_tx.ledger_id, surplus_input.YearMonth).Scan(&remaining_surplus); err != nil {
			return nil, fmt.Errorf("computing remaining surplus: %w", err)
		}
		if int64(surplus_input.Amount) > remaining_surplus {
			return nil, newCommandError(CommandInvalid, "指定金額が振り分け可能な余剰を超えています")
		}
		allocation_id, err := ledger_tx.insertRow(ctx, "surplus_allocations", []columnValue{
			{name: "year_month", value: surplus_input.YearMonth, sqlType: "text"},
			{name: "amount", value: surplus_input.Amount, sqlType: "integer"},
			{name: "destination", value: surplus_input.Destination, sqlType: "text"},
			{name: "savings_goal_id", value: savings_goal_id, sqlType: "uuid"},
		})
		if err != nil {
			return nil, err
		}
		return &writtenRow{collection: "surplus_allocations", id: allocation_id}, nil
	})
}
