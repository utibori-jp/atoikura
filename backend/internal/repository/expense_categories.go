package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/utibori-jp/atoikura/backend/internal/db"
)

type ExpenseCategoryView struct {
	ID           int32   `json:"id"`
	CategoryName string  `json:"category_name"`
	CategoryCode *string `json:"category_code"`
	GroupID      int32   `json:"group_id"`
	GroupName    string  `json:"group_name"`
	Description  *string `json:"description"`
}

func (r *Repository) ListExpenseCategoriesByUser(ctx context.Context, user_id int64) ([]ExpenseCategoryView, error) {
	rows, err := r.queries.ListExpenseCategoriesByUser(ctx, int32(user_id))
	if err != nil {
		return nil, fmt.Errorf("listing expense categories: %w", err)
	}

	result := make([]ExpenseCategoryView, len(rows))
	for i, row := range rows {
		result[i] = ExpenseCategoryView{
			ID:           row.ID,
			CategoryName: row.CategoryName,
			CategoryCode: nil,
			GroupID:      row.GroupID,
			GroupName:    row.GroupName,
			Description:  row.Description,
		}
	}
	return result, nil
}

// GetActiveExpenseCategory returns nil if the category is not found, soft-deleted, or belongs to another user.
func (r *Repository) GetActiveExpenseCategory(ctx context.Context, id int64, user_id int64) (*ExpenseCategoryView, error) {
	row, err := r.queries.GetActiveExpenseCategoryByID(ctx, db.GetActiveExpenseCategoryByIDParams{
		ID:     int32(id),
		UserID: int32(user_id),
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("getting expense category: %w", err)
	}
	return &ExpenseCategoryView{
		ID:      row.ID,
		GroupID: row.GroupID,
	}, nil
}

func (r *Repository) GetExpenseCategory(ctx context.Context, id int64, user_id int64) (*ExpenseCategoryView, error) {
	row, err := r.queries.GetExpenseCategoryByID(ctx, db.GetExpenseCategoryByIDParams{
		ID:     int32(id),
		UserID: int32(user_id),
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("getting expense category: %w", err)
	}
	return &ExpenseCategoryView{
		ID:           row.ID,
		CategoryName: row.CategoryName,
		CategoryCode: row.CategoryCode,
		GroupID:      row.GroupID,
		GroupName:    row.GroupName,
		Description:  row.Description,
	}, nil
}

func (r *Repository) CreateExpenseCategory(ctx context.Context, user_id int64, group_id int32, category_name string, description *string) (*ExpenseCategoryView, error) {
	created, err := r.queries.CreateExpenseCategory(ctx, db.CreateExpenseCategoryParams{
		UserID:       int32(user_id),
		GroupID:      group_id,
		CategoryName: category_name,
		Description:  description,
	})
	if err != nil {
		var pg_err *pgconn.PgError
		if errors.As(err, &pg_err) && pg_err.Code == "23505" {
			return nil, ErrDuplicateExpenseCategoryName
		}
		return nil, fmt.Errorf("creating expense category: %w", err)
	}
	return r.GetExpenseCategory(ctx, int64(created.ID), user_id)
}

func (r *Repository) UpdateExpenseCategory(ctx context.Context, id int64, user_id int64, group_id int32, category_name string, description *string) (*ExpenseCategoryView, error) {
	// Validate the target group belongs to this user.
	group, err := r.GetCategoryGroup(ctx, int64(group_id), user_id)
	if err != nil {
		return nil, fmt.Errorf("checking category group: %w", err)
	}
	if group == nil {
		return nil, ErrNotFound
	}

	rows_affected, err := r.queries.UpdateExpenseCategoryByID(ctx, db.UpdateExpenseCategoryByIDParams{
		ID:           int32(id),
		UserID:       int32(user_id),
		CategoryName: category_name,
		GroupID:      group_id,
		Description:  description,
	})
	if err != nil {
		var pg_err *pgconn.PgError
		if errors.As(err, &pg_err) && pg_err.Code == "23505" {
			return nil, ErrDuplicateExpenseCategoryName
		}
		return nil, fmt.Errorf("updating expense category: %w", err)
	}
	if rows_affected == 0 {
		return nil, nil
	}
	return r.GetExpenseCategory(ctx, id, user_id)
}

func (r *Repository) DeleteExpenseCategory(ctx context.Context, id int64, user_id int64) error {
	rows_affected, err := r.queries.SoftDeleteExpenseCategory(ctx, db.SoftDeleteExpenseCategoryParams{
		ID:     int32(id),
		UserID: int32(user_id),
	})
	if err != nil {
		return fmt.Errorf("deleting expense category: %w", err)
	}
	if rows_affected == 0 {
		return ErrNotFound
	}
	return nil
}
