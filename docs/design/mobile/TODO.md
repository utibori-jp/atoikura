# Atoikura Mobile v2 — Implementation TODO

> Implementation order: #1 → #2 → #3–#7 (parallel) → #8

---

## #1 Add missing tokens to `theme.ts`

**File:** `frontend/src/theme.ts`

Add the following to the `T` object:

```typescript
coralSoft:   "#FFE8DD",
mustardSoft: "#FFF1CC",
sageSoft:    "#DEF1E6",
mustardDeep: "#F0A92E",
```

These exist in the design file as `M.coralSoft` etc. but are missing from the current `theme.ts`.

---

## #2 Create mock data layer

**Files to create:**
- `frontend/src/api/mobile-types.ts` — TypeScript interfaces for all new data types
- `frontend/src/api/mobile-mock.ts` — Static mock data + async mock API functions

### Types to define in `mobile-types.ts`

```typescript
interface RecurringExpense {
  id: number;
  name: string;
  emoji: string;
  billing_day: number;
  amount: number | null;       // null = variable (要確認)
  type: "fixed" | "variable";
  group_id: number;
  group_name: string;
  category_id: number;
  category_name: string;
}

interface PendingRecurring {
  id: number;
  name: string;
  emoji: string;
  billing_day: number;
  last_amount: number;
  group_name: string;
}

interface SavingsGoal {
  id: number;
  name: string;
  emoji: string;
  monthly_amount: number;
  target_amount: number;
  accumulated_amount: number;
  deadline: string | null;     // "YYYY/MM"
  is_posted_this_month: boolean;
  memo: string;
}

interface IncomeRecord {
  id: number;
  transaction_date: string;    // "YYYY-MM-DD"
  amount: number;
  name: string;
  income_type: "salary" | "side" | "bonus" | "oneoff";
  emoji: string;
  note: string;
}

interface BaseIncomeSetting {
  amount: number;
}

interface BudgetSummary {
  income_total: number;
  recurring_total: number;
  savings_total: number;
  variable_budget: number;
  daily_budget: number;
  days_remaining: number;
  history: Array<{ year_month: string; budget: number; actual: number }>;
}
```

Also extend `JournalEntryResponse` with an optional field (for the 🔁 badge in #7):
```typescript
// Augment only — do not modify the generated types.ts
interface JournalEntryResponseWithRecurring
  extends components["schemas"]["JournalEntryResponse"] {
  is_recurring?: boolean;
}
```

### Mock data in `mobile-mock.ts`

Use the sample data from the design files as-is:
- `RECURRING` / `PENDING_RECURRING` → from `mobile-recurring.jsx`
- `SAVINGS_GOALS` → from `mobile-savings.jsx`
- `INCOMES` / `BASE_INCOME` → from `mobile-income.jsx`
- `INCOME_THIS_MONTH` / `FIXED_TOTAL` / `SAVINGS_MONTHLY` → from `mobile-goals-v2.jsx`

All mock API functions must return `Promise<T>` (use `Promise.resolve(...)`) so components can swap them for real `api.xxx()` calls without structural changes.

```typescript
export const mobileApi = {
  listRecurringExpenses: () => Promise.resolve(MOCK_RECURRING),
  listPendingRecurring:  () => Promise.resolve(MOCK_PENDING),
  listSavingsGoals:      () => Promise.resolve(MOCK_SAVINGS_GOALS),
  listIncomes:           (year_month: string) => Promise.resolve(MOCK_INCOMES),
  getBaseIncome:         () => Promise.resolve(MOCK_BASE_INCOME),
  getBudgetSummary:      (year_month: string) => Promise.resolve(MOCK_BUDGET_SUMMARY),
};
```

---

## #3 Create `MobileRecurring.tsx`

**File:** `frontend/src/components/mobile/MobileRecurring.tsx`

**Design source:** `docs/design/mobile/src/mobile-recurring.jsx`
→ `MRecurringScreen` + `MRecurringSheetScreen`

**Exports:**
- `MobileRecurring` — main screen
- `MobileRecurringSheet` — add sheet (overlay)

**MobileRecurring layout:**
1. "💬 確認待ち" section with count badge — one card per `PendingRecurring` item (emoji, name, 要確認 badge, group, 前回¥, "金額を確定" button)
2. "繰り返し設定" section with count — one card per `RecurringExpense` (emoji, name, 毎月X日 chip, 固定/要確認 chip, amount or "—", ✎/🗑 buttons)
3. "＋ 定期支出を追加" dashed outline button → opens `MobileRecurringSheet`

**MobileRecurringSheet layout (bottom sheet overlay):**
- Follows the `EntrySheet` pattern in `App.tsx` (`position: fixed`, `z-index: 200`, drag handle, ✕ button)
- Fields: 項目名 / 大分類 horizontal chips / 生活区分 wrap chips / 金額(optional) + 毎月X日 / タイプ segmented (固定/要確認) / メモ(optional)
- "保存する" CTA button

**Props:**
```typescript
interface MobileRecurringProps {
  onBack: () => void;
}
```

---

## #4 Create `MobileSavings.tsx`

**File:** `frontend/src/components/mobile/MobileSavings.tsx`

**Design source:** `docs/design/mobile/src/mobile-savings.jsx`
→ `MSavingsScreen` + `MSavingsSheetScreen`

**Exports:**
- `MobileSavings` — main screen
- `MobileSavingsSheet` — add sheet (overlay)

**MobileSavings layout:**
1. Hero card: "今月の貯金合計" + total ¥ + goal chips row
2. "目標一覧" section header + count
3. One card per `SavingsGoal`:
   - Emoji icon + name + ¥/月 chip + 今月済/待ち badge + ✎/🗑 buttons
   - Memo line (bgSoft bg)
   - Progress section: accumulated ¥ + % + mustard→coral gradient bar
4. "＋ 貯金目標を追加" dashed button → opens `MobileSavingsSheet`

**MobileSavingsSheet fields:**
- 目標名 text / emoji picker (6 options, mustardSoft when selected) / 毎月の積立額 (large ¥, mustard border) / 目標金額 + 目標日 row / メモ textarea
- "保存する" CTA button

**Props:**
```typescript
interface MobileSavingsProps {
  onBack: () => void;
}
```

---

## #5 Create `MobileIncome.tsx`

**File:** `frontend/src/components/mobile/MobileIncome.tsx`

**Design source:** `docs/design/mobile/src/mobile-income.jsx`
→ `MIncomeScreen` + 3 sheets

**Exports:**
- `MobileIncome` — main screen
- `MobileIncomeSheet` — record income sheet
- `MobileAllocateSheet` — allocate surplus sheet
- `MobileEditBaseSheet` — edit base income sheet

**MobileIncome layout:**
1. Hero card (two-zone, hairline divider):
   - Left: 基準収入 ¥ + "毎月の見込み" label + "✎ 編集" ghost button → opens `MobileEditBaseSheet`
   - Right: 余剰金額 ¥ (sage) + 未振分 badge + "振り分ける →" mustard button → opens `MobileAllocateSheet`
2. Month chip scroller
3. Day-grouped income list: sage icon box + name + type badge (給与/副業/ボーナス/一時収入) + 基準 badge for salary + `+¥` amount in sageDeep
4. Tab bar FAB turns sage (`addTone="sage"`) → opens `MobileIncomeSheet`

**MobileIncomeSheet fields:**
- Amount (sage border, sage ¥) / 収入名 + 日付 / 種別 chips / メモ / "＋ 記録する" CTA

**MobileAllocateSheet fields:**
- Amount (mustard border) + quick-fill chips (全額/½/¥10,000) / 振り分け先 radio cards / savings goal sub-selector / メモ / "＋ 記録する" CTA

**MobileEditBaseSheet fields:**
- Large ¥ input (sage border) / 💡 help card / preset chips (先月/3ヶ月平均/半年平均) / "保存する" CTA

**Props:**
```typescript
interface MobileIncomeProps {
  onBack: () => void;
}
```

---

## #6 Create `MobileBudget.tsx`

**File:** `frontend/src/components/mobile/MobileBudget.tsx`

**Design source:** `docs/design/mobile/src/mobile-goals-v2.jsx`
→ `MBudgetScreen`

**Exports:**
- `MobileBudget` — budget hub screen

**Layout:**
1. Hero card: "今月の予算 自動" label + large ¥VARIABLE_BUDGET (coral, 50px) + hairline divider + 1日あたり (coral) | 今月の残りX日
2. "予算の内訳" section header + "タップで詳細" sub
3. Three nav tiles (tap to navigate):
   - 収入: sage tone, 💼, → `onNavigate("income")`
   - 定期支出: sky tone (#E5EEF7 / #3F6B91), 🔁, → `onNavigate("recurring")`
   - 貯金: mustard tone, 💰, → `onNavigate("savings")`
   - Each tile: tinted icon box + title + subtitle + sign badge (+ or −) + ¥ amount + › arrow
4. Formula line: 収入 − 定期支出 − 貯金 = 今月の予算 (dashed card)
5. "貯金の目的" section (memo card + sage progress note)
6. "直近3ヶ月の予算" section (3 history cards with mini progress bars)

**Props:**
```typescript
interface MobileBudgetProps {
  onNavigate: (screen: "income" | "recurring" | "savings") => void;
}
```

---

## #7 Add 🔁 badge to `MobileJournal.tsx`

**File:** `frontend/src/components/mobile/MobileJournal.tsx`

Small change only. In the entry row name section, add one conditional badge alongside the existing `is_excluded` badge:

```tsx
// Before (existing):
{e.is_excluded && <span style={{ background: T.excluded, color: "#fff", ... }}>対象外</span>}

// After:
{(e as JournalEntryResponseWithRecurring).is_recurring && (
  <span style={{ flexShrink: 0, fontSize: 9, fontWeight: 700, padding: "2px 7px",
    borderRadius: 6, background: "#E5EEF7", color: "#3F6B91",
    display: "inline-flex", alignItems: "center", gap: 3 }}>
    🔁 定期
  </span>
)}
{e.is_excluded && <span style={{ background: T.excluded, color: "#fff", ... }}>対象外</span>}
```

The `is_recurring` field won't be present until the backend ships — the badge simply won't appear until then (optional field, defaults to falsy).

---

## #8 Update `App.tsx` navigation

**File:** `frontend/src/App.tsx`

**Changes:**

1. Add import for `MobileBudget`, `MobileRecurring`, `MobileSavings`, `MobileIncome`

2. Add sub-screen state:
```typescript
type BudgetSubScreen = "hub" | "income" | "recurring" | "savings";
const [budget_sub, setBudgetSub] = useState<BudgetSubScreen>("hub");
```

3. Reset sub-screen when leaving budget tab:
```typescript
// In the tab change handler, before setActiveTab:
if (tab !== "budget") setBudgetSub("hub");
```

4. Replace the mobile `budget` tab render:
```tsx
// Before:
{active_tab === "budget" && <BudgetSettings />}

// After (mobile only):
{active_tab === "budget" && is_mobile && (() => {
  if (budget_sub === "income")    return <MobileIncome    onBack={() => setBudgetSub("hub")} />;
  if (budget_sub === "recurring") return <MobileRecurring onBack={() => setBudgetSub("hub")} />;
  if (budget_sub === "savings")   return <MobileSavings   onBack={() => setBudgetSub("hub")} />;
  return <MobileBudget onNavigate={setBudgetSub} />;
})()}
{active_tab === "budget" && !is_mobile && <BudgetSettings />}
```

5. The tab bar "＋" FAB on the income sub-screen should turn sage. Pass `add_tone` to `MobileTabBar`:
```typescript
// When on income sub-screen, addTone = "sage"; otherwise "coral"
const fab_tone = active_tab === "budget" && budget_sub === "income" ? "sage" : "coral";
```

---

## Swap checklist (when backend is ready)

> **Status: All frontend screens already use `api` from `client.ts` (real API client). The swaps below are complete.**

~~When each backend PR merges, do the following to wire up the real API:~~

| Backend PR | Frontend change | Status |
|---|---|---|
| B-1: 定期支出 API | `MobileRecurring.tsx` uses `api.listRecurringExpenses()` / `listPendingRecurring()` | ✅ Done |
| B-2: 貯金目標 API | `MobileSavings.tsx` uses `api.listSavingsGoals()` | ✅ Done |
| B-3: 収入記録 API | `MobileIncome.tsx` uses `api.listIncomeRecords()` / `getBaseIncome()` | ✅ Done |
| B-4: 予算ハブ + `is_recurring` | `MobileBudget.tsx` uses `api.getBudgetSummary()`; `is_recurring` will appear when B-4 lands | ✅ Hub done / `is_recurring` pending |

After all swaps, delete `src/api/mobile-mock.ts` and `src/api/mobile-types.ts` (types move into generated `types.ts`).

---

## Backend API remaining work

### B-4-a: Add `is_recurring` to `JournalEntryResponse` ← **do first**

The migration `000017_add_recurring_to_journal_entries.sql` already added `recurring_expense_id` to the
`journal_entries` table, but it is not yet exposed in the API response. The 🔁 badge in `MobileJournal.tsx`
depends on this field.

**Files to change:**

1. `backend/queries/journal_entries.sql`
   — Add `je.recurring_expense_id` to the `ListJournalEntriesByMonth` SELECT list

2. `backend/internal/db/journal_entries.sql.go` *(sqlc-generated — edit manually or re-run sqlc)*
   — Add `RecurringExpenseID *int32` to `ListJournalEntriesByMonthRow`
   — Add the field to the `rows.Scan(...)` call

3. `backend/internal/repository/journal_entries.go`
   — Add `RecurringExpenseID *int32` to `JournalEntryView`
   — Map the field in `ListJournalEntriesByMonth`

4. `backend/internal/handler/journal_entries.go`
   — Add `IsRecurring bool` to `journalEntryJSON`
   — Set `IsRecurring: e.RecurringExpenseID != nil` in `viewToJournalEntryJSON`

5. `docs/atoikura-api.yaml`
   — Add optional `is_recurring` boolean field to `JournalEntryResponse` schema

### B-4-b: Auto-post recurring expenses (job scheduler) — Issue #25 ✅ Done

Implemented daily scheduler in `backend/internal/job/recurring_poster.go`.
- Wakes at 08:00 JST each day (stdlib `time.Timer` loop; `robfig/cron` unavailable offline)
- Queries all `fixed` recurring expenses whose `billing_day` = today and not yet posted this month
- Inserts `journal_entries` with `recurring_expense_id` set
- Started from `cmd/server/main.go` via `poster.Start()` / `defer poster.Stop()`

Variable-type expenses remain as "pending" items; users confirm amount via the existing `MobileRecurring` UI (no auto-insert for variable type by design).

### B-5: Cleanup mock files ✅ Done

- Regenerated `frontend/src/api/types.ts` via `npm run gen:api` (adds `is_recurring?: boolean` to `JournalEntryResponse`)
- Removed cast to `JournalEntryResponseWithRecurring` in `MobileJournal.tsx` — now uses `e.is_recurring` directly
- Deleted `frontend/src/api/mobile-mock.ts`
- Deleted `frontend/src/api/mobile-types.ts`
