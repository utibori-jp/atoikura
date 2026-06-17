# M6: Fix bugs found during manual testing of the v2 app

## Goal

Manual testing of the wired-up v2 app (after `m6-v2-wiring.md`) surfaced four
defects in the home/budget/income/recurring screens. This step fixes them. Each
task below is the spec — there is no separate GitHub issue yet; create one per
task if you want issue tracking, otherwise the task here is authoritative.

These are user-reported symptoms, not root-caused diagnoses. **Investigate the
root cause before changing code** (see `superpowers:systematic-debugging`); the
`file:line` pointers below are entry points, not guaranteed fault locations.

## Prerequisites

- You are on a clean checkout with `develop` up to date.
- Read `CLAUDE.md`, `docs/spec.md`, `docs/atoikura-api.yaml`,
  `docs/architecture.md`, and `docs/conventions-frontend.md` first.
- Run the app to reproduce each bug before fixing (see "Running the app" below).

## Running the app (local stack)

The production-style compose images may be stale; serve current source instead:

- Backend: container on `:8080` (`docker compose up -d backend`), DB migrated
  (`make -C backend migrate-up`).
- Frontend: rebuild `dist` (`cd frontend && npm run build`) and serve it, or run
  the Vite dev server. Dev login: `dev@atoikura.local` / `password`.

## Tasks

Work in this order (independent, but #3 and #1 both touch home-screen data).

### 1. Cumulative variable-expense chart breaks when an expense is added

**Symptom:** The "変動費の累積" graph on the home screen breaks (crashes or
renders broken) right after adding a new expense.

- Entry point: `frontend/src/components/HomeGraph.tsx`
  (`buildChartData`, the `recharts` `ComposedChart`, and the `actual_rows` /
  `forecast_rows` slicing around `lastActualIndex`).
- Reproduce: open home, note the chart, add a variable expense, observe the
  break. Determine whether it is a render crash (check the browser console) or
  stale/NaN data, and whether the chart even re-fetches after a mutation.
- Likely suspects to verify: a row with `NaN`/`undefined` reaching recharts;
  an empty `days` array or `last_actual === -1` producing an empty/degenerate
  slice; the chart not re-fetching `getDailyCumulative` after the new entry.

**Acceptance:** Adding a variable expense updates the chart with the new
cumulative total and never crashes, for the empty-month, single-entry, and
many-entry cases.

### 2. Emoji input: default emoji + optional picker (income & recurring)

**Symptom:** Income and recurring-expense forms require manual emoji entry and
reject empty input with "絵文字を入力してください". Replace this with a sensible
**default emoji** that the user can optionally change by **selecting from a
list**.

- Remove the empty-emoji validation error and its tests:
  - `frontend/src/components/web/WebIncome.tsx:212`
  - `frontend/src/components/web/WebRecurring.tsx:155`
  - `frontend/src/components/mobile/MobileIncome.tsx:94`
  - `frontend/src/components/mobile/MobileRecurring.tsx:117`
  - Tests asserting the message: `web/WebIncome.test.tsx:144`,
    `web/WebRecurring.test.tsx:184`, `mobile/MobileRecurring.test.tsx:175`
- The emoji field markup lives near each form's "絵文字" label
  (e.g. `WebIncome.tsx:371`, `WebRecurring.tsx:296`, `MobileIncome.tsx:304`,
  `MobileRecurring.tsx:216`). Replace the free-text input with: a default emoji
  pre-filled on the new-entry form, plus a small picker (a fixed list of emoji
  is acceptable — match the existing inline-style + `T` theme tokens; do not add
  an emoji-picker dependency unless discussed with the user).
- Check `WebMaster.tsx:297` and `MobileSavings.tsx` for the same emoji-field
  pattern and keep them consistent, but only change income/recurring per the
  report unless the shared component makes a split awkward.

**Acceptance:** Creating an income record or recurring expense without touching
the emoji field succeeds and stores a default emoji; the user can pick a
different emoji from a list; updated component tests cover both paths.

### 3. Home "いくら使える？" budget circle does not update after setting a budget

**Symptom:** After setting up a budget, the progress circle on the home screen
("How much can I spend?") does not reflect it.

- Entry points: `frontend/src/components/SummaryCards.tsx`,
  `frontend/src/components/web/WebHome.tsx`,
  `frontend/src/components/mobile/MobileHome.tsx`.
- Confirm which data source the circle reads. Per `m6-v2-wiring.md` (#77/#78),
  the home charts must use the auto budget from `/budget-summary`
  (`api.getBudgetSummary`), not the orphaned manual `/budgets`. Verify the
  circle is wired to `/budget-summary` and that it re-fetches after the budget
  is changed (navigation back to home, or an explicit refetch).
- Cross-check with `WebBudget.tsx` / `MobileBudget.tsx` to see how the budget is
  written, and confirm the read side observes the same value.

**Acceptance:** Setting/changing a budget is reflected in the home circle
(amount remaining and fill ratio) without a manual reload; verified against the
local stack.

### 4. Date inputs show MM/DD/YYYY — change to YYYY/MM/DD

**Symptom:** Date input fields display US `MM/DD/YYYY`; the desired format is
`YYYY/MM/DD`.

- Affected `<input type="date">` fields include:
  `JournalEntryForm.tsx:208`, `JournalEntryList.tsx:143`,
  `mobile/MobileEntryForm.tsx:200`, `mobile/MobileIncome.tsx:286`,
  `web/WebIncome.tsx:426`, `web/WebHome.tsx:537`.
- Note: `index.html` already sets `<html lang="ja">`, but modern Chrome renders
  the native date input using the **browser's** locale, not the page `lang` —
  so the attribute alone will not fix this. Decide an approach and apply it
  consistently:
  - a shared formatted date display/picker component, or
  - a documented browser-locale assumption (weakest — reject if it can't
    guarantee `YYYY/MM/DD`).
  The stored value stays ISO `YYYY-MM-DD`; only the **display** changes.

**Acceptance:** All date inputs above display `YYYY/MM/DD` regardless of browser
locale; submitted values are unchanged (still ISO); existing form tests pass.

## Branching and PRs

- One task = one branch = one PR into `develop`
  (`fix/m6-<short-slug>`, e.g. `fix/m6-home-budget-circle`).
- Conventional Commits, English, title only, no `Co-Authored-By`.
- PR body references this doc; do not use `Closes`.
- After merge, apply the upcoming release label (e.g. `v0.4.0`); do not close.

## Verification checklist (run before each commit/PR)

- [ ] `cd frontend && npm run lint` passes
- [ ] `npm run format` applied (then `npm run format:check` passes)
- [ ] `npx tsc --noEmit` passes
- [ ] `npm run test` passes; tests added/updated for the changed behavior
      (MSW handlers live in `frontend/src/test/`)
- [ ] Bug reproduced before the fix and confirmed gone after, against the local
      stack
