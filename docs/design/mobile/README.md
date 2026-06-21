# Handoff: Atoikura — Mobile PWA

> **Status: implemented.** This is the current design reference for the mobile
> PWA UI (`frontend/src/components/mobile/`). See `../README.md` for how the
> design folder is organized.

## Overview
**Atoikura（あといくら）** is a personal budget-tracking PWA. Its core promise: *"今月あといくら使えるか"* — how much variable-cost budget remains this month — is always visible. That figure = `variable_monthly_budget − cumulative_variable_spend`. Fixed costs, savings, and excluded entries do not reduce it.

This bundle covers **v2 of the smartphone UI**: ten screens and eight bottom sheets at **402 × 874 px** (iPhone logical size), spread across two sections:
- **Section A — New screens** (Issues #25 / #27 / #28): 定期支出, 貯金目標, 収入記録, and their add/edit sheets.
- **Section B — Updated screens** (Issue #29): 目標 redesigned into a 予算ハブ; Journal updated with 🔁 recurring badge.

---

## About the Design Files
The `.html` / `.jsx` files here are **design references built in HTML + React** — browser-runnable prototypes for visual review. **They are not production code.** They use inline styles, browser-based Babel, and a pan-zoom "canvas" shell purely for review purposes.

Your task is to **recreate these screens faithfully in Atoikura's real codebase** using its established patterns (real React components, the repo's CSS system, routing, data layer). If no codebase exists yet, the intended stack is **React + TypeScript + Tailwind** (or CSS Modules); pick the project convention and build there.

**Ignore `_scaffold/`** (`design-canvas.jsx`, `tweaks-panel.jsx`, `ios-frame.jsx`) — these are review-only chrome, not part of the product.

---

## Fidelity
**High-fidelity.** Colors, typography, spacing, radii, shadows, and component states are finalized and intentional. The following sections define every value precisely — do not alter them unilaterally. All sample data (唐揚げ定食 ¥1,480, 旅行積立 ¥20,000, etc.) is placeholder — wire real API data.

---

## 1. Color Scheme

All colors defined in the `M` object in `src/mobile-home.jsx`. Ship the **warm palette** only.

| Token | Hex | Usage |
|---|---|---|
| `bg` | `#FFF4E8` | App background (warm cream) |
| `bgSoft` | `#FFFAF2` | Input fills, inset rows, pill tag backgrounds |
| `card` | `#FFFFFF` | All card surfaces including elevated hero cards |
| `ink` | `#2A2520` | Primary text; neutral large numerals |
| `inkSoft` | `#7A6B5E` | Secondary / label text; uppercase category labels |
| `hair` | `#F2E4D2` | Borders, dividers — use **1px** for card outlines on white, **1.5px** for input fields |
| `coral` | `#FF8A5C` | **Primary accent** — CTAs, active tab, FAB, active chips, hero amounts (savings/budget) |
| `coralDeep` | `#F26B3F` | Button drop-shadow, pressed state, emphasis |
| `coralSoft` | `#FFE8DD` | Coral tint — icon tiles, gauge track, pending cards |
| `mustard` | `#FFC247` | Savings/bonus accent, FAB for entry recording |
| `mustardDeep` | `#F0A92E` | Mustard text, mustard shadows |
| `mustardSoft` | `#FFF1CC` | Mustard tint — memo highlights |
| `sage` | `#7BC4A4` | Income / positive accent; "within budget" success; chart baseline |
| `sageDeep` | `#4FA481` | Sage text; income hero amounts; encouraging copy |
| `sageSoft` | `#DEF1E6` | Sage tint — income tiles, encouragement blocks |
| `sky` (blue) | bg `#E5EEF7` / fg `#3F6B91` | 定期支出 (recurring) badges |
| `excluded` | `#C9B7A1` | 対象外 (excluded) entry badges and icon tiles |

---

## 2. Typography

### Font families
```
--font-jp-display : "Zen Maru Gothic", "M PLUS Rounded 1c", system-ui, sans-serif
--font-jp         : "M PLUS Rounded 1c", "Hiragino Maru Gothic ProN", system-ui, sans-serif
--font-num        : "DM Sans", system-ui, sans-serif
```
Load from Google Fonts: `M PLUS Rounded 1c` (400/500/700/800/900), `Zen Maru Gothic` (500/700/900), `DM Sans` (400/500/700).

### Text levels

| Level | Font | Size | Weight | Color | Notes |
|---|---|---|---|---|---|
| Hero amount (large) | DM Sans | 40–50px | 800 | `coral` or `sageDeep` | `letterSpacing: -0.04em`, `lineHeight: 1` |
| Hero amount (medium) | DM Sans | 24px | 800 | `coral`, `sageDeep`, or `ink` | `letterSpacing: -0.03em` |
| Inline amount | DM Sans | 15–20px | 700 | `ink` or accent | — |
| Screen title (`big`) | Zen Maru Gothic | 24px | 900 | `ink` | `letterSpacing: -0.01em` |
| Logotype | Zen Maru Gothic | 19px | 900 | `ink` | Header only |
| Section header | Zen Maru Gothic | 15px | 700 | `ink` | — |
| Card title / item name | M PLUS Rounded 1c | 14–15px | 700 | `ink` | — |
| Hero label (uppercase) | M PLUS Rounded 1c | 10px | 700 | `inkSoft` | `letterSpacing: 0.08em`, `textTransform: uppercase` |
| Secondary label | M PLUS Rounded 1c | 11–12px | 600 | `inkSoft` | — |
| Caption / sub-label | M PLUS Rounded 1c | 10–11px | 500 | `inkSoft` | — |
| Chip / tag text | M PLUS Rounded 1c | 10–13px | 600–700 | varies | — |
| Button text | M PLUS Rounded 1c | 13–16px | 700–800 | `#fff` or `ink` | — |
| Day number in header | DM Sans | 20px | 700 | `ink` | — |
| Month / weekday | M PLUS Rounded 1c | 11px | 400 | `inkSoft` | — |

**Money formatting:** `¥` + `Number.toLocaleString('ja-JP')` → `¥47,200`. Large hero figures use `DM Sans` for the number; the 円 unit uses `Zen Maru Gothic` (when shown separately).

---

## 3. Shadow Parameters

### Standard card shadow (all non-hero `MCard`)
```css
box-shadow: 0 8px 24px -18px rgba(80, 40, 10, 0.25);
```

### **Elevated hero card shadow** (summary hero cards on 貯金目標, 予算ハブ, 収入記録)
```css
box-shadow:
  0 0 0 1px rgba(80, 40, 10, 0.05),   /* hairline ring — replaces a visible border */
  0 6px 32px rgba(80, 40, 10, 0.09);  /* wide, soft shadow for depth */
background: #FFFFFF;                   /* always pure white — no tint */
```
> This two-layer approach — a near-transparent 1px ring + a widespread low-opacity shadow — creates a floating, elevated effect without any color bleed, fully harmonious against the warm cream `#FFF4E8` app background.

### Tab bar shadow
```css
box-shadow: 0 -8px 24px -16px rgba(80, 40, 10, 0.18);
```

### Primary button / FAB "chunky" drop
```css
/* Standard button */
box-shadow: 0 6px 0 #F26B3F;

/* FAB (floating action button) */
box-shadow: 0 6px 0 #F26B3F, 0 12px 20px -8px rgba(242, 107, 63, 0.5);
```
> This solid-offset shadow is a signature brand detail — it compresses on press (reduce to `0 3px 0`).

### Bottom sheet shadow
```css
box-shadow: 0 -20px 50px -20px rgba(0, 0, 0, 0.3);
```

---

## 4. Spacing, Radius & Layout

### Base spacing (8px grid)
| Token | Value | Usage |
|---|---|---|
| Screen horizontal padding | `20px` | Body content inset |
| Card padding (standard) | `18px` | `MCard` default |
| Card padding (hero) | `22px 20px` | Hero summary cards |
| Card padding (compact) | `14px 16px` | List row cards |
| Gap between cards | `10px` | `flexDirection: column` card stacks |
| Gap between sections | `18–20px` (margin-top) | Section header spacing |
| Status bar clearance | `54px` | Header top padding (dynamic island) |
| Tab bar height | `86px` | Includes home indicator gap |

### Border radius
| Element | Radius |
|---|---|
| Card | `24px` |
| Large input / amount field | `18px` |
| Small input / info field | `14px` |
| Tile / icon block | `12–14px` |
| Pill chip | `999px` |
| Segmented control track | `14px`, option `10px` |
| FAB | `20px` |
| Badge | `6px` |
| Bottom sheet top corners | `32px` |

---

## 5. Component Specifications

### `MCard` — base card
```
background: #FFFFFF
border-radius: 24px
box-shadow: 0 8px 24px -18px rgba(80,40,10,0.25)
padding: 18px  (overridden per variant)
```

### Elevated hero card
Same as `MCard` but with the elevated shadow (see §3). No background tint. Always pure white.

### `MHeader` — screen header
```
background: bg (#FFF4E8)
padding-top: 54px (STATUS_H)
padding: 54px 20px 12px
z-index: 2

Left slot:
  - Default: MCoinMark (30px) + logotype "Atoikura" (Zen Maru 900 19px)
  - With `back` prop: pill button ‹ + parent screen name
    { padding: 7px 14px 7px 10px, borderRadius: 999, background: #FFFFFF,
      boxShadow: 0 2px 8px -4px rgba(80,40,10,0.20) }

Right slot:
  - Month pill (when showMonth=true): "5月 ▾", bg: card, fontSize 12, weight 600, inkSoft
  - Avatar: 34px circle, sage bg, white initial, weight 700

Big/sub variant (below the row):
  big text: Zen Maru Gothic 24px weight 900, letterSpacing -0.01em, color ink
  sub text: 13px, color inkSoft, marginTop 2px
```

### `MTabBar` — bottom navigation
```
height: 86px
background: card (#FFFFFF)
border-top: 1.5px solid hair (#F2E4D2)
padding: 10px 10px 0
box-shadow: 0 -8px 24px -16px rgba(80,40,10,0.18)

5 slots: ホーム 🌞 | 振り返り 📖 | ＋ (FAB) | 仕訳 📝 | 予算 💴

FAB (center):
  size: 58×58, border-radius: 20px, translateY(-14px)
  default (expense): background coral, shadow 0 6px 0 coralDeep + glow
  income screens: background sage, shadow 0 6px 0 sageDeep + glow

Active tab: icon full-color + label coralDeep, fontSize 10, weight 700
Inactive:   icon filter grayscale(0.6) opacity(0.55) + label inkSoft
```

### `MSheetShell` — bottom sheet wrapper
```
Backdrop: fadedScreen at filter:blur(1.5px) opacity:0.55 + rgba(42,37,32,0.45) scrim
Sheet:
  background: card (#FFFFFF)
  border-top-left-radius: 32px
  border-top-right-radius: 32px
  padding: 12px 20px 28px
  max-height: 90vh, overflow-y: auto
  box-shadow: 0 -20px 50px -20px rgba(0,0,0,0.3)

Grab handle: 42×5px, borderRadius 999, background hair, centered, marginBottom 14px
Title row: Zen Maru Gothic 19px weight 900 + ✕ close (30px circle, bgSoft)
```

### Pill chips (category / month selectors)
```
Active:   background coral, color #fff, border 1.5px solid coral
Inactive: background #fff, color ink, border 1.5px solid hair
Padding: 8px 16px, border-radius: 999px, font-size: 13px, weight: 600
```

### Pill tags (on elevated hero cards)
```
background: bgSoft (#FFFAF2)
border: 1px solid hair (#F2E4D2)
color: ink (#2A2520), numeric part inkSoft (#7A6B5E)
padding: 5px 10px
border-radius: 999px
font-size: 10px, weight: 700
```

### Status badge pills (colored)
```
Fixed / confirmed:  bg sageSoft  (#DEF1E6),  fg sageDeep   (#4FA481)
Pending / warning:  bg mustardSoft(#FFF1CC), fg mustardDeep (#F0A92E)
Alert / required:   bg coral     (#FF8A5C),  fg #FFFFFF
Recurring (定期):   bg #E5EEF7,              fg #3F6B91
Excluded (対象外):  bg excluded   (#C9B7A1),  fg #FFFFFF
```

### Progress bar
```
Track:    height 7px, border-radius 999, background bgSoft (#FFFAF2)
Fill:     border-radius 999
  Within budget: sage (#7BC4A4)
  Over budget:   coral (#FF8A5C)
```

### Primary action button
```
width: 100%
background: coral (#FF8A5C)
color: #FFFFFF
padding: 16px
border-radius: 18px
font-family: M PLUS Rounded 1c
font-size: 16px, weight: 700
box-shadow: 0 6px 0 #F26B3F
border: none
```

### Dashed add button
```
width: 100%
background: transparent
border: 1.5px dashed coral (#FF8A5C)
color: coralDeep (#F26B3F)
padding: 15px, border-radius: 16px
font-size: 15px, weight: 700
```

---

## 6. Navigation

**Tab bar** (5 slots): **ホーム** 🌞 · **振り返り** 📖 · **＋** · **仕訳** 📝 · **予算** 💴

- **＋ FAB** → Expense Entry bottom sheet (default coral). On income screens the FAB turns sage.
- **予算 tab** → 予算ハブ (03v3). From there: tap 収入 tile → 収入記録 (09), tap 定期支出 tile → 定期支出 (07), tap 貯金 tile → 貯金目標 (08).
- **Back navigation**: pill button in header (`‹ 親画面名`), returns to referrer.
- **Bottom sheets** slide up from any screen and dim the background.

---

## 7. Screens

### 01 — ホーム · `MHomeScreen`
**Component tree:**
```
MScreen (active="home")
  MHeader (title="Atoikura", showMonth)
  body:
    MCard (hero ring)
      caption "今月あといくら使える？"
      MRing (200px ring gauge)
        track: coralSoft | progress: mustard→coral gradient arc
        center: remaining amount (DM Sans 42px) + 円 (Zen Maru 16px)
              + "残り NN% · あとN日"
      encouragement line (sageDeep, 🌞/🌧)
    flex row — 3× MMiniStat (coral/mustard/sage tints)
    MCard
      chart header + legend
      MMiniChart (322×150 area chart)
    section header "今日の記録" + "すべて見る →"
    MCard
      entry rows (emoji tile 38px + name + category + amount)
  MTabBar
```

**Ring gauge (`MRing`):** SVG, 200px, 18px stroke, `rotate(-90deg)`. Arc = remaining fraction of circumference. Daily budget is client-derived: `monthly_budget ÷ days_in_month` — never stored.

**Chart (`MMiniChart`):** 322×150, Catmull-Rom smooth path. Baseline = dashed sage line. Actual = coral solid + gradient fill. Forecast (today→month-end) = dashed coralDeep. Today marker = 5px white dot, 3px coral ring. Y-axis ticks: 0 / 40k / 80k.

---

### 02 — 支出入力 · `MEntryScreen`
**Component tree:**
```
div (relative)
  MHeader (blurred backdrop)
  scrim rgba(42,37,32,0.45)
  bottom sheet:
    grab handle
    title "支出を記録" + ✕
    amount field (coral 1.5px border, DM Sans 30px)
    row: 項目名 (flex) | 日付 (116px fixed)
    大分類 label → horizontal-scroll chip row
    生活区分 label → wrapping chip row (filtered by 大分類)
    除外 toggle (42×25 pill) + label
    primary button "＋ 記録する"
```

---

### 03v3 — 予算ハブ · `MBudgetScreen` *(redesigned from 目標)*
**Component tree:**
```
MScreen (active="goals")
  MHeader (title="予算", showMonth, big="今月の予算プラン", sub="収入から自動で算出")
  body:
    ── Elevated hero card ──
      label "今月の予算" (uppercase 10px inkSoft) + "自動" badge (bgSoft+hair border)
      amount: VARIABLE_BUDGET (DM Sans 800 50px coral)
      sub "変動費に使える金額（今月分）"
      hairline divider
      row:
        left: "1日あたり" (label 10px uppercase) + amount (DM Sans 800 24px coral)
        right: "今月の残り" (label) + days (DM Sans 800 24px ink)
    ──────────────────────
    section header "予算の内訳" + "タップで詳細"
    3× nav tile MCard (収入/定期支出/貯金):
      icon tile (46px, tinted bg) + title + sub + sign badge + amount + › chevron
    formula line (dashed border, bgSoft)
    section header "貯金の目的"
    MCard (memo card)
    section header "直近3ヶ月の予算"
    3× MCard (month + progress bar + emoji)
  MTabBar
```

**Key formula:** `VARIABLE_BUDGET = 収入合計 − 定期支出合計 − 貯金合計`

---

### 04 — 振り返り · `MReviewScreen`
**Component tree:**
```
MScreen (active="review")
  MHeader (title="振り返り", big, sub)
  body:
    month chip row (horizontal scroll, current = coral)
    2-row grid: 4× MMiniStat (変動費/固定費/対象外/総支出)
    3× breakdown section (変動費/固定費/対象外):
      section header (color dot + type + total)
      MCard per 大分類:
        emoji + name + amount + ▾/▴ caret
        [expanded] category rows:
          name + amount
          memo field (💭, mustardSoft+dashed if present, bgSoft+dashed if empty)
  MTabBar
```

---

### 05v2 — 仕訳一覧 · `MJournalScreenV2`
**Component tree:**
```
MScreen (active="journal")
  MHeader (title="仕訳一覧", big="日々の記録")
  body:
    month chip row
    day groups (date-descending):
      day header: DM Sans 20px day + "5月 曜日" + day total (excluded entries omitted)
      MCard:
        [daily memo if present] — mustardSoft + mustard dashed border
        entry rows:
          emoji tile 36px (excluded → #F4E9DC)
          name + "🔁 定期" badge (sky) + "対象外" badge (excluded)
          生活区分 · note
          amount (excluded → inkSoft + line-through)
  MTabBar
```

---

### 06 — マスタ管理 · `MMasterScreen`
**Component tree:**
```
MScreen (active="goals")
  MHeader (title="マスタ管理", big, sub)
  body:
    segmented control (大分類 active | 生活区分)
    list of 大分類 MCards:
      emoji tile (42px bgSoft) + name + "N区分" + analysis-group badge + › chevron
    dashed add button "＋ 大分類を追加"
  MTabBar
```

---

### 07 — 定期支出 · `MRecurringScreen`
**Component tree:**
```
MScreen (active="goals")
  MHeader (back="予算", big="定期支出", sub)
  body:
    "💬 確認待ち" header + count badge (coral) + "5月分"
    N× pending confirmation MCard (coralSoft border):
      emoji tile (40px coralSoft) + name + "要確認" badge + previous amount
      "金額を確定" button (coral, 0 4px 0 coralDeep)
    section header "繰り返し設定" + count
    N× template MCard:
      emoji tile (42px bgSoft) + name
      "毎月N日" badge (sky) + "固定|要確認" badge (sage|mustard)
      amount (or "—") + edit/delete icon buttons (26px bgSoft tiles)
    dashed add button "＋ 定期支出を追加"
  MTabBar
```

---

### 07b — 定期支出を追加 · `MRecurringSheetScreen`
**Component tree:**
```
MSheetShell (title="定期支出を追加", fadedScreen=MRecurringScreen)
  項目名 field (bgSoft, hair border)
  大分類 label → horizontal chip row
  生活区分 label → wrapping chip row
  row: 金額（任意） | 毎月N日 (fixed 116px)
  タイプ segmented control (固定 | 要確認) — active = coral
  メモ field
  "保存する" button (coral)
```

---

### 08 — 貯金目標 · `MSavingsScreen`
**Component tree:**
```
MScreen (active="goals")
  MHeader (back="予算", big="貯金目標", sub)
  body:
    ── Elevated hero card ──
      label "今月の貯金合計" (uppercase 10px inkSoft)
      amount: SAVINGS_TOTAL (DM Sans 800 40px coral)
      sub "毎月自動で記録されます" (11px inkSoft)
      pill tag row: one tag per goal (emoji + Nk)
        [each tag: bgSoft fill + 1px hair border + ink text]
    ──────────────────────
    section header "目標一覧" + count
    N× goal MCard:
      row: emoji tile (42px mustardSoft) + name
           "¥N/月" badge (mustardSoft/mustardDeep)
           "✅ 今月済 | ⏳ 今月分待ち" badge
           edit/delete buttons (26px bgSoft)
      memo block (bgSoft, 💭)
      progress section:
        "積立累計" label | "目標 ¥N / YYYY/MM" label
        accumulated amount (DM Sans 700 20px mustardDeep) + / N%
        progress bar (sage→coral gradient fill)
    dashed add button "＋ 貯金目標を追加"
  MTabBar
```

---

### 08b — 貯金目標を追加 · `MSavingsSheetScreen`
**Component tree:**
```
MSheetShell (title="貯金目標を追加", fadedScreen=MSavingsScreen)
  目標名 field
  emoji picker (6 options, selected = mustardSoft/mustard border)
  毎月の積立額 field (mustard 1.5px border, DM Sans 28px)
  row: 目標金額（任意） | 目標日（任意） (fixed 138px)
  メモ field (minHeight 64px)
  "保存する" button (coral)
```

---

### 09 — 収入記録 · `MIncomeScreen`
**Component tree:**
```
MScreen (active="goals", addTone="sage")
  MHeader (back="予算", big="収入記録", sub)
  body:
    ── Elevated hero card ──
      header row: "5月の収入合計" (uppercase 10px inkSoft) + total + count
      hairline divider
      two-column split:
        LEFT — 基準収入:
          label "基準収入" (uppercase 10px inkSoft)
          amount (DM Sans 800 24px ink)
          sub "毎月の見込み・予算の元"
          "✎ 編集" button (bgSoft fill + hair border, inkSoft text)
        vertical hairline divider
        RIGHT — 余剰金額:
          label "余剰金額" (uppercase 10px inkSoft) + "未振分" badge (bgSoft+hair border)
          amount (DM Sans 800 24px sageDeep, with "+" prefix)
          sub "基準を超えた今月の上振れ"
          "振り分ける →" button (mustard bg, ink text, 0 3px 0 mustardDeep)
    ──────────────────────
    section header "収入の記録"
    month chip row
    day groups (date-descending):
      day header: DM Sans 20px + weekday + day total (sageDeep)
      MCard:
        entry rows:
          emoji tile (36px sageSoft) + name + type badge + "基準" badge if salary
          note
          amount (DM Sans 700 15px sageDeep with "+" prefix)
  MTabBar (FAB = sage)
```

---

### 09b — 収入を記録 · `MIncomeSheetScreen`
**Component tree:**
```
MSheetShell (title="収入を記録", fadedScreen=MIncomeScreen)
  金額 field (sage 1.5px border, DM Sans 30px sageDeep ¥)
  row: 収入名 (flex) | 日付 (fixed 116px)
  種別 label → wrapping chip row (salary/side/bonus/oneoff)
  メモ field
  "＋ 記録する" button (coral)
```

---

### 09c — 余剰を振り分ける · `MAllocateSheetScreen`
**Component tree:**
```
MSheetShell (title="余剰を振り分ける", fadedScreen=MIncomeScreen)
  振り分け額 field (mustard 1.5px border, DM Sans 28px) + 全額/½/¥N,000 quick-fill chips
  振り分け先 label → 2× radio cards (貯金 | 今月の予算に追加)
    selected card: coralSoft fill + coral border
  [when 貯金 selected] goal selector (N× mini cards, selected = coral border)
  メモ field
  "＋ 記録する" button (coral)
```

---

### 09d — 基準収入を編集 · `MEditBaseSheetScreen`
**Component tree:**
```
MSheetShell (title="基準収入を編集", fadedScreen=MIncomeScreen)
  基準収入 field (sage 1.5px border, DM Sans 34px sageDeep ¥)
  info block (sageSoft, 💡, explanation text)
  3× preset chips (先月 / 3ヶ月平均 / 半年平均) — selected = sageSoft + sage border
  "保存する" button (coral)
```

---

## 8. Behavior & State

| Concern | Rule |
|---|---|
| **Daily budget** | `monthly_budget ÷ daysInMonth`, client-computed, never stored; recalculates instantly on budget or month change |
| **Variable budget** | `収入合計 − 定期支出合計 − 貯金合計`, client-computed for 予算ハブ hero |
| **Excluded entries** | Removed from: Home remaining calc, chart, day totals. Re-bucketed under 対象外 in Review. Shown in Journal with line-through + inkSoft |
| **Recurring 🔁** | Journal rows with `is_recurring=true` show the `🔁 定期` sky badge |
| **大分類 → 生活区分** | Client-side filtering; masters fetched once at boot |
| **Sheet animations** | Slide-up from bottom, easing `ease-out`. Backdrop fades to `rgba(42,37,32,0.45)`. Duration ≈ 280ms. No heavy/looping animations |
| **Button press** | Compress `0 6px 0` shadow to `0 3px 0` on `:active` |
| **Month selector** | Horizontal scroll chips; current month pre-selected (coral); historical months fetchable |

---

## 9. Reference Data Shapes

From `src/shared.jsx` (placeholder values — wire real API):

```ts
// 大分類 (Category group)
{ id: number, name: string, emoji: string, code: string }

// 生活区分 (Sub-category)
{ id: number, group: number, name: string, type: "food" | "other" | "fixed" | "excluded" }

// Journal entry
{ id: number, date: "YYYY-MM-DD", amount: number, name: string,
  group: number, cat: number, excluded: boolean, note: string }

// Savings goal
{ id: number, name: string, emoji: string, monthly: number,
  target: number, accumulated: number, deadline: string | null,
  posted: boolean, memo: string }

// Recurring template
{ id: number, name: string, emoji: string, day: number,
  amount: number | null, type: "fixed" | "variable", group: number, cat: number }

// Income entry
{ id: number, date: "YYYY-MM-DD", amount: number, name: string,
  type: "salary" | "side" | "bonus" | "oneoff", emoji: string, note: string }
```

**Helpers:**
- `yen(n)` → `¥12,345`
- `yenSlim(n)` → `12,345` (no ¥ prefix, for inline composition)
- `smoothPath(points)` → Catmull-Rom `<path d>` string for the chart

---

## 10. Assets

- **App icons:** `pwa-icons/` — PNG set (96/144/192/384/512 standard + 192/512 maskable), `apple-touch-icon-180.png`, favicons (16/32), `manifest.json`, and `HTML-snippet.txt`. Master vector: `Atoikura Icon.html` (not bundled).
- **Fonts:** Google Fonts CDN — `M PLUS Rounded 1c`, `Zen Maru Gothic`, `DM Sans`.
- **Category icons:** System emoji — intentional and on-brand. Do not swap for an icon library.
- **Brand mark (`MCoinMark`):** Coral rounded square (border-radius ≈ 32% of size) containing a smiling gold coin SVG, with `0 3px 0 coralDeep` drop shadow. Used in the Home header.

---

## 11. Files in This Bundle

| File | What it is |
|---|---|
| `Atoikura Mobile.html` | Entry point — open in browser to view all screens (requires internet for fonts + CDNs) |
| `src/shared.jsx` | Sample data, `M` palette object is in `mobile-home.jsx`, money formatters, `smoothPath` |
| `src/mobile-home.jsx` | **`M` design token object**, shared chrome (`MHeader`, `MTabBar`, `MScreen`, `MRing`, `MMiniChart`, `MMiniStat`, `MCard`, `MCoinMark`), Home (01), Entry sheet (02) |
| `src/mobile-others.jsx` | Goals/03 (legacy), Review/04, Journal/05, Master/06 |
| `src/mobile-recurring.jsx` | 定期支出 (07), add sheet (07b), Journal v2 (05v2), `MSheetShell` pattern |
| `src/mobile-savings.jsx` | 貯金目標 (08), add sheet (08b) |
| `src/mobile-income.jsx` | 収入記録 (09), record sheet (09b), allocate sheet (09c), edit-base sheet (09d) |
| `src/mobile-goals-v2.jsx` | 予算ハブ (03v3) |
| `src/mobile-app-v2.jsx` | Design-canvas assembly of all screens (review-only) |
| `_scaffold/` | Review-only chrome — **not part of the product** |
| `pwa-icons/` | Production icon set + web manifest |

**To preview:** open `Atoikura Mobile.html` in a browser (internet connection required).

---

## 12. Implementation Notes for Claude Code

1. **Start with `M` tokens.** The `M` object in `src/mobile-home.jsx` is the single source of truth for all colors. Convert it to CSS custom properties or your styling system's token file first.

2. **Shared chrome first.** `MHeader`, `MTabBar`, `MScreen`, `MCard`, and `MSheetShell` are used on every screen — implement them as reusable components before building individual screens.

3. **Elevated hero card is distinct from `MCard`.** It uses the two-layer shadow (`0 0 0 1px rgba(80,40,10,0.05), 0 6px 32px rgba(80,40,10,0.09)`) and always has a pure white background. Do not apply a color tint.

4. **Typography hierarchy on hero cards:** labels above amounts use `textTransform: uppercase`, `letterSpacing: 0.08em`, `fontSize: 10px`, `fontWeight: 700`, `color: inkSoft`. Amounts use DM Sans `fontWeight: 800`, `letterSpacing: -0.04em`.

5. **The FAB changes color** between screens: coral (default/expense), sage (income screens). Wire this via a screen-level prop.

6. **Do not ship the canvas or tweaks panel.** Everything inside `_scaffold/` is review infrastructure only.

7. **Sample data is placeholder.** Replace all hardcoded arrays (`ENTRIES`, `SAVINGS_GOALS`, `INCOMES`, `RECURRING`, etc.) with API calls.
