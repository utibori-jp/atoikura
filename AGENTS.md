# AGENTS.md

Canonical "start here" entry point for **any** AI coding agent (Claude Code,
Codex, Cursor, Copilot, Gemini, …) working in this repository. Tool-specific
files (e.g. `CLAUDE.md`) link here for the shared onboarding list rather than
duplicating it, so there is a single source of truth.

> The product UI is in Japanese (target users are native Japanese speakers); the
> codebase, docs, commits, and issues are in **English**.

---

## Read these first

Common to all tasks (this order):

1. `docs/spec.md` — product specification / V1 constraints (source of truth)
2. `docs/atoikura.dbml` — database schema
3. `docs/atoikura-api.yaml` — OpenAPI contracts
4. `docs/architecture.md` — tech stack and repository layout

Then, based on the work area:

- **Backend** → `docs/conventions/conventions-backend.md`
- **Frontend** → `docs/conventions/conventions-frontend.md`
- **UI / design** → `docs/design/` — high-fidelity design references for the
  mobile and web screens (already implemented under `frontend/`)
- **Deploy / migrations** → `docs/deploy-migrations.md`

---

## Working rules (summary)

- **Maintain scope** — implement only what the current task asks; don't add
  speculative features.
- **Specs win** — if instructions conflict with the spec/schema/contracts, stop
  and confirm rather than guessing.
- **Verify before "done"** — run the relevant checks (lint, format, build,
  tests) before declaring a task complete.
- **Conventional Commits**, English, title line only; **1 step = 1 PR**.
- Branch from `develop`; `main` is the release/deploy target.

---

## Tool-specific guidance

- **Claude Code** → `CLAUDE.md` adds environment specifics (devcontainer
  firewall, Docker-in-Docker, container logs, E2E) on top of the above.

Other tools (Codex, Cursor, Copilot, Gemini) can rely on this file as the single
entry point; no per-tool instruction files are maintained yet.
