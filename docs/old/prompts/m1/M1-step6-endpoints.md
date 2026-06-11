# M1 Step 6: Implement M1 Endpoints

## Goal

Implement the 4 endpoints needed to escape the spreadsheet:
- `GET /category-groups` (for the form dropdown)
- `GET /expense-categories` (for the form dropdown)
- `POST /journal-entries` (record a new expense)
- `GET /journal-entries?year_month=YYYY-MM` (list entries grouped by date)

## Branch

Create `feature/m1-step6-endpoints` off `develop`.

## Prerequisites

- Step 5 merged. Server skeleton, middleware, repository wrapper exist.
- sqlc-generated functions are available.

## Reference

The exact request/response contracts are in `docs/atoikura-api.yaml`.
**Match it exactly** including field names, status codes, error codes, and JSON shape.

Field name reminders:
- The list response groups entries by date: `{year_month, entries: [{date, journal_entries: [...]}]}`
- `created_at` returned with JST offset (e.g. `2025-05-05T21:34:56+09:00`)
- Response includes `category_name` and `group_name` joined from masters

## Tasks

### 1. Add repository methods

`backend/internal/repository/category_groups.go`:
- `ListCategoryGroupsByUser(ctx, user_id) ([]CategoryGroupView, error)`
- Returns a domain-friendly struct that matches the API response shape

`backend/internal/repository/expense_categories.go`:
- `ListExpenseCategoriesByUser(ctx, user_id) ([]ExpenseCategoryView, error)`
- `GetActiveExpenseCategory(ctx, id, user_id) (*ExpenseCategoryView, error)` — returns nil if not found / soft-deleted / belongs to another user

`backend/internal/repository/journal_entries.go`:
- `CreateJournalEntry(ctx, params) (*JournalEntryView, error)` — performs CreateJournalEntry then reads back the joined view (or builds from the input + lookup)
- `ListJournalEntriesByMonth(ctx, user_id, first_day_of_month) ([]JournalEntryView, error)` — flat list, ordered by date desc, id desc

The `*View` types should match the API response field names exactly (in JSON tags).

### 2. Add handlers

Each handler:
1. Reads `user_id` from context (`UserIDFromContext`)
2. Parses & validates input
3. Calls repository
4. Maps result to API response
5. Returns appropriate status code

#### `backend/internal/handler/category_groups.go`

```go
func ListCategoryGroupsHandler(repo *repository.Repository) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        user_id, ok := UserIDFromContext(r.Context())
        if !ok {
            WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "認証情報が不正です")
            return
        }
        // ... call repo, build response
    }
}
```

Response shape (matches OpenAPI `CategoryGroupListResponse`):
```json
{
  "category_groups": [
    {
      "id": 1,
      "group_name": "食費",
      "statement_type": {
        "id": 1,
        "type_code": "food",
        "statement_type_name": "食費",
        "display_order": 1
      },
      "description": "..."
    }
  ]
}
```

#### `backend/internal/handler/expense_categories.go`

Response shape (matches `ExpenseCategoryListResponse`):
```json
{
  "expense_categories": [
    {
      "id": 1,
      "category_name": "スーパー",
      "group_id": 1,
      "group_name": "食費",
      "description": null
    }
  ]
}
```

#### `backend/internal/handler/journal_entries.go`

**POST /journal-entries**:

Validation:
- `transaction_date` parses as a date
- `amount >= 1`
- `item` length ≤ 100 (allow null)
- `note` length ≤ 500 (allow null)
- `is_excluded` is a boolean (required)
- `category_id` belongs to the user and is not soft-deleted (call `GetActiveExpenseCategory`).
  If not, return 400 with `BAD_REQUEST` / "指定されたcategory_idは存在しないか削除済みです"

On success: 201 with the `JournalEntryResponse` shape (joined with category/group names).

**GET /journal-entries?year_month=YYYY-MM**:

Validation:
- `year_month` matches `^\d{4}-\d{2}$`. If not, 400.

Group entries by date in the handler:
1. Parse `year_month` to first-of-month date
2. Call `ListJournalEntriesByMonth(ctx, user_id, first_day)`
3. Loop the flat result and group by `transaction_date`
4. Output `{year_month, entries: [{date, journal_entries: [...]}]}`

Empty months return `entries: []` (not null).

#### Time formatting

When marshaling `created_at`, ensure the value is in JST and format as RFC3339 with offset:
```go
jst := time.FixedZone("Asia/Tokyo", 9*60*60)
formatted := created_at.In(jst).Format(time.RFC3339)
```

Consider a small helper in `handler/time.go`.

### 3. Wire routes in `main.go` (or a `routes.go`)

Update `registerRoutes` in `cmd/server/main.go`:

```go
func registerRoutes(mux *http.ServeMux, db_pool *pgxpool.Pool) {
    repo := repository.New(db_pool)

    mux.HandleFunc("GET /health", healthHandler)
    mux.Handle("GET /category-groups", handler.ListCategoryGroupsHandler(repo))
    mux.Handle("GET /expense-categories", handler.ListExpenseCategoriesHandler(repo))
    mux.Handle("POST /journal-entries", handler.CreateJournalEntryHandler(repo))
    mux.Handle("GET /journal-entries", handler.ListJournalEntriesHandler(repo))
}
```

### 4. Manual end-to-end testing

Start the stack:
```
docker compose up -d db
cd backend && make migrate-up && go run ./cmd/server
```

Test each endpoint:

```bash
# List category groups (should return seeded groups)
curl -s http://localhost:8080/category-groups | jq

# List expense categories
curl -s http://localhost:8080/expense-categories | jq

# Create a journal entry (use a real category_id from the previous response)
curl -s -X POST http://localhost:8080/journal-entries \
  -H "Content-Type: application/json" \
  -d '{
    "transaction_date": "2025-05-05",
    "item": "コンビニランチ",
    "amount": 850,
    "category_id": 1,
    "is_excluded": false,
    "note": "昼飯"
  }' | jq

# Try with deleted category (expect 400)
curl -i -X POST http://localhost:8080/journal-entries \
  -H "Content-Type: application/json" \
  -d '{
    "transaction_date": "2025-05-05",
    "amount": 100,
    "category_id": 99999,
    "is_excluded": false
  }'

# Try with negative amount (expect 400)
curl -i -X POST http://localhost:8080/journal-entries \
  -H "Content-Type: application/json" \
  -d '{
    "transaction_date": "2025-05-05",
    "amount": -50,
    "category_id": 1,
    "is_excluded": false
  }'

# List entries for May 2025
curl -s "http://localhost:8080/journal-entries?year_month=2025-05" | jq

# Bad year_month format (expect 400)
curl -i "http://localhost:8080/journal-entries?year_month=2025-5"
```

### 5. Spreadsheet escape feasibility test

After basic testing, manually input a few real entries from your spreadsheet via curl
(or your favorite REST client). Verify:
- Multiple entries on the same date group together
- Entries across different days are sorted day-desc, id-desc within day
- `created_at` shows in JST offset

If this works end-to-end, **you can stop using the spreadsheet right now** and use curl
until the frontend is ready in Step 7.

## Verification Checklist

- [ ] `GET /category-groups` returns seeded groups in the correct shape
- [ ] `GET /expense-categories` returns seeded categories in the correct shape
- [ ] `POST /journal-entries` succeeds with valid input, returns 201 + joined response
- [ ] `POST /journal-entries` returns 400 for invalid amount, deleted category, missing fields
- [ ] `GET /journal-entries?year_month=2025-05` returns date-grouped result
- [ ] Bad `year_month` returns 400
- [ ] Empty months return `{"year_month":"...","entries":[]}`
- [ ] `created_at` is formatted with `+09:00` offset
- [ ] All response field names exactly match `docs/atoikura-api.yaml`

## Commit Plan

1. `feat(backend/repository): add category_groups list method`
2. `feat(backend/repository): add expense_categories list and get methods`
3. `feat(backend/repository): add journal_entries create and list methods`
4. `feat(backend/handler): add GET /category-groups`
5. `feat(backend/handler): add GET /expense-categories`
6. `feat(backend/handler): add POST /journal-entries with validation`
7. `feat(backend/handler): add GET /journal-entries with date grouping`

## After Completion

PR to `develop`. Wait for user confirmation. **At this point you have a working
backend — you can start logging entries via curl and abandon the spreadsheet.**

## Out of Scope

- Frontend (Step 7)
- All other endpoints (M2 onward)
- Tests (M2 onward)
