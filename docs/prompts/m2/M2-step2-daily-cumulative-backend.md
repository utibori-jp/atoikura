# M2 Step 2: Daily Cumulative Backend

## Goal

Implement `GET /expenses/daily-cumulative` — the backend that powers the home
screen graph. The response covers every day in the target month, combining real
cumulative totals for past and today with a pace-based forecast for future days.

Also update `docs/atoikura-api.yaml` to add the `year_month` query parameter that
was missing from the initial spec draft.

## Branch

`feature/m2` — same branch as Step 1. Do not create a new branch.

## Prerequisites

- Step 1 merged into `feature/m2` (`GET /budgets` and `PUT /budgets` work)
- `make sqlc-gen` and `make run` work

## Reference

Exact contract in `docs/atoikura-api.yaml` under `/expenses/daily-cumulative`.
Response schema: `DailyCumulativeResponse` → array of `DailyEntry`.

Field names to match exactly:
`year_month`, `monthly_budget`, `daily_budget`, `days`, `date`, `food`, `other`,
`total`, `is_actual`.

## Tasks

### 1. Update the OpenAPI spec

In `docs/atoikura-api.yaml`, add the optional `year_month` query parameter to
`GET /expenses/daily-cumulative`:

```yaml
parameters:
  - name: year_month
    in: query
    required: false
    schema:
      type: string
      pattern: '^\d{4}-\d{2}$'
    description: 対象年月（YYYY-MM）。省略時は当月（JST）
    example: "2025-04"
```

Also add a `400` response (invalid `year_month` format) matching the pattern
used by `GET /journal-entries`.

### 2. Add sqlc queries

Create `backend/queries/expenses.sql`:

```sql
-- name: ListDailyExpenseSumsForMonth :many
-- Returns per-day, per-type_code subtotals for the target month.
-- Only includes is_excluded=false entries with type_code 'food' or 'other'.
SELECT
  je.transaction_date::text AS date,
  st.type_code,
  CAST(SUM(je.amount) AS integer) AS daily_sum
FROM journal_entries je
JOIN expense_categories ec ON je.category_id = ec.id
JOIN category_groups    cg ON ec.group_id     = cg.id
JOIN statement_types    st ON cg.statement_type_id = st.id
WHERE je.user_id      = $1
  AND je.is_excluded  = false
  AND st.type_code    IN ('food', 'other')
  AND je.transaction_date >= $2::date
  AND je.transaction_date <  $2::date + INTERVAL '1 month'
GROUP BY je.transaction_date, st.type_code
ORDER BY je.transaction_date ASC;
```

Run `make sqlc-gen` and confirm `go build ./...` passes.

### 3. Add repository method

Create `backend/internal/repository/expenses.go`:

```go
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
) ([]DailyExpenseSum, error) { ... }
```

### 4. Add handler

Create `backend/internal/handler/expenses.go`.

The handler contains the forecast logic described below. Isolate the pure
computation (building the `days` array) into a package-private function so it
can be read and reasoned about independently from the HTTP wiring.

Use `WriteJSON`, `WriteError`, and `UserIDFromContext` from the existing helpers.

#### 4a. Parsing and defaults

```go
var jst = time.FixedZone("Asia/Tokyo", 9*60*60)  // already in handler/time.go — reuse it
```

- If `year_month` query param is absent, default to the current month in JST:
  `time.Now().In(jst).Format("2006-01")`
- If present, validate format `^\d{4}-\d{2}$`. Invalid → `400 BAD_REQUEST`
  "year_monthはYYYY-MM形式で指定してください"
- Parse to `first_day time.Time` using `time.Parse("2006-01-02", year_month+"-01")`

#### 4b. Determine "today" and whether the month is past or current

```go
today_str := time.Now().In(jst).Format("2006-01-02")  // "YYYY-MM-DD"
today_ym  := today_str[:7]                             // "YYYY-MM"
is_past_month := year_month < today_ym
```

#### 4c. Fetch data

Call `repo.ListDailyExpenseSumsForMonth` and `repo.GetBudgetByUser` in parallel
(or sequentially — correctness first).

Build a map `actual_sums: map[date]map[typeCode]int32` from the query results.

#### 4d. Build the `days` array

Iterate every calendar day in the target month (day 1 to last day):

```
last_day = last day of target month
for day_num := 1; day_num <= last_day; day_num++ {
    date_str := format(first_day.AddDate(0, 0, day_num-1))
    ...
}
```

**For past months** (`is_past_month == true`):
- Every day is `is_actual: true`
- Accumulate running sums day by day from `actual_sums`; days with no entries add 0

**For the current month**:
- Days where `date_str <= today_str`: `is_actual: true`, use actual sums
- Days where `date_str > today_str`: `is_actual: false`, use forecast

#### 4e. Forecast logic (current month only)

After processing all actual days up to and including today:

```
today_day_num := today in JST, day-of-month integer
days_elapsed  := today_day_num               // today is inclusive; day 1 has 1 day elapsed
cumulative_food_today  := running food total at end of today
cumulative_other_today := running other total at end of today

if days_elapsed == 0 || (cumulative_food_today == 0 && cumulative_other_today == 0) {
    // No entries yet; all future days forecast as 0
    pace_food  = 0
    pace_other = 0
} else {
    pace_food  = float64(cumulative_food_today)  / float64(days_elapsed)
    pace_other = float64(cumulative_other_today) / float64(days_elapsed)
}

// For future day N (N > today_day_num):
forecast_food  = cumulative_food_today  + int32(math.Floor(pace_food  * float64(N - today_day_num)))
forecast_other = cumulative_other_today + int32(math.Floor(pace_other * float64(N - today_day_num)))
```

#### 4f. Response shape

```go
type dailyEntryJSON struct {
    Date     string `json:"date"`
    Food     int32  `json:"food"`
    Other    int32  `json:"other"`
    Total    int32  `json:"total"`   // food + other
    IsActual bool   `json:"is_actual"`
}

type dailyCumulativeResponseJSON struct {
    YearMonth     string           `json:"year_month"`
    MonthlyBudget int32            `json:"monthly_budget"`
    DailyBudget   int32            `json:"daily_budget"`
    Days          []dailyEntryJSON `json:"days"`
}
```

`daily_budget`: if `monthly_budget == 0`, return `0`. Otherwise:
`daily_budget = monthly_budget / days_in_month` (integer division, floor).

`days_in_month`: number of days in the target month (not hard-coded to 30):
```go
days_in_month := time.Date(first_day.Year(), first_day.Month()+1, 0, 0, 0, 0, 0, time.UTC).Day()
```

### 5. Register route

Add to `registerRoutes` in `backend/cmd/server/main.go`:

```go
mux.Handle("GET /expenses/daily-cumulative", handler.GetDailyCumulativeHandler(repo))
```

## Verification Checklist

Start the stack first:
```bash
docker compose up -d db
cd backend && make migrate-up && make run
```

- [ ] Current month with no entries returns all zeros, `is_actual: true` for today and past days, `is_actual: false` for future days
- [ ] `days` array length equals the number of days in the target month (28/30/31 as appropriate — not hardcoded)
- [ ] After inserting some entries, food/other/total values accumulate correctly day by day
- [ ] `food + other == total` for every day
- [ ] Future days show forecast values computed from `(today's cumulative / today's day number) × days ahead`
- [ ] Forecast of 0 when no actual entries exist
- [ ] Past month via `?year_month=YYYY-MM`: all days `is_actual: true`, no forecast logic
- [ ] `?year_month=` with invalid format returns `400 BAD_REQUEST`
- [ ] When no budget is set: `monthly_budget=0`, `daily_budget=0`
- [ ] When budget is set: `daily_budget = floor(monthly_budget / days_in_month)` correct for that month
- [ ] `go build ./...` passes
- [ ] `gofmt` and `golangci-lint` pass

```bash
# No entries yet (current month)
curl -s http://localhost:8080/expenses/daily-cumulative | jq '.days[:3]'

# With year_month param (past month — all is_actual: true)
curl -s "http://localhost:8080/expenses/daily-cumulative?year_month=2025-04" | jq '.days[:3]'

# Invalid format (expect 400)
curl -i "http://localhost:8080/expenses/daily-cumulative?year_month=2025-4"

# Set a budget, then check daily_budget calculation
curl -s -X PUT http://localhost:8080/budgets \
  -H "Content-Type: application/json" \
  -d '{"monthly_budget":155000}' | jq

curl -s http://localhost:8080/expenses/daily-cumulative | jq '{monthly_budget,daily_budget}'
# For May (31 days): daily_budget should be floor(155000/31) = 5000
```

## Commit Plan

1. `docs(api): add year_month param to GET /expenses/daily-cumulative`
2. `feat(backend/queries): add daily expense sums query`
3. `chore(backend): regenerate sqlc`
4. `feat(backend/repository): add list daily expense sums method`
5. `feat(backend/handler): add GET /expenses/daily-cumulative with forecast logic`
6. `feat(backend): register GET /expenses/daily-cumulative route`

## After Completion

Push `feature/m2` to origin. Confirm the Verification Checklist passes before
moving to Step 3.

## Out of Scope

- Frontend graph (Step 4)
- Budget settings UI (Step 3)
- `GET /expenses/monthly-breakdown` (M3/M4)
- Tests (deferred beyond M2)
