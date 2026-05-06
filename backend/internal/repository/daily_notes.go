package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/utibori-jp/atoikura/backend/internal/db"
)

type DailyNote struct {
	Date string
	Note *string
}

// GetDailyNotesByMonth returns all daily notes for the given month.
// Returns an empty slice when no notes exist.
func (r *Repository) GetDailyNotesByMonth(ctx context.Context, user_id int64, year_month string) ([]DailyNote, error) {
	first_day, err := time.Parse("2006-01-02", year_month+"-01")
	if err != nil {
		return nil, fmt.Errorf("parsing year_month: %w", err)
	}

	rows, err := r.queries.GetDailyNotesByMonth(ctx, db.GetDailyNotesByMonthParams{
		UserID:  int32(user_id),
		Column2: pgtype.Date{Time: first_day, Valid: true},
	})
	if err != nil {
		return nil, fmt.Errorf("getting daily notes by month: %w", err)
	}

	result := make([]DailyNote, len(rows))
	for i, row := range rows {
		note := row.Note
		result[i] = DailyNote{
			Date: row.Date.Time.Format("2006-01-02"),
			Note: &note,
		}
	}
	return result, nil
}

// UpsertDailyNote saves a note for the given date.
// When note_text is empty, the record is physically deleted and Note is returned as nil.
func (r *Repository) UpsertDailyNote(ctx context.Context, user_id int64, date string, note_text string) (*DailyNote, error) {
	parsed_date, err := time.Parse("2006-01-02", date)
	if err != nil {
		return nil, fmt.Errorf("parsing date: %w", err)
	}
	pg_date := pgtype.Date{Time: parsed_date, Valid: true}

	if note_text == "" {
		if _, err := r.pool.Exec(ctx,
			"DELETE FROM daily_notes WHERE user_id = $1 AND date = $2",
			int32(user_id), pg_date,
		); err != nil {
			return nil, fmt.Errorf("deleting daily note: %w", err)
		}
		return &DailyNote{Date: date, Note: nil}, nil
	}

	row, err := r.queries.UpsertDailyNote(ctx, db.UpsertDailyNoteParams{
		UserID: int32(user_id),
		Date:   pg_date,
		Note:   note_text,
	})
	if err != nil {
		return nil, fmt.Errorf("upserting daily note: %w", err)
	}

	note := row.Note
	return &DailyNote{Date: row.Date.Time.Format("2006-01-02"), Note: &note}, nil
}
