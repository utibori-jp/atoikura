# M6: Wire the v2 Screens to the API

## Goal

The v2 redesign (atoikura-web-v2 / atoikura-mobile-v2) shipped with screens that
look complete but are partially unwired: many buttons have no handlers, mobile
bottom sheets are static mockups, and the home/budget screens read the wrong or
hardcoded data. An audit produced GitHub Issues #68–#78. This step executes that
issue queue until every v2 screen is functional.

Each issue body contains the full scope, exact `file:line` references, and an
acceptance checklist. **The issue is the spec for its task** — start every task
with `gh issue view <number>`.

## Prerequisites

- You are on a clean checkout with `develop` up to date.
- Read `CLAUDE.md`, `docs/spec.md`, `docs/atoikura-api.yaml`,
  `docs/architecture.md` first (per CLAUDE.md).
- Frontend work → also read `docs/conventions-frontend.md`.
  Backend work → also read `docs/conventions-backend.md`.

## Execution order

Work the issues in this order. Do not start a task whose dependency is not
merged.

| Order | Issue | Area | Notes |
|---|---|---|---|
| 1 | #77 | backend + frontend | Home charts must use the auto budget (`/budget-summary`), not the orphaned manual `/budgets`. Fixes the "¥0 / 予算を設定してください" symptom in production. |
| 2 | #78 | frontend/web | WebBudget hardcodes spent=0. Small, independent. |
| 3 | #74 | backend | Journal↔recurring linkage + real pending-confirm flow. Unblocks #72 and #76. API contract change: update `docs/atoikura-api.yaml` first, then regenerate (`make sqlc-gen` in `backend/`, `npm run gen:api` in `frontend/`). |
| 4 | #68 | frontend/web | WebSavings create/edit forms. |
| 5 | #69 | frontend/web | WebRecurring create/edit forms (use the #74 confirm flow, not the type-flip workaround). |
| 6 | #70 | frontend/web | WebIncome create/edit forms. |
| 7 | #71 | frontend/mobile | MobileSavings: replace static sheet with a real form; delete; post-monthly. |
| 8 | #72 | frontend/mobile | MobileRecurring: real form; delete; pending confirm via the #74 API. |
| 9 | #73 | frontend/mobile | MobileIncome: real form; delete; base-income editing. |
| — | #75 | decision | Surplus allocation has no API contract. **Do not implement. Ask the user** whether to design it or remove the dead UI, then follow their decision. |
| — | #76 | backend | Monthly auto-posting. Depends on #74. **Ask the user** which mechanism they want (cron job vs. lazy posting on first request of the month) before implementing. |

## Branching and PRs

- One issue = one branch = one PR into `develop`.
- Branch names: `feature/m6-issue<NN>-<short-slug>`
  (e.g., `feature/m6-issue77-home-budget-source`).
- PR title follows Conventional Commits; PR body references the issue
  (`Refs #NN` — do **not** use `Closes`; issues stay open until release).
- After the PR is merged, apply the upcoming release label (e.g., `v0.4.0`) to
  the issue. Create the label if it doesn't exist. Do not close the issue.

## Working rules for every task

1. `gh issue view <NN>` and restate the scope before coding.
2. Follow the existing component style: the v2 screens use inline styles with
   the `T` theme tokens (`frontend/src/theme.ts`) — match it; do not introduce
   CSS files or UI libraries.
3. Reuse the existing API client (`frontend/src/api/client.ts`). If an endpoint
   is missing from the client but exists in `docs/atoikura-api.yaml`, add it to
   the client following the existing pattern.
4. Any API contract change starts in `docs/atoikura-api.yaml`, then
   `npm run gen:api` (frontend) and sqlc/handler work (backend). Never let
   `types.ts` drift from the YAML.
5. UI text is Japanese (match the surrounding screens); code comments and
   commit messages are English.
6. If an issue's scope conflicts with `docs/spec.md` or the OpenAPI contract,
   stop and ask the user. Do not guess.

## Verification checklist (run before each commit/PR)

Backend tasks:

- [ ] `cd backend && go vet ./... && gofmt -l . && go test ./...` all pass
- [ ] `make sqlc-gen` produces no uncommitted diff

Frontend tasks:

- [ ] `cd frontend && npm run lint` passes
- [ ] `npm run format` applied (then `npm run format:check` passes)
- [ ] `npx tsc --noEmit` passes
- [ ] `npm run test` passes; add/extend component tests for newly wired
      mutations (MSW handlers live in `frontend/src/test/`)

Both:

- [ ] Every checkbox in the issue's Scope section is satisfied
- [ ] Manually verify the happy path against the local stack
      (`docker compose up`) — create, edit, delete, and confirm the list
      refreshes
