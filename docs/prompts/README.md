# Prompts

A collection of prompts for Claude Code to execute each development step.

## How to Use

1. Open Claude Code at the repository root.
2. Claude Code will automatically read `CLAUDE.md`.
3. Reference the step prompt file explicitly.
   (e.g., "Please follow `docs/prompts/m2/M2-step1-budgets-backend.md`")
4. Complete the step's Verification Checklist before moving to the next step.

---

## M1 Roadmap — Spreadsheet Escape ✅

Goal: To run a minimal expenditure tracking app locally that replaces spreadsheet-based management.

See `docs/prompts/m1/README.md` for the full M1 step table.

**Branching**: M1 used per-step feature branches (`feature/m1-stepN-...`), each merged to `develop` via individual PRs.

---

## M2 Roadmap — Home Screen (Core Value Delivery)

Goal: To create a home screen where "How much more can I spend this month?" is visible at a glance via a graph.

**Branching**: All M2 steps share a single branch `feature/m2`, cut from `develop` at the start of Step 1. Each step adds commits to this branch. **Do not open a PR per step.** Open one PR from `feature/m2` to `develop` after all four steps pass their Verification Checklists.

| Step | File | What it covers |
|---|---|---|
| 1 | `m2/M2-step1-budgets-backend.md` | `GET /budgets` + `PUT /budgets`; sqlc queries, repository, handler |
| 2 | `m2/M2-step2-daily-cumulative-backend.md` | `GET /expenses/daily-cumulative` with forecast logic; OpenAPI update |
| 3 | `m2/M2-step3-budget-settings-frontend.md` | Budget settings screen: monthly budget, savings goal, daily budget display |
| 4 | `m2/M2-step4-home-graph-frontend.md` | Home screen: Recharts 4-series graph, month navigation, budget-unset fallback |

---

## M4 Roadmap — Review Screen

Goal: Build the monthly review screen with expense breakdown and per-category memo editing.

**Branching**: All M4 steps share a single branch `feature/m4`. Open one PR to `develop` after all steps pass.

| Step | File | What it covers |
|---|---|---|
| 1 | `m4/M4-step1-monthly-breakdown-backend.md` | `GET /expenses/monthly-breakdown`: SQL with is_excluded override |
| 2 | `m4/M4-step2-monthly-reviews-backend.md` | `GET/PUT /notes/monthly-reviews`: jsonb memo CRUD |
| 3 | `m4/M4-step3-review-frontend.md` | Review screen: 3-tier accordion, month selector, memo save |

---

## Future Milestones (Not Yet Drafted)

- **M5**: Journal list polish (edit/delete entries, daily notes, filters)

---

## General Conventions

- **Strict Task Adherence**: Implement only what the current step's Tasks section lists. Defer everything else.
- **Sequential Execution**: Complete and verify each step before moving to the next.
- **Verification**: Every item in a step's Verification Checklist must pass before the step is considered done.
- **Conventional Commits**: Use `feat`, `fix`, `chore`, `docs`, `refactor` with scope. Title line only; no body bullets. No `Co-Authored-By`.
