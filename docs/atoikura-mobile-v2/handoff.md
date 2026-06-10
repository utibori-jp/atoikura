# Atoikura Mobile v2 — Claude Code Handoff

## 前提：v1 はすでに動作している

`frontend/src/` に TypeScript + React (Vite) で v1 モバイル UI が実装済みです。  
**ゼロから作り直してはいけません。** 既存コードを起点に差分だけ追加・変更してください。

### v1 で実装済みのもの（変更不要）

| ファイル | 内容 |
|---|---|
| `frontend/src/App.tsx` | アプリルート。モバイル判定、タブ切り替え、`EntrySheet` オーバーレイ |
| `frontend/src/theme.ts` | デザイントークン（`T` オブジェクト）。v2 デザインの `M` オブジェクトと同一値 |
| `frontend/src/components/mobile/MobileHome.tsx` | ホーム画面（リングゲージ、ミニチャート、今日の記録） |
| `frontend/src/components/mobile/MobileJournal.tsx` | 仕訳一覧（日付グループ、月選択チップ） |
| `frontend/src/components/mobile/MobileEntryForm.tsx` | 支出入力フォーム（ボトムシート内で使用） |
| `frontend/src/components/mobile/groupEmoji.ts` | 大分類 → emoji マッピング |
| `frontend/src/api/client.ts` | API クライアント |
| `frontend/src/api/types.ts` | OpenAPI スキーマから生成した型 |

App.tsx のタブ定義（現状）:
```
home → MobileHome
list → MobileJournal
review → ReviewScreen（デスクトップ流用）
budget → BudgetSettings（デスクトップ流用）
master → MasterManagement（デスクトップ流用）
```

---

## v2 でやること

### 1. 新規画面を追加する（Issues #25 / #27 / #28）

以下の 6 コンポーネントを `frontend/src/components/mobile/` に新規作成する。  
**UIの仕様は `docs/atoikura-mobile-v2/src/` の JSX デザインファイルがピクセル単位のソースオブトゥルースです。**  
レイアウト・色・余白・テキストはデザインファイルの値を忠実に再現してください。

| 作成ファイル | デザインソース | 概要 |
|---|---|---|
| `MobileRecurring.tsx` | `mobile-recurring.jsx` → `MRecurringScreen` | 定期支出一覧（確認待ちセクション＋繰り返し設定リスト） |
| `MobileRecurringSheet.tsx` | `mobile-recurring.jsx` → `MRecurringSheetScreen` | 定期支出を追加するボトムシート |
| `MobileSavings.tsx` | `mobile-savings.jsx` → `MSavingsScreen` | 貯金目標一覧（進捗バー付き） |
| `MobileSavingsSheet.tsx` | `mobile-savings.jsx` → `MSavingsSheetScreen` | 貯金目標を追加するボトムシート |
| `MobileIncome.tsx` | `mobile-income.jsx` → `MIncomeScreen` | 収入記録（ヒーローカード＋日付グループリスト） |
| `MobileIncomeSheets.tsx` | `mobile-income.jsx` → `MIncomeSheetScreen` / `MAllocateSheetScreen` / `MEditBaseSheetScreen` | 収入記録の 3 つのボトムシート（記録・振り分け・基準収入編集） |

**実装方針：**
- JSX デザインのインラインスタイルを TypeScript の `React.CSSProperties` に変換する
- `M.xxx` トークンは `import { T } from "../../theme"` の対応値に置き換える（同一値）
- サンプルデータ（`RECURRING`、`SAVINGS_GOALS`、`INCOMES` など）は初期状態の静的 mock で OK。後から API に差し替える
- ボトムシートは `App.tsx` の `EntrySheet` パターン（`position: fixed`, `z-index: 200`, ドラッグハンドル付き）を踏襲する

---

### 2. 目標タブ → 予算ハブに更新する（Issue #29）

**既存の `budget` タブ（`BudgetSettings` を表示）を `MobileBudget` に置き換える。**

| 作成ファイル | デザインソース | 概要 |
|---|---|---|
| `MobileBudget.tsx` | `mobile-goals-v2.jsx` → `MBudgetScreen` | 予算ハブ（変動費ヒーロー＋3 つのナビゲーションタイル） |

`MobileBudget` の 3 タイルタップで上記の新規画面（`MobileIncome`、`MobileRecurring`、`MobileSavings`）に遷移する。  
遷移は画面スタック（`useState` でサブ画面を管理）か、App.tsx のタブ拡張で実装する。

---

### 3. 仕訳に🔁定期バッジを追加する（Issue #29）

`MobileJournal.tsx` を以下の点だけ更新する：

- API レスポンスの仕訳エントリに `recurring: true` フラグがある場合、エントリ行に `🔁 定期` バッジを表示する
- バッジスタイル：`background: #E5EEF7`, `color: #3F6B91`, `fontSize: 9-11px`, `padding: 2px 8px`, `borderRadius: 6`
- デザインソース：`mobile-recurring.jsx` → `MJournalScreenV2`

---

## デザインソースの読み方

デザインファイルは `docs/atoikura-mobile-v2/src/` にある React JSX（Claude Design 出力）です。

```
docs/atoikura-mobile-v2/src/
  shared.jsx          — トークン定義、サンプルデータ、ユーティリティ関数
  mobile-home.jsx     — ホーム画面（v1 実装済み）
  mobile-others.jsx   — 振り返り・仕訳・マスタ（v1 実装済み）
  mobile-recurring.jsx — 定期支出画面 + 追加シート  ← 新規
  mobile-savings.jsx  — 貯金目標画面 + 追加シート    ← 新規
  mobile-income.jsx   — 収入画面 + 3 つのシート       ← 新規
  mobile-goals-v2.jsx — 予算ハブ（目標タブ置き換え） ← 更新
```

JSX 内の `M.xxx` は `theme.ts` の `T.xxx` に対応します（値は同一）。  
`M.coralSoft` / `M.mustardSoft` / `M.sageSoft` は `theme.ts` に未定義のため追加が必要です：

```typescript
// theme.ts に追加
coralSoft: "#FFE8DD",
mustardSoft: "#FFF1CC",
sageSoft: "#DEF1E6",
mustardDeep: "#F0A92E",
```

---

## App.tsx の変更箇所

```
mobile budget タブ:
  Before: <BudgetSettings />
  After:  <MobileBudget onNavigate={...} />   ← 予算ハブ（新規コンポーネント）
```

予算ハブからのサブ画面遷移（収入・定期支出・貯金目標）は App.tsx のタブ外で管理するか、  
`budget` タブ内でサブルート状態（`useState<"hub" | "income" | "recurring" | "savings">`）で管理してください。

---

## 確認チェックリスト

実装完了前に以下を確認してください：

- [ ] `frontend/src/components/mobile/` に 7 つのコンポーネントファイルが存在する
- [ ] `theme.ts` に `coralSoft`、`mustardSoft`、`sageSoft`、`mustardDeep` が追加されている
- [ ] 予算タブ（モバイル）が `MobileBudget` を表示する
- [ ] 予算ハブの 3 タイル（収入・定期支出・貯金）タップで各サブ画面に遷移する
- [ ] 仕訳画面で `recurring: true` のエントリに 🔁 バッジが出る
- [ ] `npm run build` がエラーなく通る
- [ ] モバイル幅（≤ 1023px）でレイアウトが崩れていない
- [ ] 既存の v1 機能（ホーム・仕訳・支出入力シート）がデグレしていない
