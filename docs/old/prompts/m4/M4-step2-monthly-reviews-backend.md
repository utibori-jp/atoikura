# M4 Step 2: Monthly Reviews Backend

## Goal

Implement `GET /notes/monthly-reviews` and `PUT /notes/monthly-reviews`.
These endpoints manage per-category memos for a given month. Notes are stored as
a jsonb object in `monthly_reviews.notes` (`{"<category_id>": "<text>", ...}`)
and exposed as an array in the API.

## Branch

`feature/m4` — same branch as Step 1. Do not create a new branch.

## Prerequisites

- Step 1 merged into `feature/m4` (`GET /expenses/monthly-breakdown` works)
- `make sqlc-gen` and `make run` work

## Reference

Contracts: `docs/atoikura-api.yaml` under `/notes/monthly-reviews`.
Schemas: `MonthlyReviewResponse`, `MonthlyReviewNote`.
Spec §4-1 (monthly_reviews jsonb storage decision), §4-2 (PUT full-replace,
empty-string exclusion).

Field names to match exactly: `year_month`, `notes`, `category_id`, `note`.

## Tasks

### 1. Add sqlc queries

Create `backend/queries/monthly_reviews.sql`:

```sql
-- name: GetMonthlyReview :one
SELECT notes FROM monthly_reviews
WHERE user_id = $1 AND year_month = $2;

-- name: UpsertMonthlyReview :one
INSERT INTO monthly_reviews (user_id, year_month, notes)
VALUES ($1, $2, $3)
ON CONFLICT (user_id, year_month) DO UPDATE
  SET notes      = EXCLUDED.notes,
      updated_at = NOW()
RETURNING notes;
```

Run `make sqlc-gen` and confirm `go build ./...` passes before moving on.

### 2. Add repository

Create `backend/internal/repository/monthly_reviews.go`:

```go
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
    row, err := r.queries.GetMonthlyReview(ctx, db.GetMonthlyReviewParams{
        UserID:    int32(user_id),
        YearMonth: year_month,
    })
    if errors.Is(err, pgx.ErrNoRows) {
        return []MonthlyReviewNote{}, nil
    }
    if err != nil {
        return nil, fmt.Errorf("getting monthly review: %w", err)
    }
    return unmarshalReviewNotes(row.Notes), nil
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
    row, err := r.queries.UpsertMonthlyReview(ctx, db.UpsertMonthlyReviewParams{
        UserID:    int32(user_id),
        YearMonth: year_month,
        Notes:     raw,
    })
    if err != nil {
        return nil, fmt.Errorf("upserting monthly review: %w", err)
    }
    return unmarshalReviewNotes(row.Notes), nil
}

// unmarshalReviewNotes converts the stored jsonb to a sorted slice.
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
```

**sqlc jsonb type note**: sqlc may generate the `notes` column as `[]byte` or
`pgtype.JSONB`. Check the generated `db/` types after `make sqlc-gen` and adjust
the `UpsertMonthlyReviewParams.Notes` assignment accordingly:
- If `[]byte`: assign `raw` directly.
- If `pgtype.JSONB`: assign `pgtype.JSONB{Bytes: raw, Valid: true}`.

### 3. Add handler

Create `backend/internal/handler/notes.go`.

Use `WriteJSON`, `WriteError`, and `UserIDFromContext` from the existing helpers.
Reuse `yearMonthPattern` from `handler/time.go`.

```go
type monthlyReviewNoteJSON struct {
    CategoryID int32  `json:"category_id"`
    Note       string `json:"note"`
}

type monthlyReviewResponseJSON struct {
    YearMonth string                   `json:"year_month"`
    Notes     []monthlyReviewNoteJSON  `json:"notes"`
}
```

**GetMonthlyReviewsHandler** (`GET /notes/monthly-reviews`):

1. Extract `user_id`; return `401` if missing.
2. Read required query param `year_month`; return `400 BAD_REQUEST` if absent or
   not matching `^\d{4}-\d{2}$`.
3. Call `repo.GetMonthlyReviewNotes(ctx, user_id, year_month)`.
4. Map to `[]monthlyReviewNoteJSON` (empty slice, not null, if no rows).
5. Return `200` with `monthlyReviewResponseJSON`.

**UpdateMonthlyReviewsHandler** (`PUT /notes/monthly-reviews`):

Request body:
```go
type monthlyReviewRequestJSON struct {
    YearMonth string                  `json:"year_month"`
    Notes     []monthlyReviewNoteJSON `json:"notes"`
}
```

1. Extract `user_id`; return `401` if missing.
2. Decode request body; return `400 BAD_REQUEST` on parse failure.
3. Validate `year_month` matches `^\d{4}-\d{2}$`; return `400` if not.
4. Convert `[]monthlyReviewNoteJSON` to `[]repository.MonthlyReviewNote`.
5. Call `repo.UpsertMonthlyReviewNotes`. The repository filters empty strings.
6. Map returned notes to `[]monthlyReviewNoteJSON`.
7. Return `200` with `monthlyReviewResponseJSON`.

### 4. Register routes

In `backend/cmd/server/main.go` `registerRoutes`:

```go
mux.Handle("GET /notes/monthly-reviews", handler.GetMonthlyReviewsHandler(repo))
mux.Handle("PUT /notes/monthly-reviews", handler.UpdateMonthlyReviewsHandler(repo))
```

## Verification Checklist

Start the stack:
```bash
docker compose up -d db
cd backend && make migrate-up && make run
```

- [ ] `GET /notes/monthly-reviews?year_month=2025-04` returns `200` with
  `{"year_month":"2025-04","notes":[]}` when no record exists
- [ ] `PUT /notes/monthly-reviews` with non-empty notes persists and returns them
- [ ] Subsequent `GET` for the same month returns the saved notes
- [ ] `PUT` with a mix of non-empty and empty-string notes: empty-string entries
  are excluded from the persisted result
- [ ] `PUT` with `notes: []` returns `{"notes":[]}` and clears all existing memos
- [ ] `PUT` again with new notes replaces (not appends to) the previous save
- [ ] `year_month` absent or invalid format → `400 BAD_REQUEST`
- [ ] `go build ./...` passes
- [ ] `gofmt` and `golangci-lint` pass

```bash
# Empty month
curl -s "http://localhost:8080/notes/monthly-reviews?year_month=2025-04" | jq

# Save notes
curl -s -X PUT http://localhost:8080/notes/monthly-reviews \
  -H "Content-Type: application/json" \
  -d '{
    "year_month": "2025-04",
    "notes": [
      {"category_id": 1, "note": "スーパーで買いすぎた"},
      {"category_id": 3, "note": "外食少なめ"},
      {"category_id": 5, "note": ""}
    ]
  }' | jq
# Expect: notes array with category_id 1 and 3 only (5 is empty-string, excluded)

# Confirm GET returns same
curl -s "http://localhost:8080/notes/monthly-reviews?year_month=2025-04" | jq

# Full replace — send only category_id 2
curl -s -X PUT http://localhost:8080/notes/monthly-reviews \
  -H "Content-Type: application/json" \
  -d '{"year_month":"2025-04","notes":[{"category_id":2,"note":"replaced"}]}' | jq
# Expect: only category_id 2 remains

# Clear all notes
curl -s -X PUT http://localhost:8080/notes/monthly-reviews \
  -H "Content-Type: application/json" \
  -d '{"year_month":"2025-04","notes":[]}' | jq
# Expect: {"year_month":"2025-04","notes":[]}

# Missing year_month (expect 400)
curl -i -X PUT http://localhost:8080/notes/monthly-reviews \
  -H "Content-Type: application/json" \
  -d '{"notes":[]}'
```

## Commit Plan

1. `feat(backend/queries): add monthly reviews sqlc queries`
2. `chore(backend): regenerate sqlc`
3. `feat(backend/repository): add monthly reviews get and upsert methods`
4. `feat(backend/handler): add GET and PUT /notes/monthly-reviews`
5. `feat(backend): register monthly reviews routes`

## After Completion

Push `feature/m4` to origin. Confirm every checklist item passes before Step 3.

## Out of Scope

- Review screen frontend (Step 3)
- `GET /notes/daily` and `PUT /notes/daily/{date}` (M5)
