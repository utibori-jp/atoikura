# M2 Step 4: Home Screen Graph Frontend

## Goal

Build the home screen: a variable-cost cumulative line chart with month navigation.
This is the moment the core value becomes real — "今月俺はあといくら使えるか" is
visible at a glance.

The screen matches the design mockup at `docs/design/` (home screen screenshot).
Read it before implementing.

## Branch

`feature/m2` — same branch as all previous M2 steps. Do not create a new branch.

## Prerequisites

- Step 3 merged into `feature/m2` (budget settings works, `GET /expenses/daily-cumulative` works)
- Frontend dev server runs: `cd frontend && npm run dev`

## Reference

API contract: `docs/atoikura-api.yaml` under `/expenses/daily-cumulative`.
Spec §3-1 (ホーム画面) for layout and chart requirements.
Design mockup: `docs/design/` — home screen screenshot.

## Tasks

### 1. Install Recharts

```bash
cd frontend
npm install recharts
npm install -D @types/recharts  # if needed; Recharts ships its own types in recent versions
```

Confirm `npm run build` still passes after install.

### 2. Add API client method

Extend `frontend/src/api/client.ts`:

```ts
getDailyCumulative: (year_month?: string) => {
  const qs = year_month ? `?year_month=${year_month}` : '';
  return request<components['schemas']['DailyCumulativeResponse']>(
    `/expenses/daily-cumulative${qs}`,
  );
},
```

### 3. Build the HomeGraph component

Create `frontend/src/components/HomeGraph.tsx`.

#### Chart series (spec §3-1)

Four series, all plotted as lines on the same `<ComposedChart>`:

| Series key | Label | Source |
|---|---|---|
| `food` | 食費 | `day.food` |
| `other` | その他 | `day.other` |
| `total` | 合計 | `day.total` |
| `budget` | 基準 | `daily_budget × day_number` (frontend-calculated) |

The `budget` series is not in the API response — calculate it for every day:
`budget[i] = daily_budget * (i + 1)` where `i` is 0-based day index.

When `daily_budget == 0` (budget not set): the budget series is a flat line at 0.

#### Actual vs forecast distinction

Use a different visual style for forecast days (`is_actual: false`):
- One option: split each series into two `<Line>` segments (actual solid,
  forecast dashed) using `strokeDasharray`
- Another option: reduce opacity for the forecast portion using a `<defs>` gradient
  or segment coloring

Choose whichever approach renders clearly. The visual distinction must be apparent.

#### Tooltip

Use Recharts `<Tooltip>` with a `content` prop (custom renderer). The tooltip must
show all four series values for the hovered day at a glance:

```tsx
function CustomTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'white', border: '1px solid #ccc', padding: 8 }}>
      <p>{label}</p>
      {payload.map((entry) => (
        <p key={entry.name} style={{ color: entry.color }}>
          {entry.name}: ¥{entry.value?.toLocaleString()}
        </p>
      ))}
    </div>
  );
}
```

#### Budget-unset fallback

When `monthly_budget == 0`:
- Still render the chart (budget series flat at 0)
- Show an inline prompt **below the chart**: "予算を設定してください"
- Do **not** redirect or hide the chart; the journal entry form must still be accessible

#### Component sketch (illustrative)

```tsx
export function HomeGraph() {
  const [year_month, setYearMonth] = useState<string>(currentMonthJST());
  const [data, setData] = useState<DailyCumulativeResponse | null>(null);

  useEffect(() => {
    api.getDailyCumulative(year_month).then(setData).catch(...);
  }, [year_month]);

  const chart_data = buildChartData(data); // derive budget series, merge into day objects

  return (
    <section>
      <MonthNavigator value={year_month} onChange={setYearMonth} />
      {data && (
        <ComposedChart data={chart_data} ...>
          <XAxis dataKey="date" />
          <YAxis />
          <Tooltip content={<CustomTooltip />} />
          <Line dataKey="food" ... />
          <Line dataKey="other" ... />
          <Line dataKey="total" ... />
          <Line dataKey="budget" ... />
        </ComposedChart>
      )}
      {data?.monthly_budget === 0 && (
        <p>予算を設定してください</p>
      )}
    </section>
  );
}
```

`currentMonthJST()`:
```ts
function currentMonthJST(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' }).slice(0, 7);
}
```

### 4. Month navigation

Add a simple month navigation control (previous / current / next month):

```tsx
function MonthNavigator({ value, onChange }: { value: string; onChange: (ym: string) => void }) {
  // Prev/next month buttons. Do not navigate beyond the current month (no future months).
  // Display the month label (e.g. "2025年5月").
}
```

Rules:
- Default: current month in JST
- Allow navigating to any past month
- **Do not** allow navigating forward past the current month

### 5. Update App.tsx

Make the home screen the primary view. The journal entry form should remain
accessible on the home screen — keep it below the graph as the spec (§3-1) shows
(upper half: graph, lower half: entry form).

Rearrange `App.tsx` so:
- `HomeGraph` is at the top
- `JournalEntryForm` is below (as it was in M1, but now below the graph)
- `JournalEntryList` and `BudgetSettings` remain reachable (tab bar or navigation links)

Do not break any M1 functionality.

### 6. Manual end-to-end test

```
docker compose up -d db backend
cd frontend && npm run dev
```

1. Open `http://localhost:3000`.
2. Verify the home screen shows the graph for the current month.
3. Check that all four series (food, other, total, budget reference) are drawn.
4. Hover over a day — verify the custom tooltip shows all four values.
5. Verify past days are solid lines and future days use the forecast style (dashed/faded).
6. Navigate to a previous month — chart updates and all days show `is_actual: true` styling.
7. Navigate back to the current month.
8. With no budget set (`monthly_budget == 0`): verify the "予算を設定してください" message appears.
9. Set a budget via the budget settings screen. Return to home — message disappears, reference line is non-zero.
10. Verify the journal entry form below the graph still works (submit an entry, verify it appears in the list).

## Verification Checklist

- [ ] Home screen renders the cumulative chart for the current month on load
- [ ] All four series are drawn: food, other, total, budget reference
- [ ] Budget reference line = `daily_budget × day_number` for each day
- [ ] Tooltip shows all four series values when hovering
- [ ] Past/today days are visually distinct from forecast days
- [ ] Month navigation moves between months; current month is the forward limit
- [ ] Selecting a past month re-fetches and re-renders the chart
- [ ] `monthly_budget == 0`: flat reference line + "予算を設定してください" message
- [ ] `monthly_budget > 0`: reference line rises correctly; no unset message
- [ ] Journal entry form below the graph still works (no regression)
- [ ] Budget settings screen still reachable (no regression)
- [ ] `npm run build` passes with no TypeScript errors
- [ ] No `any` types introduced
- [ ] `prettier` and `eslint` pass

## Commit Plan

1. `chore(frontend): install recharts`
2. `feat(frontend/api): add getDailyCumulative client method`
3. `feat(frontend/components): add HomeGraph with 4-series chart and custom tooltip`
4. `feat(frontend/components): add MonthNavigator`
5. `feat(frontend): wire HomeGraph into App with journal form below`

## After Completion

Push `feature/m2` to origin. Confirm the Verification Checklist passes for **all
four steps** (re-run Step 1–3 smoke tests if needed), then open one PR from
`feature/m2` to `develop`:

```
gh pr create --base develop --head feature/m2 --title "feat(m2): home graph, budget endpoints, and budget settings UI"
```

## Out of Scope

- Master management UI (M3)
- Review screen (M4)
- Journal list edit/delete (M5)
- Chart library configuration beyond what Recharts provides out of the box
- Animations, transitions, or export features
- Tests (deferred beyond M2)
