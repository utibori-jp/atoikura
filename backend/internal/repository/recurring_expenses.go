package repository

import (
	"context"
	"errors"
	"fmt"

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
