# M2 Step 1: Budgets Backend

## Goal

Implement `GET /budgets` and `PUT /budgets`. After this step the API can read and
persist a user's monthly variable-cost budget and savings goal.

Key contract details (take precedence over the OpenAPI `BudgetResponse` nullable
annotation, which is outdated — the DB schema is the source of truth):

- `budgets.monthly_budget` and `budgets.goal_amount` are `INTEGER NOT NULL DEFAULT 0`.
  **Zero is the "unset" sentinel.** Return `0`, not `null`, for these fields.
- `budgets.goal_text` is nullable — return `null` when not set.
- `GET /budgets`: returns `200` even when no record exists for the user; return zeros/null.
- `PUT /budgets`: upserts the row; `monthly_budget < 0` or `goal_amount < 0` → `400`.
  Zero is a valid value (clears the budget).

## Branch

All M2 steps share a single branch `feature/m2`. If it doesn't exist yet, cut it
from `develop` now:

```bash
git checkout develop && git pull
git checkout -b feature/m2
```

Commit all work from this step to `feature/m2`. **Do not open a PR yet** — the PR
to `develop` is opened once all four M2 steps are complete.

## Prerequisites

- M1 is merged to `develop`
- `budgets` table exists (`backend/migrations/000006_create_budgets.sql`)
- `make sqlc-gen` and `make run` work

## Reference

Exact contracts in `docs/atoikura-api.yaml` under `/budgets`.
Field names to match exactly: `monthly_budget`, `goal_text`, `goal_amount`.

## Tasks

### 1. Add sqlc queries

Create `backend/queries/budgets.sql`. Follow the per-resource file convention
already established in `backend/queries/`.

```sql
-- name: GetBudgetByUser :one
SELECT monthly_budget, goal_text, goal_amount
FROM budgets
WHERE user_id = $1;

-- name: UpsertBudget :one
INSERT INTO budgets (user_id, monthly_budget, goal_text, goal_amount)
VALUES ($1, $2, $3, $4)
ON CONFLICT (user_id) DO UPDATE
  SET monthly_budget = EXCLUDED.monthly_budget,
      goal_text      = EXCLUDED.goal_text,
      goal_amount    = EXCLUDED.goal_amount,
      updated_at     = NOW()
RETURNING monthly_budget, goal_text, goal_amount;
```

Run `make sqlc-gen` and confirm `go build ./...` still passes before moving on.

### 2. Add repository methods

Create `backend/internal/repository/budgets.go`. Follow the pattern in
`backend/internal/repository/` — add methods to the existing `Repository` struct.

```go
type BudgetResult struct {
    MonthlyBudget int32
    GoalText      *string
    GoalAmount    int32
}

// GetBudgetByUser returns the user's budget record.
// If no record exists, returns a zero-value BudgetResult (MonthlyBudget=0,
// GoalAmount=0, GoalText=nil) — never returns an error for missing rows.
func (r *Repository) GetBudgetByUser(ctx context.Context, user_id int64) (*BudgetResult, error) {
    row, err := r.queries.GetBudgetByUser(ctx, int32(user_id))
    if errors.Is(err, pgx.ErrNoRows) {
        return &BudgetResult{}, nil
    }
    if err != nil {
        return nil, fmt.Errorf("getting budget: %w", err)
    }
    return &BudgetResult{
        MonthlyBudget: row.MonthlyBudget,
        GoalText:      row.GoalText,
        GoalAmount:    row.GoalAmount,
    }, nil
}

func (r *Repository) UpsertBudget(ctx context.Context, user_id int64, monthly_budget int32, goal_text *string, goal_amount int32) (*BudgetResult, error) {
    // call r.queries.UpsertBudget, map result to BudgetResult
}
```

### 3. Add handler

Create `backend/internal/handler/budgets.go`.

Use `WriteJSON` and `WriteError` from `response.go`, and `UserIDFromContext` from
`context.go` — do not re-implement these.

```go
type budgetResponseJSON struct {
    MonthlyBudget int32   `json:"monthly_budget"`
    GoalText      *string `json:"goal_text"`
    GoalAmount    int32   `json:"goal_amount"`
}
```

**GET /budgets handler** (`GetBudgetsHandler`):

1. Get `user_id` from context.
2. Call `repo.GetBudgetByUser`.
3. Return `200` with `budgetResponseJSON`.

**PUT /budgets handler** (`UpdateBudgetsHandler`):

Request fields are all optional — any combination may be sent:

```go
type budgetRequestJSON struct {
    MonthlyBudget *int32  `json:"monthly_budget"`
    GoalText      *string `json:"goal_text"`
    GoalAmount    *int32  `json:"goal_amount"`
}
```

Validation (apply before the upsert):
- `monthly_budget` non-nil and `< 0` → `400 BAD_REQUEST` "monthly_budgetは0以上の整数である必要があります"
- `goal_amount` non-nil and `< 0` → `400 BAD_REQUEST` "goal_amountは0以上の整数である必要があります"
- `goal_text` non-nil and `len([]rune(*req.GoalText)) > 200` → `400 BAD_REQUEST` "goal_textは200文字以内で入力してください"

Merge logic — fields not present in the request keep their current DB values:
1. Read current budget via `repo.GetBudgetByUser`.
2. Apply non-nil request fields over the current values.
3. Call `repo.UpsertBudget` with the merged values.
4. Return `200` with `budgetResponseJSON`.

### 4. Register routes

Update `registerRoutes` in `backend/cmd/server/main.go`:

```go
mux.Handle("GET /budgets", handler.GetBudgetsHandler(repo))
mux.Handle("PUT /budgets", handler.UpdateBudgetsHandler(repo))
```

## Verification Checklist

Start the stack first:
```bash
docker compose up -d db
cd backend && make migrate-up && make run
```

- [ ] `GET /budgets` returns `200` with `{"monthly_budget":0,"goal_text":null,"goal_amount":0}` for a fresh user
- [ ] `PUT /budgets` with `{"monthly_budget":120000,"goal_text":"旅行費を貯める","goal_amount":300000}` returns `200` with those values
- [ ] Subsequent `GET /budgets` returns the saved values
- [ ] `PUT /budgets` with `{"monthly_budget":0}` returns `200` (zero is valid — clears the budget)
- [ ] `PUT /budgets` with only `{"goal_text":"updated note"}` leaves `monthly_budget` and `goal_amount` unchanged
- [ ] `PUT /budgets` with `{"monthly_budget":-1}` returns `400 BAD_REQUEST`
- [ ] `PUT /budgets` with `{"goal_amount":-500}` returns `400 BAD_REQUEST`
- [ ] `PUT /budgets` with a `goal_text` longer than 200 characters returns `400 BAD_REQUEST`
- [ ] `go build ./...` passes
- [ ] `gofmt` and `golangci-lint` pass (run in `backend/`)

```bash
# Fresh user — all zeros/null
curl -s http://localhost:8080/budgets | jq

# Set budget and goal
curl -s -X PUT http://localhost:8080/budgets \
  -H "Content-Type: application/json" \
  -d '{"monthly_budget":120000,"goal_text":"旅行費を貯める","goal_amount":300000}' | jq

# Confirm persisted
curl -s http://localhost:8080/budgets | jq

# Clear monthly_budget (set to 0)
curl -s -X PUT http://localhost:8080/budgets \
  -H "Content-Type: application/json" \
  -d '{"monthly_budget":0}' | jq

# Negative monthly_budget (expect 400)
curl -i -X PUT http://localhost:8080/budgets \
  -H "Content-Type: application/json" \
  -d '{"monthly_budget":-1}'

# Negative goal_amount (expect 400)
curl -i -X PUT http://localhost:8080/budgets \
  -H "Content-Type: application/json" \
  -d '{"goal_amount":-500}'
```

## Commit Plan

1. `feat(backend/queries): add budgets sqlc queries`
2. `chore(backend): regenerate sqlc`
3. `feat(backend/repository): add budgets get and upsert methods`
4. `feat(backend/handler): add GET /budgets`
5. `feat(backend/handler): add PUT /budgets with validation`
6. `feat(backend): register GET and PUT /budgets routes`

## After Completion

Push `feature/m2` to origin. **Do not open a PR.** Confirm every item in the
Verification Checklist passes before moving to Step 2.

## Out of Scope

- `GET /expenses/daily-cumulative` (Step 2)
- Frontend budget settings screen (Step 3)
- The home graph (Step 4)
- Tests (deferred beyond M2)
