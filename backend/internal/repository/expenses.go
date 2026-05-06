package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/utibori-jp/atoikura/backend/internal/db"
)

type MonthlyBreakdownItem struct {
	CategoryID        int32
	CategoryName      string
	GroupID           int32
	GroupName         string
	StatementTypeID   int32
	StatementTypeName string
	Total             int32
}

// ListMonthlyBreakdown returns per-category expense totals for the target month.
// first_day must be the first calendar day of the target month.
// Expenses from logically-deleted categories are included.
// is_excluded=true entries are reclassified under the 'excluded' statement type.
func (r *Repository) ListMonthlyBreakdown(
	ctx context.Context,
	user_id int64,
	first_day time.Time,
) ([]MonthlyBreakdownItem, error) {
	rows, err := r.queries.ListMonthlyBreakdown(ctx, db.ListMonthlyBreakdownParams{
		UserID:  int32(user_id),
		Column2: pgtype.Date{Time: first_day, Valid: true},
	})
	if err != nil {
		return nil, fmt.Errorf("listing monthly breakdown: %w", err)
	}

	result := make([]MonthlyBreakdownItem, 0, len(rows))
	for _, row := range rows {
		statement_type_id, ok := row.StatementTypeID.(int32)
		if !ok {
			if id64, ok2 := row.StatementTypeID.(int64); ok2 {
				statement_type_id = int32(id64)
			}
		}
		statement_type_name, _ := row.StatementTypeName.(string)
		result = append(result, MonthlyBreakdownItem{
			CategoryID:        row.CategoryID,
			CategoryName:      row.CategoryName,
			GroupID:           row.GroupID,
			GroupName:         row.GroupName,
			StatementTypeID:   statement_type_id,
			StatementTypeName: statement_type_name,
			Total:             row.Total,
		})
	}
	return result, nil
}

type DailyExpenseSum struct {
	Date     string // "YYYY-MM-DD"
	TypeCode string // "food" | "other"
	DailySum int32
}

// ListDailyExpenseSumsForMonth returns per-day per-type_code subtotals.
// first_day must be the first day of the target month (e.g. time.Date(2025,5,1,...)).
func (r *Repository) ListDailyExpenseSumsForMonth(
	ctx context.Context,
	user_id int64,
	first_day time.Time,
) ([]DailyExpenseSum, error) {
	rows, err := r.queries.ListDailyExpenseSumsForMonth(ctx, db.ListDailyExpenseSumsForMonthParams{
		UserID:  int32(user_id),
		Column2: pgtype.Date{Time: first_day, Valid: true},
	})
	if err != nil {
		return nil, fmt.Errorf("listing daily expense sums: %w", err)
	}

	result := make([]DailyExpenseSum, len(rows))
	for i, row := range rows {
		result[i] = DailyExpenseSum{
			Date:     row.Date,
			TypeCode: row.TypeCode,
			DailySum: row.DailySum,
		}
	}
	return result, nil
}
