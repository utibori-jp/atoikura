# M4 Step 1: Monthly Breakdown Backend

## Goal

Implement `GET /expenses/monthly-breakdown`. This is the aggregation endpoint
that powers the review screen: it returns each expense category's total for a
given month, with `is_excluded = true` entries reclassified under `type_code =
'excluded'` (対象外) in the SQL layer.

## Branch

Cut `feature/m4` from `develop` if it doesn't exist yet:

```bash
git checkout develop && git pull
git checkout -b feature/m4
```

All M4 work goes on this branch. **Do not open a PR until Step 3 is done.**

## Prerequisites

- M3 is merged to `develop`
- `make sqlc-gen` and `make run` work in `backend/`

## Reference

Contract: `docs/atoikura-api.yaml` under `/expenses/monthly-breakdown`.
Schema: `MonthlyBreakdownResponse` → array of `MonthlyBreakdownItem`.
Spec §4-4 for the `is_excluded` aggregation rules.
DB schema: `docs/atoikura.dbml` (all relevant tables).

Field names to match exactly: `year_month`, `breakdown`, `category_id`,
`category_name`, `group_id`, `group_name`, `statement_type_id`,
`statement_type_name`, `total`.

## Tasks

### 1. Add sqlc query

Append to `backend/queries/expenses.sql` (do not create a new file):

```sql
-- name: ListMonthlyBreakdown :many
-- Returns per-category totals for the target month.
-- is_excluded=true entries have their statement_type overridden to 'excluded'.
-- Logically-deleted expense_categories (is_deleted=true) are included because
-- past journal_entries may still reference them.
SELECT
  je.category_id,
  ec.category_name,
  cg.id                                                                              AS group_id,
  cg.group_name,
  CASE WHEN je.is_excluded THEN excl.id   ELSE st.id   END                          AS statement_type_id,
  CASE WHEN je.is_excluded THEN excl.statement_type_name ELSE st.statement_type_name END AS statement_type_name,
  CAST(SUM(je.amount) AS integer)                                                    AS total
FROM journal_entries je
JOIN expense_categories ec  ON je.category_id       = ec.id
JOIN category_groups    cg  ON ec.group_id           = cg.id
JOIN statement_types    st  ON cg.statement_type_id  = st.id
CROSS JOIN (
  SELECT id, statement_type_name
  FROM statement_types
  WHERE type_code = 'excluded'
) excl
WHERE je.user_id          = $1
  AND je.transaction_date >= $2::date
  AND je.transaction_date <  $2::date + INTERVAL '1 month'
GROUP BY
  je.category_id,
  ec.category_name,
  cg.id,
  cg.group_name,
  CASE WHEN je.is_excluded THEN excl.id   ELSE st.id   END,
  CASE WHEN je.is_excluded THEN excl.statement_type_name ELSE st.statement_type_name END
ORDER BY
  CASE WHEN je.is_excluded THEN excl.id   ELSE st.id   END,
  cg.id,
  je.category_id;
```

Run `make sqlc-gen` and confirm `go build ./...` passes before moving on.

### 2. Add repository method

Append to `backend/internal/repository/expenses.go` (do not create a new file):

```go
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
    result := make([]MonthlyBreakdownItem, len(rows))
    for i, row := range rows {
        result[i] = MonthlyBreakdownItem{
            CategoryID:        row.CategoryID,
            CategoryName:      row.CategoryName,
            GroupID:           row.GroupID,
            GroupName:         row.GroupName,
            StatementTypeID:   row.StatementTypeID,
            StatementTypeName: row.StatementTypeName,
            Total:             row.Total,
        }
    }
    return result, nil
}
```

Check the exact field names sqlc generates after running `make sqlc-gen` —
adjust the mapping if they differ (e.g. sqlc may use `StatementTypeName2`).

### 3. Add handler

Append to `backend/internal/handler/expenses.go` (do not create a new file).

Use `WriteJSON`, `WriteError`, and `UserIDFromContext` from the existing helpers.
Reuse `yearMonthPattern` already defined in `handler/time.go`.

```go
type monthlyBreakdownItemJSON struct {
    CategoryID        int32  `json:"category_id"`
    CategoryName      string `json:"category_name"`
    GroupID           int32  `json:"group_id"`
    GroupName         string `json:"group_name"`
    StatementTypeID   int32  `json:"statement_type_id"`
    StatementTypeName string `json:"statement_type_name"`
    Total             int32  `json:"total"`
}

type monthlyBreakdownResponseJSON struct {
    YearMonth string                     `json:"year_month"`
    Breakdown []monthlyBreakdownItemJSON `json:"breakdown"`
}
```

**GetMonthlyBreakdownHandler** logic:

1. Extract `user_id` from context; return `401` if missing.
2. Read required query param `year_month`; return `400 BAD_REQUEST` if absent or
   not matching `^\d{4}-\d{2}$`.
3. Parse to `first_day time.Time` via `time.Parse("2006-01-02", year_month+"-01")`.
4. Call `repo.ListMonthlyBreakdown(ctx, user_id, first_day)`.
5. Map results to `[]monthlyBreakdownItemJSON` (empty slice, not null, if no rows).
6. Return `200` with `monthlyBreakdownResponseJSON`.

### 4. Register route

In `backend/cmd/server/main.go` `registerRoutes`:

```go
mux.Handle("GET /expenses/monthly-breakdown", handler.GetMonthlyBreakdownHandler(repo))
```

## Verification Checklist

Start the stack:
```bash
docker compose up -d db
cd backend && make migrate-up && make run
```

- [ ] `GET /expenses/monthly-breakdown?year_month=2025-05` returns `200` with
  `{"year_month":"2025-05","breakdown":[]}` when no entries exist for that month
- [ ] After inserting a `is_excluded=false` journal entry linked to a 'food'
  category, the breakdown shows `statement_type_name` matching that group's type
- [ ] After inserting a `is_excluded=true` journal entry, the breakdown shows
  `statement_type_name: "対象外"` while `group_name` remains the original value
- [ ] Entries from logically-deleted categories (`is_deleted=true`) are included
  in the breakdown (insert a journal entry, then soft-delete its category, then query)
- [ ] `?year_month` absent → `400 BAD_REQUEST`
- [ ] `?year_month=2025-5` (invalid format) → `400 BAD_REQUEST`
- [ ] `go build ./...` passes
- [ ] `gofmt` and `golangci-lint` pass

```bash
# Empty month
curl -s "http://localhost:8080/expenses/monthly-breakdown?year_month=2025-05" | jq

# Missing param (expect 400)
curl -i "http://localhost:8080/expenses/monthly-breakdown"

# Invalid format (expect 400)
curl -i "http://localhost:8080/expenses/monthly-breakdown?year_month=2025-5"
```

## Commit Plan

1. `feat(backend/queries): add monthly breakdown sqlc query`
2. `chore(backend): regenerate sqlc`
3. `feat(backend/repository): add list monthly breakdown method`
4. `feat(backend/handler): add GET /expenses/monthly-breakdown`
5. `feat(backend): register GET /expenses/monthly-breakdown route`

## After Completion

Push `feature/m4` to origin. Confirm every checklist item passes before Step 2.

## Out of Scope

- `GET /notes/monthly-reviews` and `PUT /notes/monthly-reviews` (Step 2)
- Review screen frontend (Step 3)
- `PUT /journal-entries/{id}` and `DELETE /journal-entries/{id}` (M5)
