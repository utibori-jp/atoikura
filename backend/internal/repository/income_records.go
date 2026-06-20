package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/utibori-jp/atoikura/backend/internal/db"
)

type IncomeRecordResult struct {
	ID              int32
	TransactionDate string
	Amount          int32
	Name            string
	IncomeType      string
	Emoji           string
	Note            string
}

func (r *Repository) ListIncomeRecords(ctx context.Context, user_id int64, year_month string) ([]IncomeRecordResult, error) {
	rows, err := r.queries.ListIncomeRecords(ctx, db.ListIncomeRecordsParams{
		UserID:  int32(user_id),
		Column2: year_month,
	})
	if err != nil {
		return nil, fmt.Errorf("listing income records: %w", err)
	}
	result := make([]IncomeRecordResult, len(rows))
	for i, row := range rows {
		result[i] = IncomeRecordResult{
			ID:              row.ID,
			TransactionDate: row.TransactionDate.Time.Format("2006-01-02"),
			Amount:          row.Amount,
			Name:            row.Name,
			IncomeType:      row.IncomeType,
			Emoji:           row.Emoji,
			Note:            row.Note,
		}
	}
	return result, nil
}

type CreateIncomeRecordParams struct {
	TransactionDate time.Time
	Amount          int32
	Name            string
	IncomeType      string
	Emoji           string
	Note            string
}

func (r *Repository) CreateIncomeRecord(ctx context.Context, user_id int64, params CreateIncomeRecordParams) (*IncomeRecordResult, error) {
	row, err := r.queries.CreateIncomeRecord(ctx, db.CreateIncomeRecordParams{
		UserID:          int32(user_id),
		TransactionDate: pgtype.Date{Time: params.TransactionDate, Valid: true},
		Amount:          params.Amount,
		Name:            params.Name,
		IncomeType:      params.IncomeType,
		Emoji:           params.Emoji,
		Note:            params.Note,
	})
	if err != nil {
		return nil, fmt.Errorf("creating income record: %w", err)
	}
	return &IncomeRecordResult{
		ID:              row.ID,
		TransactionDate: row.TransactionDate.Time.Format("2006-01-02"),
		Amount:          row.Amount,
		Name:            row.Name,
		IncomeType:      row.IncomeType,
		Emoji:           row.Emoji,
		Note:            row.Note,
	}, nil
}

type UpdateIncomeRecordParams struct {
	ID              int32
	TransactionDate time.Time
	Amount          int32
	Name            string
	IncomeType      string
	Emoji           string
	Note            string
}

// UpdateIncomeRecord updates an income record. Returns nil, nil if not found.
func (r *Repository) UpdateIncomeRecord(ctx context.Context, user_id int64, params UpdateIncomeRecordParams) (*IncomeRecordResult, error) {
	row, err := r.queries.UpdateIncomeRecord(ctx, db.UpdateIncomeRecordParams{
		ID:              params.ID,
		UserID:          int32(user_id),
		TransactionDate: pgtype.Date{Time: params.TransactionDate, Valid: true},
		Amount:          params.Amount,
		Name:            params.Name,
		IncomeType:      params.IncomeType,
		Emoji:           params.Emoji,
		Note:            params.Note,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("updating income record: %w", err)
	}
	return &IncomeRecordResult{
		ID:              row.ID,
		TransactionDate: row.TransactionDate.Time.Format("2006-01-02"),
		Amount:          row.Amount,
		Name:            row.Name,
		IncomeType:      row.IncomeType,
		Emoji:           row.Emoji,
		Note:            row.Note,
	}, nil
}

// DeleteIncomeRecord deletes an income record. Returns false if not found.
func (r *Repository) DeleteIncomeRecord(ctx context.Context, id int64, user_id int64) (bool, error) {
	tag, err := r.pool.Exec(ctx,
		"DELETE FROM income_records WHERE id = $1 AND user_id = $2",
		id, user_id,
	)
	if err != nil {
		return false, fmt.Errorf("deleting income record: %w", err)
	}
	return tag.RowsAffected() > 0, nil
}

// GetBaseIncome returns the base income setting. Returns 0 if not set.
func (r *Repository) GetBaseIncome(ctx context.Context, user_id int64) (int32, error) {
	amount, err := r.queries.GetBaseIncome(ctx, int32(user_id))
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, nil
	}
	if err != nil {
		return 0, fmt.Errorf("getting base income: %w", err)
	}
	return amount, nil
}

func (r *Repository) UpsertBaseIncome(ctx context.Context, user_id int64, amount int32) (int32, error) {
	result, err := r.queries.UpsertBaseIncome(ctx, db.UpsertBaseIncomeParams{
		UserID: int32(user_id),
		Amount: amount,
	})
	if err != nil {
		return 0, fmt.Errorf("upserting base income: %w", err)
	}
	return result, nil
}

// GetIncomeTotal returns the total income for the given user and year_month (YYYY-MM).
func (r *Repository) GetIncomeTotal(ctx context.Context, user_id int64, year_month string) (int32, error) {
	total, err := r.queries.SumIncomeByMonth(ctx, db.SumIncomeByMonthParams{
		UserID:  int32(user_id),
		Column2: year_month,
	})
	if err != nil {
		return 0, fmt.Errorf("summing income by month: %w", err)
	}
	return total, nil
}
