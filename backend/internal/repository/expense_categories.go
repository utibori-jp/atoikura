package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

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
