package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/utibori-jp/atoikura/backend/internal/db"
)

type JournalEntryView struct {
	ID              int32     `json:"id"`
	TransactionDate string    `json:"transaction_date"`
	Item            *string   `json:"item"`
	Amount          int32     `json:"amount"`
	CategoryID      int32     `json:"category_id"`
	CategoryName    string    `json:"category_name"`
	GroupID         int32     `json:"group_id"`
	GroupName       string    `json:"group_name"`
	IsExcluded      bool      `json:"is_excluded"`
	Note            *string   `json:"note"`
	CreatedAt       time.Time `json:"created_at"`
}

type CreateJournalEntryParams struct {
	TransactionDate time.Time
	Item            *string
	Amount          int32
	CategoryID      int32
	UserID          int32
	IsExcluded      bool
	Note            *string
}

func (r *Repository) CreateJournalEntry(ctx context.Context, params CreateJournalEntryParams) (*JournalEntryView, error) {
	row, err := r.queries.CreateJournalEntry(ctx, db.CreateJournalEntryParams{
		TransactionDate: pgtype.Date{Time: params.TransactionDate, Valid: true},
		Item:            params.Item,
		Amount:          params.Amount,
		CategoryID:      params.CategoryID,
		UserID:          params.UserID,
		IsExcluded:      params.IsExcluded,
		Note:            params.Note,
	})
	if err != nil {
		return nil, fmt.Errorf("creating journal entry: %w", err)
	}

	var category_name, group_name string
	var group_id int32
	if err := r.pool.QueryRow(ctx,
		`SELECT ec.category_name, ec.group_id, cg.group_name
		 FROM expense_categories ec
		 JOIN category_groups cg ON ec.group_id = cg.id
		 WHERE ec.id = $1`,
		row.CategoryID,
	).Scan(&category_name, &group_id, &group_name); err != nil {
		return nil, fmt.Errorf("fetching category for created journal entry: %w", err)
	}

	return &JournalEntryView{
		ID:              row.ID,
		TransactionDate: row.TransactionDate.Time.Format("2006-01-02"),
		Item:            row.Item,
		Amount:          row.Amount,
		CategoryID:      row.CategoryID,
		CategoryName:    category_name,
		GroupID:         group_id,
		GroupName:       group_name,
		IsExcluded:      row.IsExcluded,
		Note:            row.Note,
		CreatedAt:       row.CreatedAt,
	}, nil
}

func (r *Repository) ListJournalEntriesByMonth(ctx context.Context, user_id int64, first_day time.Time) ([]JournalEntryView, error) {
	rows, err := r.queries.ListJournalEntriesByMonth(ctx, db.ListJournalEntriesByMonthParams{
		UserID:  int32(user_id),
		Column2: pgtype.Date{Time: first_day, Valid: true},
	})
	if err != nil {
		return nil, fmt.Errorf("listing journal entries by month: %w", err)
	}

	result := make([]JournalEntryView, len(rows))
	for i, row := range rows {
		result[i] = JournalEntryView{
			ID:              row.ID,
			TransactionDate: row.TransactionDate.Time.Format("2006-01-02"),
			Item:            row.Item,
			Amount:          row.Amount,
			CategoryID:      row.CategoryID,
			CategoryName:    row.CategoryName,
			GroupID:         row.GroupID,
			GroupName:       row.GroupName,
			IsExcluded:      row.IsExcluded,
			Note:            row.Note,
			CreatedAt:       row.CreatedAt,
		}
	}
	return result, nil
}
