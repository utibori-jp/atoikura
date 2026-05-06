# M4 Step 3: Review Screen Frontend

## Goal

Build the review screen (振り返り画面). The user selects a past month, sees a
3-tier accordion of expenses (statement_type → category_group → expense_category),
and can edit and save per-category memos.

## Branch

`feature/m4` — same branch as Steps 1 and 2. Do not create a new branch.

## Prerequisites

- Step 2 merged into `feature/m4` (both `/expenses/monthly-breakdown` and
  `/notes/monthly-reviews` work end-to-end)
- Frontend dev server runs: `cd frontend && npm run dev`

## Reference

API contracts: `docs/atoikura-api.yaml` under `/expenses/monthly-breakdown` and
`/notes/monthly-reviews`.
Spec §3-4 (振り返り画面) for layout and UX requirements.

## Tasks

### 1. Add API client methods

Extend `frontend/src/api/client.ts` (do not rewrite the file):

```ts
getMonthlyBreakdown: (year_month: string) =>
  request<components['schemas']['MonthlyBreakdownResponse']>(
    `/expenses/monthly-breakdown?year_month=${year_month}`,
  ),

getMonthlyReviews: (year_month: string) =>
  request<components['schemas']['MonthlyReviewResponse']>(
    `/notes/monthly-reviews?year_month=${year_month}`,
  ),

updateMonthlyReviews: (
  year_month: string,
  notes: components['schemas']['MonthlyReviewNote'][],
) =>
  request<components['schemas']['MonthlyReviewResponse']>('/notes/monthly-reviews', {
    method: 'PUT',
    body: JSON.stringify({ year_month, notes }),
  }),
```

### 2. Build the ReviewScreen component

Create `frontend/src/components/ReviewScreen.tsx`.

#### Month selector

- Default to the previous month relative to today (JST).
- Allow navigating to any past month; do not allow current month or future months.
- Use the same `MonthNav` pattern already in `App.tsx`.

```ts
function prevMonthJST(): string {
  const now = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });
  const [y, m] = now.slice(0, 7).split('-').map(Number);
  const d = new Date(y, m - 2, 1); // month is 0-indexed in Date constructor
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
```

#### Data fetching

Fetch both endpoints in parallel when `year_month` changes:

```ts
useEffect(() => {
  Promise.all([
    api.getMonthlyBreakdown(year_month),
    api.getMonthlyReviews(year_month),
  ]).then(([breakdown, reviews]) => {
    setBreakdown(breakdown.breakdown);
    // Build memo state: map category_id → note string
    const memo_map: Record<number, string> = {};
    for (const n of reviews.notes) {
      memo_map[n.category_id] = n.note;
    }
    setMemos(memo_map);
    setSavedMemos(memo_map); // track what's persisted
  });
}, [year_month]);
```

#### 3-tier accordion structure

Group breakdown items on the frontend:

```
statement_type_id → statement_type_name  (level 1, collapsible)
  group_id → group_name                  (level 2, collapsible)
    category_id, category_name, total    (level 3, leaf row)
```

Build this structure from the flat `breakdown` array. Sort:
- Level 1: by `statement_type_id` ascending
- Level 2: by `group_name` ascending
- Level 3: by `category_name` ascending

All three levels start expanded by default. Clicking a level 1 or level 2 header
toggles its children.

Each level 3 leaf row shows:
- `category_name`
- `total` formatted as `¥X,XXX`
- A text input for the memo (value from `memos[category_id]`, empty string if absent)

Each level 1 section shows its subtotal (sum of `total` across all its leaf rows).

#### Save button

A single "保存" button at the top (or bottom) of the accordion sends all memos
for the selected month in one PUT call.

- Build `notes` array from `memos` state (include only non-empty values).
- Call `api.updateMonthlyReviews(year_month, notes)`.
- On success: update `savedMemos` to reflect the persisted state; show a brief
  success message (e.g. "保存しました").
- On error: show the error message inline.
- Show a visual indicator if there are unsaved changes (current memos differ from
  `savedMemos`).

#### Empty state

When `breakdown` is empty (no expenses for the selected month), show:
"選択した月の支出データがありません"

#### Component sketch (illustrative)

```tsx
export function ReviewScreen() {
  const [year_month, setYearMonth] = useState(prevMonthJST());
  const [breakdown, setBreakdown] = useState<BreakdownItem[]>([]);
  const [memos, setMemos] = useState<Record<number, string>>({});
  const [saved_memos, setSavedMemos] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);
  const [save_message, setSaveMessage] = useState<string | null>(null);

  // fetch on year_month change
  useEffect(() => { /* ... */ }, [year_month]);

  // group breakdown into 3-tier structure
  const grouped = buildGrouped(breakdown);

  const has_unsaved_changes = JSON.stringify(memos) !== JSON.stringify(saved_memos);

  async function handleSave() {
    setSaving(true);
    const notes = Object.entries(memos)
      .filter(([, note]) => note !== '')
      .map(([id, note]) => ({ category_id: Number(id), note }));
    try {
      await api.updateMonthlyReviews(year_month, notes);
      setSavedMemos({ ...memos });
      setSaveMessage('保存しました');
    } catch (e) {
      setSaveMessage(e instanceof Error ? e.message : '保存に失敗しました');
    } finally {
      setSaving(false);
    }
  }

  return (/* render accordion + save button */);
}
```

### 3. Wire into App.tsx

Enable the "振り返り" nav item (currently `disabled`) and add a `'review'` tab:

1. Add `'review'` to the `Tab` type.
2. Add `振り返り: 'ReviewScreen'` (or equivalent) to `PAGE_TITLES`.
3. Import `ReviewScreen` and render it when `active_tab === 'review'`.
4. Remove `disabled` from the "振り返り" nav item.
5. The month nav in the header is not needed for this tab — `ReviewScreen` manages
   its own month selector internally.

### 4. Manual end-to-end test

```
docker compose up -d db backend
cd frontend && npm run dev
```

1. Navigate to the review screen.
2. Verify the month selector defaults to last month and cannot advance past it.
3. With no entries for the selected month: confirm the empty-state message shows.
4. Insert entries for last month via the home screen or journal list, then reload
   the review screen. Verify the 3-tier accordion renders correctly.
5. Check that `is_excluded=true` entries appear under "対象外" with their original
   `group_name`.
6. Enter memos in several category rows; save. Verify "保存しました" appears.
7. Reload and navigate back to the review screen for the same month. Verify memos
   are pre-populated.
8. Clear a memo (empty the input) and save. Verify the empty entry is not returned
   by the API.
9. Collapse and expand accordion sections; verify they toggle correctly.
10. Verify no regressions in home, journal list, budget settings, or master management.

## Verification Checklist

- [ ] Month selector defaults to previous month; cannot select current or future months
- [ ] Both API calls are made in parallel on month change
- [ ] 3-tier accordion renders: statement_type → category_group → expense_category
- [ ] `is_excluded=true` entries appear under "対象外" with original `group_name`
- [ ] Each section shows its subtotal
- [ ] Leaf rows show `category_name`, `total` (¥ formatted), and memo text input
- [ ] "保存" sends all non-empty memos; empty inputs are excluded
- [ ] Success message shown after save; memos pre-populated on next mount
- [ ] Unsaved-changes indicator is shown when memos differ from last save
- [ ] Error message shown on API failure
- [ ] Empty-state message when no breakdown data for the month
- [ ] All accordion sections start expanded; collapsing/expanding works
- [ ] "振り返り" nav item is active and navigates to this screen
- [ ] No regressions in other screens
- [ ] `npm run build` passes with no TypeScript errors
- [ ] No `any` types introduced
- [ ] `prettier` and `eslint` pass

## Commit Plan

1. `feat(frontend/api): add monthly breakdown and review client methods`
2. `feat(frontend/components): add ReviewScreen with 3-tier accordion and memo editing`
3. `feat(frontend): enable and wire review screen into App`

## After Completion

Confirm every checklist item in all three M4 steps passes, then open one PR from
`feature/m4` to `develop`:

```
gh pr create --base develop --head feature/m4 \
  --title "feat(m4): review screen with monthly breakdown and memo CRUD"
```

## Out of Scope

- Daily notes (`GET /notes/daily`, `PUT /notes/daily/{date}`) — M5
- Journal entry edit/delete (`PUT /journal-entries/{id}`, `DELETE /journal-entries/{id}`) — M5
- Filters on the journal list — M5
- Sorting or secondary grouping beyond the 3-tier hierarchy specified in §3-4
