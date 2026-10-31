package repository

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/utibori-jp/atoikura/backend/internal/syncrules"
)

// Recurring expense and savings commands.

const recurringExpenseNotFoundMessage = "定期支出が見つかりません"

// RecurringExpenseInput is the editable content of a recurring expense.
type RecurringExpenseInput struct {
	Name       string
	Emoji      string
	BillingDay int16
	Amount     *int32
	Type       string
	CategoryID string
}

func (recurring_input RecurringExpenseInput) columns() []columnValue {
	return []columnValue{
		{name: "name", value: recurring_input.Name, sqlType: "text"},
		{name: "emoji", value: recurring_input.Emoji, sqlType: "text"},
		{name: "billing_day", value: recurring_input.BillingDay, sqlType: "smallint"},
		{name: "amount", value: recurring_input.Amount, sqlType: "integer"},
		{name: "type", value: recurring_input.Type, sqlType: "text"},
		{name: "category_id", value: recurring_input.CategoryID, sqlType: "uuid"},
	}
}

// lockVisibleRecurring locks a recurring expense of the target ledger. Any member
// of the ledger may write it (a personal ledger has only its owner).
func (ledger_tx *ledgerTx) lockVisibleRecurring(ctx context.Context, recurring_id string) (*lockedRow, error) {
	recurring_row, err := ledger_tx.lockLiveRow(ctx, "recurring_expenses", recurring_id, "UPDATE")
	if err != nil {
		return nil, err
	}
	if recurring_row == nil {
		return nil, newCommandError(CommandNotFound, recurringExpenseNotFoundMessage)
	}
	return recurring_row, nil
}

// CreateLedgerRecurringExpense adds a recurring expense. Personal fixed costs are
// recurring expenses of the personal ledger (design.md D8).
func (r *Repository) CreateLedgerRecurringExpense(ctx context.Context, caller Caller, recurring_input RecurringExpenseInput) (*PulledRow, error) {
	return r.runLedgerCommand(ctx, caller, func(ctx context.Context, ledger_tx *ledgerTx) (*writtenRow, error) {
		if err := ledger_tx.requireLiveCategory(ctx, recurring_input.CategoryID); err != nil {
			return nil, err
		}
		recurring_id, err := ledger_tx.insertRow(ctx, "recurring_expenses", recurring_input.columns())
		if err != nil {
			return nil, err
		}
		return &writtenRow{collection: "recurring_expenses", id: recurring_id}, nil
	})
}

// UpdateLedgerRecurringExpense overwrites a recurring expense.
func (r *Repository) UpdateLedgerRecurringExpense(ctx context.Context, caller Caller, recurring_id string, recurring_input RecurringExpenseInput) (*PulledRow, error) {
	return r.runLedgerCommand(ctx, caller, func(ctx context.Context, ledger_tx *ledgerTx) (*writtenRow, error) {
		recurring_row, err := ledger_tx.lockVisibleRecurring(ctx, recurring_id)
		if err != nil {
			return nil, err
		}
		// Keeping a category that was deleted meanwhile is fine; choosing one is not.
		if recurring_input.CategoryID != recurring_row.text("category_id") {
			if err := ledger_tx.requireLiveCategory(ctx, recurring_input.CategoryID); err != nil {
				return nil, err
			}
		}
		if err := ledger_tx.updateRow(ctx, "recurring_expenses", recurring_row.ID, recurring_input.columns()); err != nil {
			return nil, err
		}
		return &writtenRow{collection: "recurring_expenses", id: recurring_row.ID}, nil
	})
}

// DeleteLedgerRecurringExpense deletes a recurring expense. Entries it already
// posted stay.
func (r *Repository) DeleteLedgerRecurringExpense(ctx context.Context, caller Caller, recurring_id string) (*PulledRow, error) {
	return r.runLedgerCommand(ctx, caller, func(ctx context.Context, ledger_tx *ledgerTx) (*writtenRow, error) {
		recurring_row, err := ledger_tx.lockVisibleRecurring(ctx, recurring_id)
		if err != nil {
			return nil, err
		}
		if err := ledger_tx.tombstoneRow(ctx, "recurring_expenses", recurring_row.ID); err != nil {
			return nil, err
		}
		return &writtenRow{collection: "recurring_expenses", id: recurring_row.ID}, nil
	})
}

// ConfirmLedgerRecurringExpense posts a recurring expense's amount for a month,
// typically a variable one (design.md §5.3). It creates a journal entry on the
// billing day and returns it; a month can be posted only once.
func (r *Repository) ConfirmLedgerRecurringExpense(ctx context.Context, caller Caller, recurring_id string, amount int32, year_month string) (*PulledRow, error) {
	return r.runLedgerCommand(ctx, caller, func(ctx context.Context, ledger_tx *ledgerTx) (*writtenRow, error) {
		recurring_row, err := ledger_tx.lockVisibleRecurring(ctx, recurring_id)
		if err != nil {
			return nil, err
		}
		var billing_day int16
		_ = json.Unmarshal(recurring_row.Columns["billing_day"], &billing_day)
		transaction_date, err := billingDateForMonth(year_month, billing_day)
		if err != nil {
			return nil, newCommandError(CommandInvalid, "year_monthはYYYY-MM形式で指定してください")
		}

		server_hlc := syncrules.ServerHLC(time.Now())
		posted_field_hlc := map[string]string{}
		for _, field_name := range serverPostedEntryFields {
			posted_field_hlc[field_name] = server_hlc
		}
		encoded_field_hlc, err := json.Marshal(posted_field_hlc)
		if err != nil {
			return nil, fmt.Errorf("encoding posting field_hlc: %w", err)
		}
		entry_id, err := ledger_tx.insertRow(ctx, "journal_entries", []columnValue{
			{name: "field_hlc", value: string(encoded_field_hlc), sqlType: "jsonb"},
			{name: "transaction_date", value: transaction_date.Format("2006-01-02"), sqlType: "date"},
			{name: "item", value: recurring_row.text("name"), sqlType: "text"},
			{name: "amount", value: amount, sqlType: "integer"},
			{name: "is_excluded", value: false, sqlType: "boolean"},
			{name: "category_id", value: recurring_row.text("category_id"), sqlType: "uuid"},
			{name: "recurring_expense_id", value: recurring_row.ID, sqlType: "uuid"},
			{name: "recurring_year_month", value: year_month, sqlType: "text"},
		})
		if err != nil {
			return nil, conflictOnUniqueViolation(err, "当月分は既に確定済みです")
		}
		return &writtenRow{collection: "journal_entries", id: entry_id}, nil
	})
}

// SavingsGoalInput is the editable content of a savings goal.
type SavingsGoalInput struct {
	Name          string
	Emoji         string
	MonthlyAmount int32
	TargetAmount  int32
	Deadline      *string
	Memo          string
}

func (savings_goal_input SavingsGoalInput) columns() []columnValue {
	return []columnValue{
		{name: "name", value: savings_goal_input.Name, sqlType: "text"},
		{name: "emoji", value: savings_goal_input.Emoji, sqlType: "text"},
		{name: "monthly_amount", value: savings_goal_input.MonthlyAmount, sqlType: "integer"},
		{name: "target_amount", value: savings_goal_input.TargetAmount, sqlType: "integer"},
		{name: "deadline", value: savings_goal_input.Deadline, sqlType: "text"},
		{name: "memo", value: savings_goal_input.Memo, sqlType: "text"},
	}
}

func (ledger_tx *ledgerTx) lockLiveSavingsGoal(ctx context.Context, goal_id string, row_lock string) (*lockedRow, error) {
	goal_row, err := ledger_tx.lockLiveRow(ctx, "savings_goals", goal_id, row_lock)
	if err != nil {
		return nil, err
	}
	if goal_row == nil {
		return nil, newCommandError(CommandNotFound, savingsGoalNotFoundMessage)
	}
	return goal_row, nil
}

// CreateLedgerSavingsGoal adds a savings goal to the caller's ledger.
func (r *Repository) CreateLedgerSavingsGoal(ctx context.Context, caller Caller, savings_goal_input SavingsGoalInput) (*PulledRow, error) {
	return r.runLedgerCommand(ctx, caller, func(ctx context.Context, ledger_tx *ledgerTx) (*writtenRow, error) {
		goal_id, err := ledger_tx.insertRow(ctx, "savings_goals", savings_goal_input.columns())
		if err != nil {
			return nil, err
		}
		return &writtenRow{collection: "savings_goals", id: goal_id}, nil
	})
}

// UpdateLedgerSavingsGoal overwrites a savings goal.
func (r *Repository) UpdateLedgerSavingsGoal(ctx context.Context, caller Caller, goal_id string, savings_goal_input SavingsGoalInput) (*PulledRow, error) {
	return r.runLedgerCommand(ctx, caller, func(ctx context.Context, ledger_tx *ledgerTx) (*writtenRow, error) {
		goal_row, err := ledger_tx.lockLiveSavingsGoal(ctx, goal_id, "UPDATE")
		if err != nil {
			return nil, err
		}
		if err := ledger_tx.updateRow(ctx, "savings_goals", goal_row.ID, savings_goal_input.columns()); err != nil {
			return nil, err
		}
		return &writtenRow{collection: "savings_goals", id: goal_row.ID}, nil
	})
}

// DeleteLedgerSavingsGoal deletes a savings goal. Its postings stay as history.
func (r *Repository) DeleteLedgerSavingsGoal(ctx context.Context, caller Caller, goal_id string) (*PulledRow, error) {
	return r.runLedgerCommand(ctx, caller, func(ctx context.Context, ledger_tx *ledgerTx) (*writtenRow, error) {
		goal_row, err := ledger_tx.lockLiveSavingsGoal(ctx, goal_id, "UPDATE")
		if err != nil {
			return nil, err
		}
		if err := ledger_tx.tombstoneRow(ctx, "savings_goals", goal_row.ID); err != nil {
			return nil, err
		}
		return &writtenRow{collection: "savings_goals", id: goal_row.ID}, nil
	})
}

// CreateLedgerSavingsPosting records a manual savings posting for a month, like
// the legacy "post this month" action. The month then gets no automatic posting.
func (r *Repository) CreateLedgerSavingsPosting(ctx context.Context, caller Caller, goal_id string, amount int32, year_month string) (*PulledRow, error) {
	return r.runLedgerCommand(ctx, caller, func(ctx context.Context, ledger_tx *ledgerTx) (*writtenRow, error) {
		goal_row, err := ledger_tx.lockLiveSavingsGoal(ctx, goal_id, "SHARE")
		if err != nil {
			return nil, err
		}
		posting_id, err := ledger_tx.insertRow(ctx, "savings_postings", []columnValue{
			{name: "goal_id", value: goal_row.ID, sqlType: "uuid"},
			{name: "year_month", value: year_month, sqlType: "text"},
			{name: "amount", value: amount, sqlType: "integer"},
			{name: "kind", value: "manual", sqlType: "text"},
		})
		if err != nil {
			return nil, err
		}
		return &writtenRow{collection: "savings_postings", id: posting_id}, nil
	})
}
