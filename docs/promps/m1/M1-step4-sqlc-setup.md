# M1 Step 4: sqlc Setup

## Goal

Configure sqlc, write SQL queries needed for M1 endpoints, and generate type-safe
Go code under `backend/internal/db/`.

## Branch

Create `feature/m1-step4-sqlc-setup` off `develop`.

## Prerequisites

- Step 3 merged. Database has all tables and seed data.
- `sqlc` CLI installed: `brew install sqlc` or https://docs.sqlc.dev/

## M1 Endpoints to Cover

We only need queries for these 4 endpoints in M1:
- `POST /journal-entries`
- `GET /journal-entries?year_month=YYYY-MM`
- `GET /category-groups`
- `GET /expense-categories`

## Tasks

### 1. Create `backend/sqlc.yaml`

```yaml
version: "2"
sql:
  - engine: "postgresql"
    queries: "queries"
    schema: "migrations"
    gen:
      go:
        package: "db"
        out: "internal/db"
        sql_package: "pgx/v5"
        emit_json_tags: true
        emit_pointers_for_null_types: true
        overrides:
          - db_type: "timestamptz"
            go_type: "time.Time"
          - db_type: "timestamptz"
            nullable: true
            go_type:
              type: "time.Time"
              pointer: true
```

Notes:
- `pgx/v5` is the recommended driver for sqlc
- `emit_pointers_for_null_types: true` makes nullable columns easier to handle
- `migrations` is used as the schema source — sqlc reads all `.up.sql` files

### 2. Add Go dependencies

```
cd backend
go get github.com/jackc/pgx/v5
go get github.com/jackc/pgx/v5/pgxpool
```

### 3. Write SQL queries under `backend/queries/`

Split into one file per resource. Use sqlc query annotations.

#### `backend/queries/category_groups.sql`

```sql
-- name: ListCategoryGroupsByUser :many
SELECT
  cg.id,
  cg.group_name,
  cg.description,
  cg.statement_type_id,
  st.type_code AS statement_type_code,
  st.statement_type_name,
  st.display_order AS statement_type_display_order
FROM category_groups cg
JOIN statement_types st ON cg.statement_type_id = st.id
WHERE cg.user_id = $1 AND cg.is_deleted = false
ORDER BY cg.group_name ASC;
```

#### `backend/queries/expense_categories.sql`

```sql
-- name: ListExpenseCategoriesByUser :many
SELECT
  ec.id,
  ec.category_name,
  ec.description,
  ec.group_id,
  cg.group_name
FROM expense_categories ec
JOIN category_groups cg ON ec.group_id = cg.id
WHERE ec.user_id = $1
  AND ec.is_deleted = false
  AND cg.is_deleted = false
ORDER BY cg.group_name ASC, ec.category_name ASC;

-- name: GetActiveExpenseCategoryByID :one
-- Used to validate category_id when creating/updating a journal entry
SELECT id, user_id, group_id, is_deleted
FROM expense_categories
WHERE id = $1 AND user_id = $2 AND is_deleted = false;
```

#### `backend/queries/journal_entries.sql`

```sql
-- name: CreateJournalEntry :one
INSERT INTO journal_entries (
  transaction_date, item, amount, category_id, user_id, is_excluded, note
) VALUES (
  $1, $2, $3, $4, $5, $6, $7
)
RETURNING id, transaction_date, item, amount, category_id, user_id,
          is_excluded, note, created_at, updated_at;

-- name: ListJournalEntriesByMonth :many
-- Joins category and group info for the response.
-- Includes soft-deleted categories so historical entries display correctly.
SELECT
  je.id,
  je.transaction_date,
  je.item,
  je.amount,
  je.category_id,
  ec.category_name,
  ec.group_id,
  cg.group_name,
  je.is_excluded,
  je.note,
  je.created_at
FROM journal_entries je
JOIN expense_categories ec ON je.category_id = ec.id
JOIN category_groups cg ON ec.group_id = cg.id
WHERE je.user_id = $1
  AND je.transaction_date >= $2::date
  AND je.transaction_date < ($2::date + INTERVAL '1 month')
ORDER BY je.transaction_date DESC, je.id DESC;
```

Note on `ListJournalEntriesByMonth`:
- Parameter `$2` is the first day of the target month (e.g. `2025-05-01`)
- The handler converts `year_month=YYYY-MM` to `YYYY-MM-01` before passing
- The result is flat (not grouped). Grouping by date happens in the handler layer.

### 4. Generate Go code

```
cd backend
sqlc generate
```

This produces files under `backend/internal/db/`:
- `db.go` — DBTX interface
- `models.go` — struct definitions for each table
- `category_groups.sql.go`, `expense_categories.sql.go`, `journal_entries.sql.go`
- `querier.go`

Verify the generated code compiles:
```
go build ./...
```

### 5. Add a Makefile target

Update `backend/Makefile`:
```makefile
.PHONY: sqlc-gen

sqlc-gen:
	sqlc generate
```

### 6. Update `.gitignore` if needed

Generated sqlc code SHOULD be committed (it's the contract). Don't ignore `internal/db/`.

## Verification Checklist

- [ ] `sqlc generate` runs without errors
- [ ] Generated files exist under `backend/internal/db/`
- [ ] `go build ./...` succeeds
- [ ] Each query has a corresponding generated Go function with correct types
- [ ] `time.Time` (not `pgtype.Timestamptz`) is used for timestamp columns

## Commit Plan

1. `chore(backend): add sqlc.yaml configuration`
2. `chore(backend): add pgx/v5 dependency`
3. `feat(backend/queries): add category_groups queries`
4. `feat(backend/queries): add expense_categories queries`
5. `feat(backend/queries): add journal_entries queries`
6. `chore(backend): generate sqlc code`
7. `chore(backend): add sqlc-gen Makefile target`

## After Completion

PR to `develop`. Wait for user confirmation.

## Out of Scope

- Repository wrappers (Step 5)
- HTTP handlers (Step 5/6)
- Any business logic
