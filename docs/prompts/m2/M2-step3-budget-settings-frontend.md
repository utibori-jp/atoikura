# M2 Step 3: Budget Settings Frontend

## Goal

Build the budget settings screen. Users can view and update their monthly variable-
cost budget and savings goal. The screen matches the design mockup at
`docs/design/` (budget settings screenshot).

## Branch

`feature/m2` — same branch as Steps 1 and 2. Do not create a new branch.

## Prerequisites

- Step 2 merged into `feature/m2` (`GET /budgets` and `PUT /budgets` work)
- Frontend dev server runs: `cd frontend && npm run dev`

## Reference

API contracts in `docs/atoikura-api.yaml` under `/budgets`.
Design mockup: `docs/design/` — read the budget settings screenshot before
implementing. Match the layout it shows.

Spec §3-3 (目標設定画面) for UX requirements.

## Tasks

### 1. Regenerate API types

The OpenAPI spec was updated in Step 2. Regenerate the TypeScript types:

```bash
cd frontend && npm run gen:api
```

Confirm `src/api/types.ts` reflects the current spec before proceeding.

### 2. Add API client methods

Extend `frontend/src/api/client.ts` with two new methods — do not rewrite the file:

```ts
getBudgets: () =>
  request<components['schemas']['BudgetResponse']>('/budgets'),

updateBudgets: (body: components['schemas']['BudgetRequest']) =>
  request<components['schemas']['BudgetResponse']>('/budgets', {
    method: 'PUT',
    body: JSON.stringify(body),
  }),
```

Note: `BudgetResponse` has `monthly_budget: integer` and `goal_amount: integer`
(not nullable, despite the OpenAPI annotation — see Step 1 notes). The TypeScript
types from `openapi-typescript` will reflect whatever the spec says; treat `0` as
"not set" in the UI logic.

### 3. Build the BudgetSettings component

Create `frontend/src/components/BudgetSettings.tsx`.

**Fields** (based on spec §3-3 and the design mockup):

| Field | Type | Notes |
|---|---|---|
| `monthly_budget` | number input | 0 = unset; display empty when 0, submit 0 to clear |
| `daily_budget` | read-only display | `floor(monthly_budget / days_in_current_month_jst)`. Update reactively as the user types |
| `goal_text` | text input | optional; max 200 chars |
| `goal_amount` | number input | optional; 0 = unset |

`days_in_current_month_jst`:
```ts
const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
const last_day = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
```

**UX flow** (spec §3-3):
1. On mount: call `api.getBudgets()` and populate form fields (display blank for 0).
2. User edits fields.
3. User clicks Save: show a confirmation popup ("この内容で保存しますか？").
4. User confirms: call `api.updateBudgets()`, close popup, show success state.
5. User cancels: close popup, return to editing.
6. On API error: show the error message inline without closing the popup.

**Component sketch** (illustrative — fill in the implementation):

```tsx
export function BudgetSettings() {
  const [monthly_budget, setMonthlyBudget] = useState<number>(0);
  const [goal_text, setGoalText] = useState<string>('');
  const [goal_amount, setGoalAmount] = useState<number>(0);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const days_in_month = /* calculate from current JST month */;
  const daily_budget = monthly_budget > 0 ? Math.floor(monthly_budget / days_in_month) : 0;

  // fetch on mount, populate state
  // handle save → confirm → PUT
}
```

Constraints (from `docs/prompts/conventions/conventions-frontend.md`):
- No `any` — use `unknown` where needed and narrow properly
- Function components + hooks only (no class components)
- Do not hand-write types that `openapi-typescript` already generates

### 4. Wire into App.tsx

Add the budget settings screen to the app. A simple tab bar or a "設定" link at
the top of the page is sufficient for M2 — visual polish comes later.

Do not break the existing `JournalEntryForm` and `JournalEntryList` components.

### 5. Manual end-to-end test

```
docker compose up -d db backend
cd frontend && npm run dev
```

1. Open `http://localhost:3000` and navigate to the budget settings screen.
2. Verify the form loads with the current saved values (or blanks if none).
3. Enter a monthly budget (e.g. 150000), confirm the daily budget updates reactively.
4. Save → confirm popup appears → confirm → values persist.
5. Reload the page. Verify the saved values reappear.
6. Clear `monthly_budget` (set to 0 or blank) and save. `GET /budgets` should
   return `monthly_budget: 0` afterwards.
7. Verify the confirmation popup closes on cancel without saving.

## Verification Checklist

- [ ] `npm run gen:api` produces no errors
- [ ] Budget settings screen renders and loads current values on mount
- [ ] Daily budget display updates reactively as monthly budget is typed
- [ ] Confirmation popup appears before saving; cancel aborts the save
- [ ] `PUT /budgets` is called on confirm; saved values are reflected after reload
- [ ] Setting `monthly_budget` to 0 (or blank) sends `0` and clears the budget
- [ ] API error message is shown inline (not silently swallowed)
- [ ] `JournalEntryForm` and `JournalEntryList` still work (no regressions)
- [ ] No TypeScript errors (`npm run build` passes)
- [ ] No `any` types introduced
- [ ] `prettier` and `eslint` pass (run in `frontend/`)

## Commit Plan

1. `chore(frontend): regenerate API types`
2. `feat(frontend/api): add getBudgets and updateBudgets client methods`
3. `feat(frontend/components): add BudgetSettings form with confirmation popup`
4. `feat(frontend): wire BudgetSettings into App`

## After Completion

Push `feature/m2` to origin. Confirm the Verification Checklist passes before
moving to Step 4.

## Out of Scope

- Home graph (Step 4)
- Month navigation on the home screen (Step 4)
- Master management UI (M3)
- v0 design polish beyond what the mockup shows
