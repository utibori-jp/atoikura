package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/utibori-jp/atoikura/backend/internal/db"
)

type RecurringExpenseResult struct {
	ID           int32
	Name         string
	Emoji        string
	BillingDay   int16
	Amount       *int32
	Type         string
	CategoryID   int32
	GroupID      int32
	GroupName    string
	CategoryName string
}

type PendingRecurringResult struct {
	ID         int32
	Name       string
	Emoji      string
	BillingDay int16
	LastAmount int32
	GroupName  string
}

func (r *Repository) ListRecurringExpenses(ctx context.Context, user_id int64) ([]RecurringExpenseResult, error) {
	rows, err := r.queries.ListRecurringExpenses(ctx, int32(user_id))
	if err != nil {
		return nil, fmt.Errorf("listing recurring expenses: %w", err)
	}
	result := make([]RecurringExpenseResult, len(rows))
	for i, row := range rows {
		result[i] = RecurringExpenseResult{
			ID:           row.ID,
			Name:         row.Name,
			Emoji:        row.Emoji,
			BillingDay:   row.BillingDay,
			Amount:       row.Amount,
			Type:         row.Type,
			CategoryID:   row.CategoryID,
			GroupID:      row.GroupID,
			GroupName:    row.GroupName,
			CategoryName: row.CategoryName,
		}
	}
	return result, nil
}

func (r *Repository) ListPendingRecurring(ctx context.Context, user_id int64, year_month string) ([]PendingRecurringResult, error) {
	rows, err := r.queries.ListPendingRecurring(ctx, db.ListPendingRecurringParams{
		UserID:  int32(user_id),
		Column2: year_month,
	})
	if err != nil {
		return nil, fmt.Errorf("listing pending recurring: %w", err)
	}
	result := make([]PendingRecurringResult, len(rows))
	for i, row := range rows {
		var last_amount int32
		if row.Amount != nil {
			last_amount = *row.Amount
		}
		result[i] = PendingRecurringResult{
			ID:         row.ID,
			Name:       row.Name,
			Emoji:      row.Emoji,
			BillingDay: row.BillingDay,
			LastAmount: last_amount,
			GroupName:  row.GroupName,
		}
	}
	return result, nil
}

type CreateRecurringExpenseParams struct {
	Name       string
	Emoji      string
	BillingDay int16
	Amount     *int32
	Type       string
	CategoryID int32
}

func (r *Repository) CreateRecurringExpense(ctx context.Context, user_id int64, params CreateRecurringExpenseParams) (*RecurringExpenseResult, error) {
	row, err := r.queries.CreateRecurringExpense(ctx, db.CreateRecurringExpenseParams{
		UserID:     int32(user_id),
		Name:       params.Name,
		Emoji:      params.Emoji,
		BillingDay: params.BillingDay,
		Amount:     params.Amount,
		Type:       params.Type,
		CategoryID: params.CategoryID,
	})
	if err != nil {
		return nil, fmt.Errorf("creating recurring expense: %w", err)
	}

	// Fetch group info via join since CREATE doesn't return it
	var group_id int32
	var group_name, category_name string
	if err := r.pool.QueryRow(ctx,
		`SELECT ec.group_id, cg.group_name, ec.category_name
		 FROM expense_categories ec
		 JOIN category_groups cg ON ec.group_id = cg.id
		 WHERE ec.id = $1`,
		row.CategoryID,
	).Scan(&group_id, &group_name, &category_name); err != nil {
		return nil, fmt.Errorf("fetching category info for recurring expense: %w", err)
	}

	return &RecurringExpenseResult{
		ID:           row.ID,
		Name:         row.Name,
		Emoji:        row.Emoji,
		BillingDay:   row.BillingDay,
		Amount:       row.Amount,
		Type:         row.Type,
		CategoryID:   row.CategoryID,
		GroupID:      group_id,
		GroupName:    group_name,
		CategoryName: category_name,
	}, nil
}

type UpdateRecurringExpenseParams struct {
	ID         int32
	Name       string
	Emoji      string
	BillingDay int16
	Amount     *int32
	Type       string
	CategoryID int32
}

// UpdateRecurringExpense updates a recurring expense. Returns nil, nil if not found.
func (r *Repository) UpdateRecurringExpense(ctx context.Context, user_id int64, params UpdateRecurringExpenseParams) (*RecurringExpenseResult, error) {
	row, err := r.queries.UpdateRecurringExpense(ctx, db.UpdateRecurringExpenseParams{
		ID:         params.ID,
		UserID:     int32(user_id),
		Name:       params.Name,
		Emoji:      params.Emoji,
		BillingDay: params.BillingDay,
		Amount:     params.Amount,
		Type:       params.Type,
		CategoryID: params.CategoryID,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("updating recurring expense: %w", err)
	}

	var group_id int32
	var group_name, category_name string
	if err := r.pool.QueryRow(ctx,
		`SELECT ec.group_id, cg.group_name, ec.category_name
		 FROM expense_categories ec
		 JOIN category_groups cg ON ec.group_id = cg.id
		 WHERE ec.id = $1`,
		row.CategoryID,
	).Scan(&group_id, &group_name, &category_name); err != nil {
		return nil, fmt.Errorf("fetching category info for updated recurring expense: %w", err)
	}

	return &RecurringExpenseResult{
		ID:           row.ID,
		Name:         row.Name,
		Emoji:        row.Emoji,
		BillingDay:   row.BillingDay,
		Amount:       row.Amount,
		Type:         row.Type,
		CategoryID:   row.CategoryID,
		GroupID:      group_id,
		GroupName:    group_name,
		CategoryName: category_name,
	}, nil
}

// ErrRecurringAlreadyConfirmed is returned when a recurring expense already has a
// linked journal entry for the requested month.
var ErrRecurringAlreadyConfirmed = errors.New("recurring expense already confirmed for month")

// ConfirmRecurringExpense records the confirmed amount for a recurring expense in the
// given month by creating a journal entry linked via recurring_expense_id. The journal
// entry's transaction date is the recurring expense's billing day within year_month
// (clamped to the last day of the month). It does not alter the recurring expense itself,
// preserving the monthly confirmation flow.
//
// Returns nil, nil if the recurring expense does not exist for the user, and
// ErrRecurringAlreadyConfirmed if a linked entry already exists for the month.
func (r *Repository) ConfirmRecurringExpense(ctx context.Context, recurring_expense_id int64, user_id int64, amount int32, year_month string) (*JournalEntryView, error) {
	recurring, err := r.queries.GetRecurringExpenseByID(ctx, db.GetRecurringExpenseByIDParams{
		ID:     int32(recurring_expense_id),
		UserID: int32(user_id),
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("getting recurring expense for confirm: %w", err)
	}

	recurring_id := recurring.ID
	already_confirmed, err := r.queries.ExistsRecurringJournalEntryForMonth(ctx, db.ExistsRecurringJournalEntryForMonthParams{
		RecurringExpenseID: &recurring_id,
		UserID:             int32(user_id),
		Column3:            year_month,
	})
	if err != nil {
		return nil, fmt.Errorf("checking existing recurring confirmation: %w", err)
	}
	if already_confirmed {
		return nil, ErrRecurringAlreadyConfirmed
	}

	transaction_date, err := billingDateForMonth(year_month, recurring.BillingDay)
	if err != nil {
		return nil, fmt.Errorf("resolving billing date: %w", err)
	}

	item := recurring.Name
	return r.CreateJournalEntry(ctx, CreateJournalEntryParams{
		TransactionDate:    transaction_date,
		Item:               &item,
		Amount:             amount,
		CategoryID:         recurring.CategoryID,
		UserID:             int32(user_id),
		IsExcluded:         false,
		RecurringExpenseID: &recurring_id,
	})
}

// billingDateForMonth maps a billing day (1-31) onto year_month (YYYY-MM),
// clamping to the last day of the month when the billing day exceeds it
// (e.g. day 31 in a 30-day month becomes the 30th).
func billingDateForMonth(year_month string, billing_day int16) (time.Time, error) {
	first_of_month, err := time.Parse("2006-01-02", year_month+"-01")
	if err != nil {
		return time.Time{}, fmt.Errorf("parsing year_month %q: %w", year_month, err)
	}
	last_of_month := first_of_month.AddDate(0, 1, -1).Day()
	day := int(billing_day)
	if day > last_of_month {
		day = last_of_month
	}
	return time.Date(first_of_month.Year(), first_of_month.Month(), day, 0, 0, 0, 0, time.UTC), nil
}

// DeleteRecurringExpense deletes a recurring expense. Returns false if not found.
func (r *Repository) DeleteRecurringExpense(ctx context.Context, id int64, user_id int64) (bool, error) {
	tag, err := r.pool.Exec(ctx,
		"DELETE FROM recurring_expenses WHERE id = $1 AND user_id = $2",
		id, user_id,
	)
	if err != nil {
		return false, fmt.Errorf("deleting recurring expense: %w", err)
	}
	return tag.RowsAffected() > 0, nil
}
