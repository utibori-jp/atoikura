package repository

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strconv"

	"github.com/jackc/pgx/v5"

	"github.com/utibori-jp/atoikura/backend/internal/db"
)

type MonthlyReviewNote struct {
	CategoryID int32
	Note       string
}

// GetMonthlyReviewNotes returns the saved notes for user+month.
// Returns an empty slice (not an error) when no record exists.
func (r *Repository) GetMonthlyReviewNotes(
	ctx context.Context,
	user_id int64,
	year_month string,
) ([]MonthlyReviewNote, error) {
	raw, err := r.queries.GetMonthlyReview(ctx, db.GetMonthlyReviewParams{
		UserID:    int32(user_id),
		YearMonth: year_month,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return []MonthlyReviewNote{}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("getting monthly review: %w", err)
	}
	return unmarshalReviewNotes(raw), nil
}

// UpsertMonthlyReviewNotes replaces all notes for user+month.
// Empty-string notes are excluded before persisting.
// Returns the persisted notes (empty entries filtered out).
func (r *Repository) UpsertMonthlyReviewNotes(
	ctx context.Context,
	user_id int64,
	year_month string,
	notes []MonthlyReviewNote,
) ([]MonthlyReviewNote, error) {
	note_map := make(map[string]string, len(notes))
	for _, n := range notes {
		if n.Note != "" {
			note_map[strconv.Itoa(int(n.CategoryID))] = n.Note
		}
	}
	raw, err := json.Marshal(note_map)
	if err != nil {
		return nil, fmt.Errorf("marshaling review notes: %w", err)
	}
	returned_raw, err := r.queries.UpsertMonthlyReview(ctx, db.UpsertMonthlyReviewParams{
		UserID:    int32(user_id),
		YearMonth: year_month,
		Notes:     raw,
	})
	if err != nil {
		return nil, fmt.Errorf("upserting monthly review: %w", err)
	}
	return unmarshalReviewNotes(returned_raw), nil
}

// unmarshalReviewNotes converts the stored jsonb bytes to a sorted slice.
func unmarshalReviewNotes(raw []byte) []MonthlyReviewNote {
	if len(raw) == 0 {
		return []MonthlyReviewNote{}
	}
	var m map[string]string
	if err := json.Unmarshal(raw, &m); err != nil {
		return []MonthlyReviewNote{}
	}
	result := make([]MonthlyReviewNote, 0, len(m))
	for k, v := range m {
		id, err := strconv.ParseInt(k, 10, 32)
		if err != nil {
			continue
		}
		result = append(result, MonthlyReviewNote{CategoryID: int32(id), Note: v})
	}
	sort.Slice(result, func(i, j int) bool {
		return result[i].CategoryID < result[j].CategoryID
	})
	return result
}
