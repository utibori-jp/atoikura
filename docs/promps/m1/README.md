# Prompts

Claude Code が各ステップを実行するためのプロンプト集。

## How to Use

1. リポジトリルートで Claude Code を開く
2. Claude Code は自動的に `CLAUDE.md` を読み込む
3. 各ステップのプロンプトファイルを貼り付けるか、明示的に参照する
   （例: "Please follow `docs/prompts/M1-step1-monorepo-setup.md`"）
4. 完了後、PR をレビューして `develop` にマージし、次のステップへ

## M1 Roadmap — Spreadsheet Escape

Goal: スプレッドシートを脱却できる最小限の家計記録アプリをローカルで動かす。

| Step | File | What it covers |
|---|---|---|
| 1 | `M1-step1-monorepo-setup.md` | Directory skeleton, Go module, Vite scaffolding, base configs |
| 2 | `M1-step2-docker-compose.md` | docker-compose.yml + Dockerfiles (backend/frontend/db) |
| 3 | `M1-step3-migrations.md` | All schema migrations + statement_types seed + dev user/categories seed |
| 4 | `M1-step4-sqlc-setup.md` | sqlc config + queries for M1 endpoints + code generation |
| 5 | `M1-step5-backend-skeleton.md` | main.go, DB pool, middleware, health check, hardcoded user injection |
| 6 | `M1-step6-endpoints.md` | 4 endpoints: list groups, list categories, create entry, list entries |
| 7 | `M1-step7-frontend.md` | Minimum form + list UI to make daily use possible |

## Future Milestones (Not Yet Drafted)

- **M2**: Home screen graph (`GET /expenses/daily-cumulative`, `GET/PUT /budgets`)
- **M3**: Master management UI (CRUD for category_groups and expense_categories)
- **M4**: Review screen (`GET /expenses/monthly-breakdown`, monthly_reviews CRUD)
- **M5**: Journal list polish (edit/delete entries, daily notes, filters)

## Conventions

- 各ステップは `develop` からの1つのフィーチャーブランチ
- 各ステップは PR レビューとマージをしてから次へ進む
- プロンプトの "Tasks" リストにないものは実装しない。次のステップに先送り。
- 各プロンプトの "Verification Checklist" を全項目実行してから完了とする
