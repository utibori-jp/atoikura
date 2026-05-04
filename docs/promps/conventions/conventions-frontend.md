# Frontend Conventions

フロントエンド作業時に読むこと。`CLAUDE.md` の General / Commit 規約と併用する。

---

## Language & Framework

- TypeScript（strict mode on）
- Vite + React
- クラスコンポーネント禁止。関数コンポーネント + hooks のみ。

---

## Types

- `any` 禁止。`unknown` を使って narrowing する。
- APIクライアントの型は `docs/atoikura-api.yaml` から `openapi-typescript` で生成する。
  手書きで型を定義しない。

---

## Linting & Formatting

- `prettier` でフォーマット
- `eslint`（Vite デフォルト設定）でリント
- コミット前に必ず実行する
