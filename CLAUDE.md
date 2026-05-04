# CLAUDE.md

Claude Code がこのリポジトリで作業する際の指針。

---

## 作業前に必ず読むこと

すべてのタスクで共通:

- `docs/spec.md` — 仕様・V1制約（source of truth）
- `docs/atoikura.dbml` — DBスキーマ定義
- `docs/atoikura-api.yaml` — OpenAPI契約
- `docs/architecture.md` — 技術スタック・ディレクトリ構成
- `docs/prompts/<current-step>.md` — 現ステップのタスク定義

作業領域に応じて追加で読むこと:

- バックエンド作業時 → `docs/conventions-backend.md`
- フロントエンド作業時 → `docs/conventions-frontend.md`

---

## Working Rules

- **スコープを守る**: 現ステップのプロンプトに記載のタスクのみ実装する。便利でも先取りしない。
- **仕様を優先する**: spec・スキーマと指示が矛盾したら作業を止めてユーザーに確認する。推測で進めない。
- **検証してから完了宣言**: 各プロンプトの "Verification Checklist" を全項目実行してから完了とする。
- **段階的にコミット**: 論理的な単位ごとにコミットする。1ステップ = 1 PR。

---

## Conventions

### Branch Strategy

- `main`: stable、デプロイ対象
- `develop`: 開発統合ブランチ
- `feature/*`: `develop` から切る。PR で `develop` にマージ。
- ブランチ名例: `feature/m1-step1-monorepo-setup`

### Commit

- [Conventional Commits](https://www.conventionalcommits.org/) 形式
- メッセージは**英語**、タイトル行のみ（body・bullet points なし）
- `Co-Authored-By:` は付けない
- スコープ例:
  - `feat(backend/handler): add POST /journal-entries`
  - `chore(backend/migrations): add statement_types seed`
  - `feat(frontend/forms): add journal entry form`
  - `chore(docker): add postgres service`

### General

- コメントは英語
- 変数名は役割・型・内容を表すこと。汎用名禁止。
  - NG: `seen`, `current`, `result`, `temp`
  - OK: `num_to_index`, `target_complement`, `monthly_budget_yen`
