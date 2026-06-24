# atoikura 設計仕様書 Ver 1.0

---

## 1. プロジェクト概要

### 1-1. コアバリュー

「今月俺はあといくら使えるのかがいつでも確認できるアプリ」

「あといくら使えるか」の計算は変動費の月次予算 vs 累積支出のみ。収入は計算に含めない。

### 1-2. 技術スタック

| レイヤー | 技術 |
|---|---|
| バックエンド | Go |
| フロントエンド | React |
| データベース | PostgreSQL |
| DB設計 | dbdiagram.io（DBML記法） |
| 認証（Ver1） | JWT Bearer認証（HS256、有効期限24時間） |

### 1-3. バージョンスコープ

Ver1スコープ（本仕様書の対象）：
- 支出管理・予算管理・振り返りの中核機能
- 口座管理・収入管理・投資管理はVer2以降
- Ver2への拡張性は設計段階から考慮する

---

## 2. 機能要件

| # | 要件 |
|---|---|
| 1 | 支出を記録できる |
| 2 | カテゴリ・グループ等のマスタをカスタマイズできる |
| 3 | 変動費の月次予算を設定できる |
| 4 | 変動費の月次予算に対する進捗がわかる（累積・月末予測） |
| 5 | 月次で支出の内訳を振り返れる |
| 6 | 仕訳の履歴を確認・編集できる |

---

## 3. 画面設計

### 3-1. ホーム画面（US-01, US-04）

**上半分：変動費累積グラフ**
- 系列：変動費食費・変動費その他・変動費合計・基準の4本
- 過去〜今日は実績の累積、未来日は日次ペースから計算した月末予測
- グラフ操作（カーソル合わせで値・差分表示）はフロント側で処理

**下半分：仕訳入力フォーム**
- 入力項目：日付・金額・項目名・大分類・生活区分・is_excluded・note
- 大分類選択で生活区分が絞り込まれる（フロント側でフィルタリング）
- マスタはホーム表示のたびに全取得

### 3-2. マスタ管理画面（US-02）

- 大分類タブ・生活区分タブ
- 各項目の追加・編集・削除
- 生活区分：大分類ごとに固まって表示
- 変動費分析用グループは `statement_types` テーブルの固定マスタ（CRUDなし）
- 変動費分析用グループは大分類選択で自動決定（ユーザーが直接選ぶ）

### 3-3. 目標設定画面（US-03）

- 貯金目標（フリーテキスト＋具体の金額）
- 月々の変動費予算金額
- 1日あたり利用可能額（`monthly_budget ÷ 当月日数`、フロント側でリアクティブに計算。編集不可）
- 編集→確認ポップアップ→確定でPUT実行

### 3-4. 振り返り画面（US-05）

- 月選択（過去の任意の月）
- 3段構成：変動費分析用グループ／大分類／生活区分（タップで展開）
- 生活区分行ごとにメモ入力・保存
- 集計とメモは別APIで取得・更新。フロントで `category_id` をキーに突合

### 3-5. 仕訳一覧画面（US-06）

- 月選択（デフォルト当月）、日ごとに仕訳を降順表示
- 仕訳の追加・編集・削除
- 仕訳単位のコメント（`journal_entries.note` カラムを利用、PUT時にリクエストボディに含める）
- 日単位のコメント（その日の出費が多かった理由を記録する用途）
- 日次コメントは `daily_notes` テーブルで管理。仕訳一覧とは別APIで取得・更新（エンティティ・更新単位が異なるため分離）

---

## 4. 設計上の決定事項

### 4-1. DB設計

| 項目 | 決定内容 | 理由 |
|---|---|---|
| PK | integer連番 | シンプルさ優先 |
| 論理削除 | `is_deleted` + `deleted_at` | マスタ系のみ適用 |
| 仕訳の削除 | 物理削除 | 参照元テーブルがなく、削除後に参照する画面もないため |
| daily_notesの削除 | 物理削除（note空文字送信で削除扱い） | `is_deleted` 不要。空文字=削除としてUX上自然 |
| マスタ更新 | 全件反映（スナップショット不要） | Ver1スコープでは過去遡及の集計変更を許容 |
| statement_types | 削除不可の固定マスタ | 変動費分析用グループはアプリ側の概念として固定 |
| type_code | `statement_types` に持たせる | サーバー側はIDではなくコードで分岐。環境差異によるID採番ズレを防ぐ |
| 振り返りメモ | `monthly_reviews.notes` にjsonbで管理 | `category_id` をキー、メモテキストをバリューとして保存。APIレスポンス時に配列に変換 |

### 4-2. API設計

| 項目 | 決定内容 |
|---|---|
| 認証 | JWT Bearer認証。`POST /auth/login` でトークンを発行し、以降のリクエストは `Authorization: Bearer <token>` で送信。トークンはHS256署名・有効期限24時間 |
| ユーザーID取得 | セッション/トークンから取得。パスに `{user_id}` は含めない |
| 他ユーザーリソース | 404を返す（リソースの存在を露出しない） |
| budgets PUT | upsert（レコードがなければINSERT、あればUPDATE） |
| monthly_reviews PUT | 全件洗い替え（jsonbを丸ごと置き換え）。件数が少なく操作が月単位のためシンプルさ優先 |
| monthly_reviews note空文字 | サーバー側で除外してDBに保存しない |
| daily_notes PUT | 1日1件のupsert。空文字送信でレコード物理削除、レスポンスは `note: null` で返す |
| daily_budget | フロント側で計算（`monthly_budget ÷ 当月日数`）。バックエンドは返さない |
| 仕訳一覧レスポンス | サーバー側で日付グループ化して返す（日付降順、日内はid降順） |
| notes レスポンス形式 | 配列形式で返す（キーが文字列になるマップより型安全。件数が少ないためループのコストは無視できる） |
| 日次コメントAPI | 仕訳一覧とは別エンドポイント。エンティティが異なり更新単位も異なるため分離 |
| 月次自動記録の方式 | **遅延記録（lazy posting）**。cron／スケジューラは導入せず、その月の最初のダッシュボード参照（`GET /budget-summary`）時に当月分を自動記録する。詳細は4-5を参照 |

### 4-5. 月次自動記録（固定費・貯金）

固定費（固定の繰り返し支出）と月々の貯金は、毎月自動で記録される。実現方式は **遅延記録（lazy posting）** を採用する。

| 項目 | 決定内容 | 理由 |
|---|---|---|
| トリガー | `GET /budget-summary`（ホーム／予算画面が最初に叩く参照系API）のリクエスト時に当月分を自動記録 | cron／スケジューラ用のインフラを持たずに済む。ホーム表示時点で当月分が反映され、UIの「毎月自動で記録されます」表記と整合する |
| 対象（固定費） | `recurring_expenses.type = 'fixed'` かつ `amount` 設定済みのものを `journal_entries` に記録し、`recurring_expense_id` で紐付ける | `type = 'variable'`（要確認）は金額が月ごとに変わるため、手動の確定フロー（`POST /recurring-expenses/{id}/confirm`）で記録する |
| 記録日（固定費） | `billing_day` を当月にマッピング。月末を超える日は月末日にクランプ（例：31日指定の2月は28/29日） | 既存の確定フロー（`ConfirmRecurringExpense`）と同じ日付ロジックに揃える |
| 対象（貯金） | `savings_goals.monthly_amount > 0` のものを `accumulated_amount` に加算し、`last_posted_month` を当月に更新 | 既存の手動 `POST /savings-goals/{id}/post-monthly` と同じ蓄積ロジックを再利用する |
| 月次冪等性（固定費） | その月に当該 `recurring_expense_id` の `journal_entries` が存在しない場合のみINSERT（`NOT EXISTS` ガード） | 同月の再リクエストで二重記録しない |
| 月次冪等性（貯金） | `last_posted_month` が当月未満（またはNULL）の場合のみ加算 | 同月の再リクエストで二重加算しない |
| 同時実行の保護 | 固定費・貯金の記録を1つのトランザクションにまとめ、ユーザー単位の `pg_advisory_xact_lock` で直列化 | 月初の同時リクエストが冪等ガードの判定と更新の間で競合して二重記録するのを防ぐ |
| 失敗時の扱い | 自動記録が失敗してもダッシュボードのレスポンスはブロックしない（ログのみ） | 参照系APIの可用性を優先 |

### 4-6. 余剰の振り分け

#### 余剰（surplus）の定義

余剰 = `SUM(income_records.amount)` （当月） − `base_income_settings.amount`

基準収入を超えた分の収入が「余剰」であり、ユーザーが明示的に使い道を決めるための原資となる。

#### 振り分け先（destination）

| destination | 意味 | データへの影響 |
|---|---|---|
| `budget` | 今月の変動費予算に追加 | `surplus_allocations` に記録のみ（`variable_budget` の計算式には影響しない。余剰は既に収入として計上されているため） |
| `savings` | 貯金目標に振り分け | `surplus_allocations` に記録し、同一トランザクション内で `savings_goals.accumulated_amount` に加算 |

#### variable_budget への影響

`variable_budget = income_total − recurring_total − savings_total − savings_allocated(year_month)`

- `savings_allocated` = 当月の `surplus_allocations.amount` のうち `destination = 'savings'` のもの合計
- `destination = 'budget'` の振り分けは `variable_budget` を変えない（その収入は既に可処分予算に含まれている）
- 同じロジックが過去月の履歴（history）にも適用される

#### 未振り分け余剰の上限バリデーション

振り分け登録時に以下を検証する：
```
amount ≤ max(0, income_total(ym) − base_income) − already_allocated_total(ym)
```
違反した場合は 400 エラーを返す（メッセージ：「指定金額が振り分け可能な余剰を超えています」）。

#### その他の設計決定

- 振り分けレコードは追記専用。取り消し・編集は V1 スコープ外
- `destination = 'savings'` かつ `savings_goal_id` が他ユーザーのものを参照した場合は 404 を返す（リソースの存在を露出しない）
- `destination = 'budget'` の場合 `savings_goal_id` は NULL（指定不可）

### 4-3. マスタ・カテゴリ設計

| 項目 | 決定内容 |
|---|---|
| カテゴリ・大分類 | ユーザーごとにカスタマイズ可能 |
| expense_categories UNIQUE制約 | `(user_id, category_code)` と `(user_id, group_id, category_name)` の2制約 |
| category_groups UNIQUE制約 | `(user_id, group_name)` |
| ソート順 | `group_name → category_name` の2段昇順 |
| 大分類の削除 | 紐づく生活区分が存在する場合は400で拒否 |
| 生活区分の削除 | 論理削除のみ。過去仕訳はそのまま保持 |
| is_deleted=trueの生活区分 | 仕訳一覧・振り返り画面でJOINする際は含めること（除外すると過去仕訳の表示が壊れる） |
| statement_type_id | `category_groups` に持たせる（階層：`statement_types → category_groups → expense_categories`） |

### 4-4. 集計ロジック（is_excludedの扱い）

集計除外フラグ：`journal_entries.is_excluded`（trueで集計から除外。defaultはfalse）

**ホーム画面グラフ（`GET /expenses/daily-cumulative`）**
- `is_excluded = false` の仕訳のみ集計対象
- `statement_types.type_code` で `food`（食費）/ `other`（その他）に分類

**振り返り画面（`GET /expenses/monthly-breakdown`）**
- 変動費だけでなく固定費・対象外も含めた全支出を表示する（「変動費予算は守れていても固定費が重い」「対象外に入れすぎて実態の出費が見えない」といった状況を把握するため）
- `is_excluded = false`：`statement_type` そのままで集計
- `is_excluded = true`：`statement_type` を「対象外」に強制上書きして集計。`group_name`（大分類）は元の値をそのまま使う
- 集計クエリで `is_excluded = true` の行の `statement_type_id` を対象外のIDに差し替えてGROUP BY。DBの変更は不要

例：「記念日の外食（食費グループ、`is_excluded=true`）」は振り返り画面で以下のように表示される：

```
対象外
  └ 食費          ← group_nameはそのまま
      └ 外食 ¥15,000
```

---

## 5. エンドポイント一覧

詳細なリクエスト/レスポンス定義はOpenAPI仕様書（`atoikura-api.yaml`）を参照。

| # | メソッド | パス | 概要 | 状態 |
|---|---|---|---|---|
| 1 | POST | `/auth/login` | JWT発行（ログイン） | 完了 |
| 2 | GET | `/expenses/daily-cumulative` | ホームグラフ用日次累積取得 | 完了 |
| 3 | GET | `/category-groups` | 大分類一覧取得 | 完了 |
| 4 | GET | `/expense-categories` | 生活区分一覧取得 | 完了 |
| 5 | POST | `/journal-entries` | 仕訳登録 | 完了 |
| 6 | POST | `/category-groups` | 大分類作成 | 完了 |
| 7 | PUT | `/category-groups/{id}` | 大分類更新 | 完了 |
| 8 | DELETE | `/category-groups/{id}` | 大分類削除 | 完了 |
| 9 | POST | `/expense-categories` | 生活区分作成 | 完了 |
| 10 | PUT | `/expense-categories/{id}` | 生活区分更新 | 完了 |
| 11 | DELETE | `/expense-categories/{id}` | 生活区分削除 | 完了 |
| 12 | GET | `/statement-types` | 変動費分析用グループ一覧取得 | 完了 |
| 13 | GET | `/budgets` | 予算・目標取得 | 完了 |
| 14 | PUT | `/budgets` | 予算・目標更新 | 完了 |
| 15 | GET | `/expenses/monthly-breakdown` | 月次支出内訳取得 | 完了 |
| 16 | GET | `/notes/monthly-reviews` | 月次振り返りメモ取得 | 完了 |
| 17 | PUT | `/notes/monthly-reviews` | 月次振り返りメモ保存 | 完了 |
| 18 | GET | `/journal-entries` | 仕訳一覧取得 | 完了 |
| 19 | PUT | `/journal-entries/{id}` | 仕訳更新 | 完了 |
| 20 | DELETE | `/journal-entries/{id}` | 仕訳削除（物理削除） | 完了 |
| 21 | GET | `/notes/daily` | 日次コメント一覧取得 | 完了 |
| 22 | PUT | `/notes/daily/{date}` | 日次コメント保存 | 完了 |
| 23 | GET | `/surplus-allocations?year_month=YYYY-MM` | 余剰振り分け一覧取得 | 完了 |
| 24 | POST | `/surplus-allocations` | 余剰振り分け作成 | 完了 |

---

## 6. DBスキーマ概要

詳細なスキーマ定義はDBMLファイル（`atoikura.dbml`）を参照。

| テーブル | 用途 | 削除方式 |
|---|---|---|
| users | ユーザー管理 | 論理削除 |
| journal_entries | 仕訳（支出記録） | 物理削除 |
| expense_categories | 生活区分マスタ | 論理削除 |
| category_groups | 大分類マスタ | 論理削除 |
| statement_types | 変動費分析用グループ（固定マスタ） | 削除不可 |
| budgets | 予算・目標設定 | —（upsert） |
| monthly_reviews | 月次振り返りメモ（notesカラムにjsonbで保存） | —（upsert） |
| daily_notes | 日次コメント | 物理削除 |
| accounts | 口座管理（Ver2用） | 論理削除 |
| account_transactions | 口座明細（Ver2用） | — |

---

## 7. Ver2以降の拡張方針

- 口座管理・収入管理・投資管理を追加（`accounts` テーブル等は既にDBスキーマに定義済み）
- 認証はJWT Bearer認証（HS256）で実装済み。Ver2での拡張時はリフレッシュトークンの追加を検討する
- バックエンドは `statement_types.type_code` で分岐しているため、IDのズレを気にせず環境を跨いだデプロイが可能
