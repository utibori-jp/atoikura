# Handoff: Atoikura — Mobile (PWA) UI

## Overview
**Atoikura（あといくら）** is a personal expenditure-tracking PWA. Its single core promise: *"今月あといくら使えるか"* — **how much of this month's budget is still spendable** — is visible at a glance, any time. That "remaining" figure is computed from the **variable-cost monthly budget minus cumulative variable-cost spend only**. Income is never part of the math; fixed costs and "excluded" entries don't reduce the remaining figure.

This bundle is the **smartphone (PWA) UI** — six device-framed screens at **402 × 874** (iPhone logical size). It is the mobile end of a responsive product; a separate desktop layout exists but is **out of scope for this handoff**.

## About the Design Files
The `.html` / `.jsx` files here are **design references created in HTML/React** — prototypes that show intended look, layout, and behavior. **They are not production code to copy directly.** They run React + Babel **in the browser**, use **inline styles**, and wrap each screen in a presentation device-frame + pan/zoom "canvas" purely for review.

Your task is to **recreate these screens in Atoikura's real codebase** using its established patterns — real React components, the repo's actual styling system (CSS Modules / Tailwind / styled-components / etc.), its routing, and its data layer. If no codebase exists yet, the intended stack is **React (frontend) + Go (backend) + PostgreSQL**; pick the project's conventions and build there.

**Ignore the scaffold files** in `_scaffold/` (`design-canvas.jsx`, `tweaks-panel.jsx`, `ios-frame.jsx`) — they are review-only chrome (the canvas, the Tweaks palette switcher, the phone bezel), **not** part of the product. The palette switcher (warm/berry/ocean) is a design-review aid; ship only the **warm** palette unless told otherwise.

## Fidelity
**High-fidelity (hifi).** Colors, typography, spacing, radii, shadows, and component states are final and intentional. Recreate the UI pixel-faithfully at a 402px-wide base. All sample names and amounts (唐揚げ定食 ¥1,480, etc.) are **placeholder data — do not ship them**; wire real data from the API.

---

## Design Tokens (warm palette — ship this one)

| Token | Hex | Use |
|---|---|---|
| `bg` | `#FFF4E8` | App background (warm cream) |
| `bgSoft` | `#FFFAF2` | Input fills, inset rows |
| `card` | `#FFFFFF` | Card surfaces |
| `ink` | `#2A2520` | Primary text; dark "budget" hero surface |
| `inkSoft` | `#7A6B5E` | Secondary text |
| `hair` | `#F2E4D2` | Borders & dividers (**1.5px**, intentionally soft) |
| `coral` | `#FF8A5C` | **Primary** — buttons, active chips, cumulative line, FAB |
| `coralDeep` | `#F26B3F` | Button drop-shadow, pressed, emphasis numerals |
| `mustard` | `#FFC247` | Secondary accent, coin, daily-budget figure |
| `mustardDeep` | `#F0A92E` | Mustard text |
| `sage` | `#7BC4A4` | Tertiary, baseline line, "within budget" success |
| `sageDeep` | `#4FA481` | Sage text, encouraging copy |
| `sky` | `#A6C9E2` | "Other" chart series / badge |
| `excluded` | `#C9B7A1` | 対象外 (excluded) items |
| `coralSoft` | `#FFE8DD` | Coral tint (chips, gauge track, icon tiles) |
| `mustardSoft` | `#FFF1CC` | Mustard tint (memo highlight) |
| `sageSoft` | `#DEF1E6` | Sage tint (positive notes) |

### Typography (Google Fonts)
- **Display / headings** — `Zen Maru Gothic` (700 / 900): screen titles, card titles, the logotype, the 円 unit.
- **Body / UI** — `M PLUS Rounded 1c` (400 / 500 / 700 / 800 / 900): labels, chips, list text, buttons.
- **Numerals / money** — `DM Sans` (700): every ¥ amount, dates, axis labels. Slight negative tracking on big figures (`-0.03em`).
- Money format: `¥` + `Number.toLocaleString('ja-JP')` → `¥47,200`. The hero figure splits the number (`DM Sans`) from the 円 unit (`Zen Maru Gothic`).

### Radius / shadow / spacing
- **Radius:** cards `24px`; small tiles/inputs `12–18px`; pills & chips `999px`; segmented control `10–14px`; FAB `20px`.
- **Card shadow:** `0 8px 24px -18px rgba(80,40,10,0.25)`.
- **Tab bar shadow:** `0 -8px 24px -16px rgba(80,40,10,0.18)`.
- **Primary button / FAB "chunky" drop:** `box-shadow: 0 6px 0 {coralDeep}` (the FAB adds `, 0 12px 20px -8px rgba(242,107,63,0.5)`). This solid offset shadow is a signature of the brand — keep it; it compresses on press.
- **Spacing:** 8px base. Screen body horizontal padding **20px**. Card padding **18px** (some heros `22px 18px`). Inter-element gaps 8–16px.

### Layout chrome (per screen)
- **Status-bar clearance:** header top padding **54px** (`STATUS_H`) to clear the dynamic island.
- **Bottom tab bar height:** **86px** (`TABBAR_H`), incl. home-indicator gap.
- Each screen = a flex column: fixed header → **scrollable body** (`overflow-y:auto`, the only scroll region) → pinned tab bar.

### Iconography
- Category icons are **emoji** and that is intentional/on-brand — keep them, don't swap for an icon set: 食費 🍙 · 日用品 🧺 · 交通 🚃 · 趣味・娯楽 🎈 · 交際 🍻 · 美容・健康 🌿 · 固定費 🏠 · 特別費 🎁.
- **App / brand mark** (`MCoinMark`): a coral rounded-square (radius ≈ 32% of size) carrying a smiling gold coin, with a `0 3px 0 {coralDeep}` drop. Inline SVG in headers; production PNGs in `pwa-icons/`.

---

## Navigation
**Bottom tab bar**, 5 slots, left→right: **ホーム** 🌞 · **振り返り** 📖 · **＋** · **仕訳** 📝 · **目標** 🎯.
- The center **＋** is a raised coral FAB (58×58, radius 20, `translateY(-14px)`) that opens the **Expense Entry bottom sheet** (screen 02).
- Active tab: icon full-color + label in `coralDeep`. Inactive: icon `grayscale(0.6) opacity(0.55)` + label `inkSoft`.
- **マスタ管理** (screen 06) has no dedicated tab — it's reached from the 目標 area (its tab bar highlights 目標).
- Touch targets ≥ 44px. Horizontal chip rows scroll (`overflow-x:auto`).

---

## Screens

### 01 — Home (ホーム)  ·  `MHomeScreen`
**Purpose:** see remaining budget at a glance; jump to recording.
- **Header:** coin mark + "Atoikura" (Zen Maru 900, 19px), month pill (`5月 ▾`), avatar (34px sage circle, initial).
- **Hero ring card:** caption *"今月あといくら使える？"*, then a **200px ring gauge** (`MRing`): 18px stroke, track = `coralSoft`, progress = a `mustard→coral` gradient arc, `round` caps, rotated −90° so it starts at top. The arc length represents **remaining %** (dashoffset = circumference × spent-fraction). Centered: remaining number (`DM Sans` 42px) + 円 (Zen Maru 16px), then `残り NN% · あとN日`. Below: a `sageDeep` encouraging line with 🌞 (`いいペースです、その調子！` when on-track, else `少し抑えめにいきましょう`).
- **Three mini stat chips** (`MMiniStat`, equal flex): 使った (coral tint) / 月末予測 (mustard tint) / 1日 (sage tint). Each = tiny colored label + `DM Sans` 18px value.
- **Chart card** (`MMiniChart`, see below) titled 変動費の累積, with a 実績(coral)·基準(sage) legend.
- **"今日の記録"** section header + "すべて見る →", then a card listing today's entries: emoji tile (38px, coralSoft) + name + `大分類 · 生活区分` + `DM Sans` amount; hairline divider between rows.

### 02 — Expense Entry sheet (支出入力)  ·  `MEntryScreen`
**Purpose:** the ＋ action. A **bottom sheet** over a dimmed/blurred Home.
- Backdrop: Home blurred + `rgba(42,37,32,0.45)` scrim.
- Sheet: white, top corners radius **32**, 42×5 grab handle, title "支出を記録" + ✕ close.
- **Amount field** (big): `bgSoft` fill, **1.5px coral border**, radius 18, `¥` (coralDeep) + amount both `DM Sans` 30px, trailing "金額" label.
- **Row:** 項目名 (flex) + 日付 (fixed 116px) — each a `bgSoft` field, 1.5px hair, radius 14.
- **大分類** label → horizontal-scroll chip row (emoji + name). Selected chip = coral fill, white text, coral border; others = white fill, hair border.
- **生活区分** label → wrap chip row, **filtered by the selected 大分類**. Selected = `mustardSoft` fill, mustard border.
- **除外 toggle** (42×25 pill switch) + "集計から除外する（記念日など）".
- Full-width primary button **＋ 記録する** (coral, white, radius 18, `0 6px 0 coralDeep`).

### 03 — Goals (目標)  ·  `MGoalsScreen`
**Purpose:** set the savings goal + the monthly variable-cost budget.
- Header uses `big`/`sub` variant: 目標を整える / 無理せず続けられるラインで, no month pill.
- **Budget hero card** on a **dark `ink` surface** (white text, a faint coral circle bleeding off top-right): label 変動費の月次予算 → big editable `DM Sans` 44px figure + 円 + a "編集 ✎" pill. Divider. Then **1日あたり利用可能額**: `DM Sans` 30px in **mustard** with `= 80,000 ÷ 30日（自動）`. This daily figure is **client-computed, read-only, never stored** = `monthly_budget ÷ days_in_current_month`; it recomputes instantly when budget or month changes.
- **貯金目標 card:** 💰 tile + helper line, a free-text aspiration field (`bgSoft`, hairline), then 目標金額 (`DM Sans` 22px) + 目標日 (`DM Sans` 16px) side by side, then a `sageSoft` encouragement note (🎉 …).
- **直近3ヶ月 list:** three cards — month label + actual (`DM Sans` 15px) + `予算 ¥…` + a progress bar (**sage if within budget, coral if over**) + a status emoji (⏳ ongoing / 🌞 ok / 🌧 over).
- Budget edit flow: tap 編集 → confirmation popup → `PUT /budgets` (upsert).

### 04 — Review (振り返り)  ·  `MReviewScreen`
**Purpose:** monthly breakdown reflection.
- Header big/sub: 5月の振り返り / 使い方の傾向を眺める.
- **Month chips** (horizontal scroll; current = coral fill).
- **Summary:** four `MMiniStat` tiles in two rows — 変動費 / 固定費 / 対象外 / 総支出.
- **Three-level breakdown**, one block per analysis group (**変動費 / 固定費 / 対象外**, each with a color dot + total):
  - **大分類** cards (emoji + name + amount; a ▾/▴ caret when it has children).
  - Expanded → **生活区分** rows: name + amount + an **inline memo field** (💭). Memo present = `mustardSoft` fill + mustard dashed border; empty = `bgSoft` + hair dashed border, italic placeholder "メモを残す…".
- Shows **all** spend incl. fixed & excluded. **対象外 handling:** excluded entries are force-grouped under "対象外" but keep their original 大分類 name (e.g. 対象外 ▸ 食費 ¥15,000).

### 05 — Journal (仕訳一覧)  ·  `MJournalScreen`
**Purpose:** browse entries by day.
- Header big: 日々の記録. Month chips (current = coral).
- **Day groups**, date-descending. Each: a date header (`DM Sans` 20px day + `5月 曜日` + day total on the right; **excluded entries don't count toward the day total**), then a card.
- Card may open with a **daily memo** (💬, `mustardSoft` + mustard dashed).
- **Entry rows:** emoji tile (36px; excluded → muted `#F4E9DC`), name (+ "対象外" badge when excluded), `生活区分 · note`, amount (`DM Sans` 15px). **Excluded** amounts render `inkSoft` + line-through.

### 06 — Master (マスタ管理)  ·  `MMasterScreen`
**Purpose:** customize categories.
- Header big/sub: カテゴリを整える / 自分らしい分類で.
- **Segmented control:** 大分類 (active, ink fill, white) / 生活区分.
- **大分類 list:** cards — emoji tile (42px, bgSoft) + name + "N 区分" count + an **analysis-group badge** (tinted pill: 食費=mustard / その他=sky-tint / 固定費=sage / 対象外=excluded) + a › chevron.
- Dashed **＋ 大分類を追加** button (coral dashed border, transparent fill).
- Rules: deleting a 大分類 that still has children → reject (400); 生活区分 deletes are logical only; uniqueness on `(user, category_code)` and `(user, group_id, category_name)`.

---

## The chart (`MMiniChart`)
Compact cumulative-spend area chart, full card width (≈ 322 × 150), padding L30 R8 T12 B20.
- `maxY = MONTHLY_BUDGET × 1.05`. X = day-of-month (1 → days_in_month). Y = 0 → maxY (`k`-suffixed ticks at 0 / 40k / 80k).
- **Baseline:** straight dashed `sage` line from `(day1, 0)` to `(lastDay, budget)` — the even-pace reference.
- **Actual (past→today):** smooth `coral` line (3px) over a coral→transparent gradient fill. Smoothing = Catmull-Rom (`smoothPath` in `shared.jsx`).
- **Forecast (today→month-end):** dashed `coralDeep` line (2px, `2 5` dash, 0.6 opacity), projected from daily pace.
- **Today marker:** white dot, 3px coral ring, at today's cumulative total.
- Series split food vs other via the category's analysis type.

---

## Behavior & state
- **大分類 → 生活区分 filtering** is client-side; masters are fetched once on Home load.
- **集計除外 toggle** (`is_excluded`): removes the entry from the Home chart, the remaining calc, and day totals; in Review it's re-bucketed under 対象外 (keeping its original 大分類).
- **Memos:** Review memo keyed per `category_id` (jsonb; empty = omitted); per-entry note on entry update; daily note per date (empty string = delete).
- **Reactive daily budget** = `monthly_budget ÷ daysInMonth`, recomputed on the client, never persisted; the field is read-only.
- **Transitions:** keep light — sheet slide-up, chip/button press feedback (the `0 6px 0` shadow compresses). No infinite/decorative animation.
- Suggested state: `masters` (groups + categories), `selectedMonth` (Review/Journal), `entryDraft` (date, amount, name, group_id, category_id, is_excluded, note), `budget` (monthly_budget + savings goal text/amount/date), derived `dailyBudget`, and `dailyNotes` / `reviewNotes` merged client-side onto fetched aggregates.

> **Note:** A fuller backend spec (DB schema, endpoint list, auth) was referenced in the desktop handoff but is **not included** in this mobile bundle. The data/rules summarized above are sufficient to build the UI; confirm exact endpoint shapes with the backend owner before wiring live data.

---

## Reference data shapes (from `src/shared.jsx`, placeholder values)
- **Group (大分類):** `{ id, name, emoji, code }` — e.g. `{1,"食費","🍙","food"}`.
- **Category (生活区分):** `{ id, group, name, type }` where `type ∈ food | other | fixed | excluded` drives the analysis bucket.
- **Entry:** `{ id, date:"YYYY-MM-DD", amount, name, group, cat, excluded, note }`.
- **Daily note:** `{ "YYYY-MM-DD": "text" }`.
- Helpers: `yen(n)` → `¥12,345`; `yenSlim(n)` → `12,345`; `smoothPath(points)` → Catmull-Rom `<path d>`.

## Assets
- **Icons:** `pwa-icons/` — PNGs (96/144/192/384/512 + 192/512 **maskable**), `apple-touch-icon-180.png`, favicons (16/32), `manifest.json`, and `HTML-snippet.txt` (head tags). Master vector lives in the project's `Atoikura Icon.html` (not bundled).
- **Fonts:** Google Fonts — `M PLUS Rounded 1c`, `Zen Maru Gothic`, `DM Sans`.
- **Category icons:** system emoji (no files).

## Files in this bundle
| File | What it is |
|---|---|
| `Atoikura Mobile.html` | Entry HTML — open in a browser to view all 6 screens (needs internet for fonts + React/Babel CDNs) |
| `src/shared.jsx` | Sample data, money formatting, `smoothPath` chart helper (**logic reference**) |
| `src/mobile-home.jsx` | Shared chrome (`M` theme, `MHeader`, `MTabBar`, `MScreen`, `MRing`, `MMiniChart`, `MMiniStat`, `MCard`) + Home + Entry sheet |
| `src/mobile-others.jsx` | Goals, Review, Journal, Master screens |
| `src/mobile-app.jsx` | How the 6 screens are assembled on the review canvas (review-only) |
| `_scaffold/` | Review-only chrome (`design-canvas.jsx`, `tweaks-panel.jsx`, `ios-frame.jsx`) — **ignore for the product** |
| `pwa-icons/` | Production icon set + web manifest |

**To preview:** open `Atoikura Mobile.html` in a browser.
