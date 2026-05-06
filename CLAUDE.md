# CLAUDE.md

Guidelines for Claude Code when working in this repository.

---

## Must Read Before Starting

Common to all tasks:

- `docs/spec.md` — Specifications / V1 constraints (Source of Truth)
- `docs/atoikura.dbml` — DB schema definitions
- `docs/atoikura-api.yaml` — OpenAPI contracts
- `docs/architecture.md` — Tech stack and directory structure
- `docs/prompts/<current-step>.md` — Task definitions for the current step

Read additional documents based on the work area:

- For Backend work → `docs/conventions-backend.md`
- For Frontend work → `docs/conventions-frontend.md`

---

## Working Rules

- **Maintain Scope**: Implement only the tasks listed in the current step's prompt. Do not implement future features, even if they seem useful.
- **Prioritize Specifications**: If there is a conflict between the specs/schema and instructions, stop work and confirm with the user. Do not proceed based on assumptions.
- **Verify Before Declaring Completion**: Execute all items in the "Verification Checklist" of each prompt before finishing a task.
- **Incremental Commits**: Commit in logical units. 1 Step = 1 PR.

---

## Conventions

### Branch Strategy

- `main`: Stable, deployment target.
- `develop`: Development integration branch.
- `feature/*`: Branched from `develop`. Merged into `develop` via PR.
- Example branch name: `feature/m1-step1-monorepo-setup`

### Commit

- Use [Conventional Commits](https://www.conventionalcommits.org/) format.
- Messages must be in **English**, title line only (no body or bullet points).
- Do not include `Co-Authored-By:`.
- Scope examples:
  - `feat(backend/handler): add POST /journal-entries`
  - `chore(backend/migrations): add statement_types seed`
  - `feat(frontend/forms): add journal entry form`
  - `chore(docker): add postgres service`

### General

- Comments must be in English.
- Variable names must describe their role, type, and content. Avoid generic names.
  - NG: `seen`, `current`, `result`, `temp`
  - OK: `num_to_index`, `target_complement`, `monthly_budget_yen`
- Python Execution: When executing Python commands or scripts, always use `uv run python` instead of `python3`.
