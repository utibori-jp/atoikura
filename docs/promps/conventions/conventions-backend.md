# Backend Conventions

バックエンド作業時に読むこと。`CLAUDE.md` の General / Commit 規約と併用する。

---

## Language & Libraries

- Go 1.22+
- Standard library first. 外部フレームワークは明示的な理由がない限り使わない。
- HTTP routing: `net/http` 標準 ServeMux のみ。

---

## Layering

- `handler` → `repository` の2層構成。
- `handler`: HTTPの入出力のみ担当。ビジネスロジックを書かない。
- `repository`: sqlc生成コードをラップし、ドメイン寄りのメソッドを公開する。
- `usecase` 層はロジックが複雑になったときだけ追加する。今は作らない。

---

## Error Handling

- return early。ネストしない。
- エラーは `fmt.Errorf("doing X: %w", err)` でラップしてチェーンを保持する。
- HTTPハンドラーは:
  - 入力を明示的にバリデートする（サイレントな型強制禁止）
  - エラーレスポンスは OpenAPI の `ErrorResponse` スキーマに従う
  - 内部エラーメッセージをクライアントに漏らさない

---

## Logging

- `log/slog`（標準ライブラリ）を使う。外部ロギングライブラリは使わない。

---

## Linting & Formatting

- `gofmt` でフォーマット
- `golangci-lint`（デフォルト設定）でリント
- コミット前に必ず実行する
