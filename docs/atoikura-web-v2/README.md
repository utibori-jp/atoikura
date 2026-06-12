# Handoff: Atoikura Web Frontend

## Overview

Atoikura is a personal expense-tracking app whose core value proposition is:  
**"今月俺はあといくら使えるか、いつでも確認できる"** — always know exactly how much you have left to spend this month.

This handoff covers the **web (desktop) frontend** — a 1200px SPA with 8 screens. The mobile v2 app is already implemented; use its component structure, API integration patterns, and state management conventions as the primary reference. The web frontend extends mobile v2 with 3 new budget sub-screens (Issues #25 / #27 / #28 / #29).

---

## About These Design Files

The files in this bundle — `Atoikura App.html` and `src/*.jsx` — are **HTML/Babel prototypes created as visual references**, not production code. They use hardcoded mock data and a global-navigate hack. Your task is to **recreate these designs in the existing React codebase**, following the same conventions, routing, API hooks, and state management patterns already established in the mobile v2 implementation.

## Fidelity

**High-fidelity.** Every screen is pixel-complete with final colors, typography, spacing, shadows, and interactive states. Reproduce faithfully. The reference app runs at `Atoikura App.html` — open it in a browser to inspect live.

---

## Design Tokens

### Colors — "Soft & Sunny / Warm" palette

```ts
const theme = {
  bg:        "#FFF4E8",   // page background
  bgSoft:    "#FFFAF2",   // inner card backgrounds, pill tracks
  card:      "#FFFFFF",   // white cards
  ink:       "#2A2520",   // primary text
  inkSoft:   "#7A6B5E",   // secondary / label text
  hair:      "#F2E4D2",   // dividers, borders

  coral:     "#FF8A5C",   // primary action / accent
  coralDeep: "#F26B3F",   // button shadow / strong accent
  mustard:   "#FFC247",   // secondary warm accent
  sage:      "#7BC4A4",   // positive / income
  sageDeep:  "#4FA481",   // positive strong
  sky:       "#A6C9E2",   // tertiary chart line
  excluded:  "#C9B7A1",   // 対象外 (excluded) tag
};
```

### Typography

| Token | Font family | Weights used |
|---|---|---|
| `--font-jp` (body) | "M PLUS Rounded 1c", fallback system-ui | 400 500 700 800 900 |
| `--font-jp-display` (headings) | "Zen Maru Gothic", "M PLUS Rounded 1c" | 500 700 900 |
| `--font-num` (numbers) | "DM Sans" | 400 500 700 800 |
| `--font-mono` | "DM Mono" | 400 500 |

Import from Google Fonts:
```
M+PLUS+Rounded+1c:wght@400;500;700;800;900
DM+Sans:wght@400;500;700
Zen+Maru+Gothic:wght@500;700;900
DM+Mono:wght@400;500
```

### Spacing & Radii

| Token | Value |
|---|---|
| Page padding | 32px |
| Section gap | 24px |
| Card border-radius | 28–32px |
| Pill border-radius | 999px |
| Inner card / row radius | 16–24px |
| Tag / badge radius | 6–8px |
| Card box-shadow | `0 8px 24px -16px rgba(80,40,10,0.18)` |
| Soft shadow | `0 4px 20px -12px rgba(80,40,10,0.14)` |

### Layout

- Canvas width: **1200px**, centered horizontally
- All screens rendered at 1200px; page background fills the rest
- No responsive breakpoints in v1 (desktop-only)

---

## Navigation

The web app is a single-page application with **state-based routing** (no URL changes required in v1). Five top-level routes, plus three budget sub-routes:

```
home        → ホーム
budget      → 予算ハブ
  ├─ recurring  → 定期支出
  ├─ savings    → 貯金目標
  └─ income     → 収入記録
review      → 振り返り
journal     → 仕訳一覧
master      → マスタ管理
```

The 3 budget sub-screens are accessed by clicking the 3 tiles on the 予算 screen. They show a breadcrumb "予算 › [name]" that navigates back on click.

---

## Top Navigation Bar

**Component: `<NavBar active={route} />`**

Appears at the top of every screen. Structure left-to-right:

| Section | Contents |
|---|---|
| Left | App logo (44×44px coral rounded square, face icon) + "Atoikura" wordmark in `--font-jp-display` 22px 900 weight |
| Center | Pill group — 5 nav items on white card background, 6px padding, 999px radius, soft shadow |
| Right | Month picker chip ("2026年 5月 ▾") + avatar circle (sage, "K") |

**Nav item (each):** 10px 18px padding, 999px radius. Active = ink background / white text. Inactive = transparent / ink text. Font: 13px 600 weight. Emoji prefix (14px) + label. `transition: background 0.15s, color 0.15s`.

---

## Screen 1 — ホーム (`/home`)

**Layout:** Full-width 1200px column, 32px padding, 24px gap between sections.

### Row 1: Greeting card (left) + Area chart (right)

**Greeting card** (`flex: 0 0 360px`, white, 28px radius, `0 4px 20px -12px rgba(80,40,10,0.14)` shadow, 24px 28px padding)

- Top row: date "5月18日（月）" (12px inkSoft) + greeting "おかえりなさい！" (14px inkSoft 700) — flex space-between
- Label: "今月あといくら使える？" (13px inkSoft 500), marginTop 10px
- **Donut chart** (SVG, 240×240px, centered):
  - Track circle: r=96, stroke-width=26, color `#FFE8DD`
  - Spent arc: same r and stroke-width, gradient `mustard → coral`, `stroke-linecap="round"`, rotated -90° (starts 12 o'clock), fills `spentPct %` of circumference
  - Center overlay (absolutely positioned): amount in DM Sans 700 38px + "円" in display 17px 700, below: "残り **41%** · あと12日" (12px, % in coralDeep bold)

`spentPct = Math.round((SPENT_SO_FAR / MONTHLY_BUDGET) * 100)`
`remainingPct = 100 - spentPct`

**Area chart card** (`flex: 1`, white, 32px radius, same shadow, 28px padding)

- Header: title "変動費の累積" (display 18px 700) + subtitle (12px inkSoft) on left; legend pills on right
- Legend items: colored circle (14px) + label (13px inkSoft) — 合計 coral, 食費 mustard, その他 sky, 基準 sage dashed
- SVG area chart (760×300px):
  - Y grid lines: dashed `hair`, labels at 0 / 20k / 40k / 60k / 80k
  - Baseline (budget pace): sage dashed line from (day 1, ¥0) to (day 30, ¥80,000)
  - Total filled area: coral gradient fill (0.32 → 0 opacity) + 3.5px coral solid line
  - Food line: 2.5px mustard
  - Other line: 2.5px sky
  - Forecast continuation: 2.5px coralDeep dashed from today → month-end
  - Today marker: 1px ink vertical line + 7px white/coral circle at today's total
  - Today tooltip: ink rounded rect, white text, shows 今日 + amount

### Row 2: Stat pills (3-up)

Three equal-flex pills: 今日まで (coral), 月末予測 (mustard), 1日あたり (sage).

Each pill: 18px 22px padding, 24px radius.
- Label: 12px colored font weight 700
- Value: DM Sans 700 26px ink
- Sub: 12px inkSoft

### Row 3: 支出を記録 form card

White card, 32px radius, 28px padding.

Header: "支出を記録" (display 18px 700) + "サクッと入力してすぐ反映" (12px inkSoft) + "⌘ + Enter で保存" right-aligned (12px inkSoft)

Input row (gap 14px):
- 日付 (flex 0.7): date chip with 📅 icon, `hair` border, bgSoft fill, 16px radius
- 金額 (flex 0.6): coral border, "¥" prefix coralDeep 700 20px + amount DM Sans 700 20px
- 項目名 (flex 1.4): text input, hair border, bgSoft fill

Category row: "大分類" label (12px inkSoft 500) + pill group. First pill active coral. Pills have emoji prefix + group name.

Sub-category row: "生活区分" label + pills (mustard active).

Footer row: toggle switch (36×22px, hair track) + "集計から除外する" label; right side: キャンセル text button + "＋ 記録する" coral button (12px 28px padding, 999px radius, `0 6px 0 coralDeep` shadow).

---

## Screen 2 — 予算ハブ (`/budget`)

**Page header:** "今月の予算プラン" (display 30px 900) + subtitle (14px inkSoft) + month picker chip (right).

### Hero card (white, 32px radius, 32px padding, flex row)

**Left half** (`flex: 0 0 480px`, border-right `1.5px hair`):
- Label "今月の予算" (12px inkSoft 700 uppercase) + "自動" badge (bgSoft border, 10px inkSoft 700)
- Amount: DM Sans 800 **72px** coral + "円" display 24px 700 ink
- Sub: "変動費に使える金額（今月分）" (13px inkSoft)
- Progress bar: 8px, bgSoft track, `mustard→coral` gradient fill, 999px radius
- Footer: "使用済 ¥47,200（26%）" left + "残り ¥135,000" right (12px inkSoft DM Sans)

**Right half** (2×2 grid, `gap: 0`):
Four stat cells — 1日あたり / 今月の残り / 消化ペース / 収入−固定 — each with inner border (right on col 0, bottom on row 0). Each cell: 18px 22px padding, label 12px inkSoft 600, value DM Sans 800 26px, sub 11px inkSoft.

### 3 breakdown tiles (flex row, gap 16px)

Each tile: white card, 28px radius, 22px 24px padding, cursor pointer. Navigates to sub-screen on click.

| Tile | Route | Emoji | Sign | Amount |
|---|---|---|---|---|
| 収入 | `/income` | 💼 | + (green) | ¥323,200 |
| 定期支出 | `/recurring` | 🔁 | − (blue) | ¥96,000 |
| 貯金 | `/savings` | 💰 | − (mustard) | ¥45,000 |

Structure: emoji icon (46×46 tinted bg, 14px radius) + title (display 700 16px) + subtitle (12px inkSoft), then sign badge + amount (DM Sans 800 32px), "今月の合計" sub, "›" arrow bottom-right.

### Formula bar

`bgSoft` background, dashed `hair` border, 16px radius. Inline:  
`収入 ¥323,200` (green) `−` `定期支出 ¥96,000` (blue) `−` `貯金 ¥45,000` (mustard) `=` `今月の予算 ¥182,200` (coralDeep 15px 800)

### 直近3ヶ月 history (white card)

3 equal-flex cards (24px radius). 5月 ongoing: `#FFF1CC` bg + `mustard` border. Others: bgSoft + hair border.

Each card: month label (display 700 17px) + optional "進行中" badge (11px coralDeep 700), amount (DM Sans 700 22px), sub text, 8px progress bar (sage = ok, coral = over).

---

## Screen 3 — 振り返り (`/review`)

**Sub-title:** "5月の振り返り"

Month tabs: 3月 / 4月 / 5月 (active) / 6月 — `<APill>` components.

4-stat pill row: 変動費合計 (sage), 固定費合計 (mustard), 対象外 (coral), 総支出 (sage).

**Breakdown table** (white card, 32px radius, 28px padding):

3 sections: 変動費 (coral accent) / 固定費 (sageDeep) / 対象外 (excluded). Each section:
- Section header: colored 10px dot + type name (display 900 18px) + total (DM Sans 700 18px right-aligned)
- Group rows (alternating bgSoft / white): emoji + name (700 15px) + amount (DM Sans 700 16px) + ▾ if expandable
- Expanded sub-rows (paddingLeft 32px): category name (140px fixed) + amount (90px right-aligned) + memo field (editable, dashed border, `#FFF6E5` bg if filled)

---

## Screen 4 — 仕訳一覧 (`/journal`)

Header with month tabs + search chip + "＋ 追加" coral button.

**Day cards** (white, 28px radius, 24px padding) — one per day, descending:

- Day header: date square (60×60px, bgSoft, 20px radius, day number DM Sans 700 22px + month label) + day-of-week label + total amount (DM Sans 700 18px)
- Daily note: text field (dashed mustard if filled, dashed hair if empty), italic placeholder
- Entry rows: emoji icon (36×36 12px radius, `#FFE8DD`) + name + tags (🔁 定期 blue badge, 対象外 grey badge) + group · category sub-text + amount (DM Sans 700 16px, line-through if excluded) + ✎ 🗑 actions

---

## Screen 5 — マスタ (`/master`)

Tab bar: 大分類 (active) / 生活区分 — `<APill>` tabs.

**大分類 card**: 2-col grid. Each row: emoji icon (44×44 white shadow) + name + category count (12px inkSoft) + type badge (colored pill) + ✎ 🗑 icons.

**生活区分 card**: grouped by 大分類. Each group: emoji + group name header, then category chips (bgSoft, hair border, "✎" inline). "＋ 追加" dashed coral chip at end.

---

## Screen 6 — 定期支出 (`/recurring`) — Budget sub-screen

**Breadcrumb:** "予算 › 定期支出" — "予算" is a link back to `/budget`.

### 確認待ち section

Badge "💬 確認待ち" + count pill (coral). Side-by-side cards (one per pending item):
- Icon (46×46 `#FFE8DD` bg) + name + "要確認" pill + "前回 ¥X · 毎月Y日" sub
- "金額を確定する" full-width coral button, 14px radius

### 繰り返し設定 card (2-col grid)

Filter pills: 固定 / 要確認 / すべて (active). Each row: icon + name + date badge ("毎月X日" blue) + type badge (fixed = green, variable = mustard) + amount (DM Sans 700 16px) + ✎ 🗑 actions.

"＋ 定期支出を追加" — full-width dashed coral border button.

---

## Screen 7 — 貯金目標 (`/savings`) — Budget sub-screen

**Hero summary bar** (white card, flex row): "今月の貯金合計" label + ¥45,000 (DM Sans 800 52px coral) + vertical divider + goal summary chips (emoji + name + ¥/月 DM Sans).

**3-col goals grid** (each card: white, 28px radius, 24px padding):

- Icon (52×52, `#FFF1CC` bg) + name (700 16px) + ¥/月 badge (mustard) + status badge (✅ 今月済 green OR ⏳ 今月待ち mustard)
- Memo text (bgSoft, 12px radius, 13px inkSoft): "💭 {memo}"
- Progress section (bgSoft, hair border, 16px radius): "積立累計" + target + deadline labels, accumulated amount (DM Sans 700 22px mustard-tone) + percentage, 8px progress bar (mustard→coral gradient)

---

## Screen 8 — 収入記録 (`/income`) — Budget sub-screen

**Two-column layout** (`gap: 24px`):

**Left column** (`flex: 0 0 380px`) — summary card (white, 28px radius):
- "5月の収入合計" + total right-aligned
- Divider
- **基準収入** section: label (11px 700 uppercase) + ¥280,000 (DM Sans 800 32px ink) + "毎月の見込み・予算の元" + "✎ 基準収入を編集" ghost button
- Divider
- **余剰金額** section: label + "未振分" badge + `+¥43,200` (DM Sans 800 32px sageDeep) + "振り分ける →" mustard button (800 weight, `0 3px 0 #F0A92E` shadow)

**Right column** — month tabs + day-grouped income list:

Day cards (white, 24px radius): date square (50×50, 16px radius) + day total in sageDeep. Entry rows: icon (38×38 `#DEF1E6` bg) + name + type badge (給与 green / 副業 blue / ボーナス mustard / 一時収入 coral) + "基準" grey badge for salary + note sub-text + amount `+¥X` sageDeep + ✎ 🗑.

---

## Shared Components

### `<APill active tone onClick>`
- `border: 1.5px solid (active ? theme[tone] : hair)`, `background: active ? theme[tone] : #fff`, `color: active ? #fff : ink`
- `padding: 10px 16px`, `border-radius: 999px`, `font-size: 13px`, `font-weight: 600`
- Default tone: `"coral"`

### `<AStatPill tone label value sub>`
- Tones: coral → `#FFE8DD` bg / `coralDeep` fg; mustard → `#FFF1CC` / `#A3791F`; sage → `#DEF1E6` / `sageDeep`
- `padding: 18px 22px`, `border-radius: 24px`, `flex: 1`

---

## Interactions & Behavior

| Trigger | Action |
|---|---|
| Nav item click | Navigate to route, scroll to top |
| 予算 tile click | Navigate to sub-screen (`/recurring`, `/savings`, `/income`) |
| Breadcrumb "予算" click | Navigate back to `/budget` |
| 支出を記録 — group pill click | Filter sub-category pills to that group |
| 仕訳 — ✎ icon | Open edit inline or modal (consistent with mobile v2) |
| 仕訳 — 🗑 icon | Confirm + DELETE `/journal-entries/{id}` |
| Daily note field | Auto-save on blur → PUT `/notes/daily/{date}` (empty string = delete) |
| 基準収入を編集 | Inline edit or modal → PUT `/budgets` |
| 金額を確定する (recurring) | Open amount input → POST/PUT recurring entry |

---

## API Endpoints Used

See `uploads/spec.md` for full OpenAPI details. Key endpoints for the web screens:

| Screen | Endpoints |
|---|---|
| ホーム | `GET /expenses/daily-cumulative`, `POST /journal-entries`, `GET /category-groups`, `GET /expense-categories` |
| 予算 | `GET /budgets`, calculated client-side |
| 振り返り | `GET /expenses/monthly-breakdown`, `GET /notes/monthly-reviews`, `PUT /notes/monthly-reviews` |
| 仕訳 | `GET /journal-entries`, `PUT /journal-entries/{id}`, `DELETE /journal-entries/{id}`, `GET /notes/daily`, `PUT /notes/daily/{date}` |
| マスタ | `GET /category-groups`, `POST/PUT/DELETE /category-groups/{id}`, `GET /expense-categories`, `POST/PUT/DELETE /expense-categories/{id}` |
| 収入記録 | `GET /budgets` (base income), `GET /income-entries` (Ver2) |
| 定期支出 | `GET /recurring-entries` (Ver2) |
| 貯金目標 | `GET /savings-goals` (Ver2) |

> 収入, 定期支出, 貯金目標 are **Ver2 APIs** — use the mock data from `src/dirA-budget.jsx` as the shape definition and implement when backend is ready.

---

## State Management

Follow the same patterns as mobile v2. Suggested per-screen state:

```ts
// ホーム
const { data: dailyCumulative }  = useQuery(GET_DAILY_CUMULATIVE, { month })
const { data: categories }       = useQuery(GET_CATEGORIES)
const [entryForm, setEntryForm]  = useState<EntryFormState>({...})

// 予算ハブ
const { data: budget }           = useQuery(GET_BUDGET, { month })
// Derived: VARIABLE_BUDGET = income - fixedTotal - savingsTotal (client)

// 仕訳
const { data: entries }          = useQuery(GET_JOURNAL_ENTRIES, { month })
const { data: dailyNotes }       = useQuery(GET_DAILY_NOTES, { month })
```

---

## Files in This Bundle

| File | Purpose |
|---|---|
| `Atoikura App.html` | Browser-runnable prototype — open to inspect live |
| `src/shared.jsx` | Mock data, helper functions (`yen`, `yenSlim`, `smoothPath`), sample data |
| `src/dirA-home.jsx` | `AHomeScreen`, `ANavBar`, `APill`, `AStatPill`, `AAreaChart` |
| `src/dirA-budget.jsx` | `ABudgetScreen`, `ARecurringScreen`, `ASavingsScreen`, `AIncomeScreen` + budget data |
| `src/dirA-others.jsx` | `AReviewScreen`, `AJournalScreen`, `AMasterScreen` |
| `src/web-app.jsx` | Navigation shell (prototype-only, not for production) |
| `uploads/spec.md` | Full product spec: DB schema, API list, business logic |

---

## Notes for Claude Code

1. **Start with the design file open.** Run `Atoikura App.html` in a browser alongside the codebase — it's the definitive visual reference.
2. **Reuse mobile v2 components** wherever logic is identical (APill, AStatPill, form inputs, entry rows). Adapt for desktop density.
3. **The 1200px canvas is fixed for v1** — no responsive breakpoints needed.
4. **收入 / 定期支出 / 貯金 are Ver2 APIs** — stub with mock data matching the shapes in `dirA-budget.jsx`.
5. **Navigation state** should persist across refreshes (localStorage or URL hash).
6. **`is_excluded` entries** must be styled with strikethrough + `excluded` color in journal and excluded from the donut chart calculation.
7. **Recurring entries** marked with a 🔁 定期 badge in the journal list — use `statement_types` to identify them.
