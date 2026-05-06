package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/utibori-jp/atoikura/backend/internal/db"
)

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
