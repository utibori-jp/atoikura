# M4 Roadmap — Review Screen

Goal: Build the monthly review screen (振り返り画面) where the user can see a
3-tier expense breakdown for any past month and attach per-category memos.

**Branching**: All M4 steps share a single branch `feature/m4`, cut from `develop`
at the start of Step 1. Each step adds commits to this branch.
**Do not open a PR per step.** Open one PR from `feature/m4` to `develop` after
all three steps pass their Verification Checklists.

---

## Step Table

| Step | File | What it covers |
|---|---|---|
| 1 | `m4/M4-step1-monthly-breakdown-backend.md` | `GET /expenses/monthly-breakdown`: sqlc query with is_excluded override, repository method, handler |
| 2 | `m4/M4-step2-monthly-reviews-backend.md` | `GET /notes/monthly-reviews` + `PUT /notes/monthly-reviews`: jsonb-backed memo CRUD |
| 3 | `m4/M4-step3-review-frontend.md` | Review screen: 3-tier accordion, month selector (past only), per-category memo editing |

---

## Context & Decisions

- `GET /expenses/monthly-breakdown` must include expenses from logically-deleted
  categories (`is_deleted = true`) because past journal entries still reference them.
- `is_excluded = true` entries: `statement_type` is forced to `type_code = 'excluded'`
  in the SQL query; the original `group_name` is preserved as-is.
- Monthly review notes are stored as a flat jsonb object in `monthly_reviews.notes`
  with string category_id keys: `{"1": "note text", "3": "another note"}`.
  The API converts this to/from an array of `{category_id, note}` objects.
- The frontend joins breakdown items and review notes on `category_id`.
- Saving memos sends the full array (full replace) — the backend filters out
  empty-string notes before persisting.
