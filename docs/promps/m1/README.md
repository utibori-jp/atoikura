# Prompts

A collection of prompts for Claude Code to execute each development step.

## How to Use

1. Open Claude Code at the repository root.
2. Claude Code will automatically read `CLAUDE.md`.
3. Paste the content of each step's prompt file or explicitly reference it.
   (e.g., "Please follow `docs/prompts/M1-step1-monorepo-setup.md`")
4. Once the tasks are completed, verify the changes and proceed to the next step.

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

- **Direct Development on `develop`**: Perform all work directly on the `develop` branch without creating feature branches.
- **Sequential Execution**: Complete each step and ensure it works before moving to the next.
- **Strict Task Adherence**: Do not implement anything not listed in the "Tasks" section of the prompt. Defer any extra features to future steps.
- **Verification**: All items in the "Verification Checklist" must be completed and confirmed before a step is considered finished.
