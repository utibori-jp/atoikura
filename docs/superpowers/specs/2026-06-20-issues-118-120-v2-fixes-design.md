# Design: Issues #118–#120 — v2 manual-testing fixes

**Date:** 2026-06-20
**Issues:** #118 (bug), #119 (bug), #120 (enhancement)
**Release label:** `v0.4.0`

Three independent fixes surfaced during v2 manual testing (2026-06-19). Each ships
as its own PR branched from `develop` (1 issue = 1 PR).

---

## #118 — Keep entered date after saving a past-dated expense

### Problem
When saving an expense with a past `transaction_date`, the form snaps the date
field back to today, forcing the user to re-select it for consecutive same-day
entries.

### Investigation
Only one of the three entry forms actually resets the date:

| Form | Success-handler resets | Date reset? |
|---|---|---|
| `WebHome.tsx:448-451` | amount, item, excluded, **date** | **Yes — the bug** |
| `JournalEntryForm.tsx:176-181` | group, category, amount, item, excluded, note | No |
| `MobileEntryForm.tsx:85-90` | group, category, amount, item, excluded, note | No |

The desired consistent behavior is **preserve the entered date**; the other two
forms already do this.

### Fix
- `WebHome.tsx`: remove `setTransactionDate(todayJST())` from the create success
  handler. Keep resetting amount / item / excluded.
- `JournalEntryForm.tsx` / `MobileEntryForm.tsx`: confirm they keep the date
  (no change expected). Align if any drift is found.

### Acceptance
- Saving a past-dated expense leaves the date on the entered value, not today.
- Amount / item / other fields still reset.
- New regression test locks the date-retention behavior (WebHome).

---

## #119 — Budget formula uses base income, not actual recorded income

### Problem
The variable-expense budget is derived from actual recorded income
(`SumIncomeByMonth`), so it fluctuates as income records are entered during the
month. It should derive from the stable `base_income` setting.

### Fix (`backend/internal/repository/budget_summary.go`)
- Fetch `base_income` once via `GetBaseIncome(ctx, user_id)`.
- Current month (line 55):
  `variable_budget = base_income - recurring_total - savings_total - savings_allocated`
- History (line 120): use the **same `base_income`** for all three months
  (decision: stable & comparable across months).
  `h_budget = base_income - recurring_total - savings_total - h_savings_allocated`
- Stop using `SumIncomeByMonth` for the budget calc. **Keep `IncomeTotal`** in the
  response populated from actual recorded income (`SumIncomeByMonth`) — it is a
  display field, only the budget *formula* changes. The per-history-month
  `SumIncomeByMonth` call is no longer needed and is removed.

### Acceptance
- Current-month variable budget equals `base_income - recurring - savings (- allocated)`.
- Adding/removing income records during the month does not change the variable budget.
- Budget-summary tests updated to cover the base-income formula (current + history).

---

## #120 — Recurring category picker shows only fixed-cost (固定費) categories

### Problem
The recurring-expense category dropdown lists all expense categories. Recurring
(fixed) expenses should choose only from fixed-cost categories.

### Approach — frontend-only filter (no API / migration change)
The `固定費` statement type is `id=3`, `type_code="fixed"`
(`migrations/000010_seed_statement_types.sql`). The `/category-groups` payload
already exposes `statement_type` (`CategoryGroup.statement_type.id`). The
`/expense-categories` payload exposes `group_id`.

So the frontend can map category → group → statement_type without any backend
change:
1. Load category groups (already available via `api.listCategoryGroups()`).
2. Build the set of group IDs where `statement_type.id === 3`.
3. Filter the recurring category dropdown to categories whose `group_id` is in
   that set.

### Fix
- `WebRecurring.tsx`: add `api.listCategoryGroups()` to the existing `Promise.all`
  (`:85-98`); compute fixed group IDs; filter the categories rendered at `:388`.
- `MobileRecurring.tsx`: same pattern — load groups, pass into the sheet, filter
  the category `<select>`.
- Verify default fixed-cost categories in `user_defaults.go` (家賃, 水道・光熱費,
  通信費, …) are sufficient — no seed change expected.

### Acceptance
- Recurring category dropdown lists only fixed-cost (固定費) categories.
- Variable categories no longer appear in the recurring picker.
- New users keep sensible default fixed-cost categories, editable in master.

---

## Out of scope
- No API contract change (no `statement_type` added to `ExpenseCategory`).
- No new migrations.
- No changes to non-recurring category pickers.
