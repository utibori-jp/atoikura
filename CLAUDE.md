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

### Firewall (devcontainer)

- **NEVER re-run `/usr/local/bin/init-firewall.sh`** while the container is running. It flushes all iptables rules, which immediately kills the Claude Code API connection.
- The firewall is initialized automatically via `postStartCommand` before Claude Code starts. It is always already active.
- If a specific domain is blocked, add only that domain's IPs to the existing ipset — do NOT re-run the whole script:
  ```bash
  sudo ipset add --exist allowed-domains $(dig +short A <domain> | head -1)
  ```
- If you encounter a network error installing packages, stop and ask the user to add the domain to `.devcontainer/init-firewall.sh` and rebuild the container.

### Headroom MCP (devcontainer)

- Headroom is **pre-installed in the Docker image** (`headroom-ai[mcp,proxy]`) and the MCP is registered at build time via `headroom mcp install`. No installation steps are needed after container start.
- Do NOT run `uv tool install headroom-ai` or `headroom mcp install` — they are already done.
- If `headroom --help` fails, the image is stale. Ask the user to rebuild the container (`Dev Containers: Rebuild Container`).

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

### Issue Lifecycle

- When finishing work for an Issue (PR merged or implementation complete), apply a label for the upcoming release in the form `vX.Y.0` (e.g., `v0.3.0`). Create the label if it does not yet exist.
- Do **not** close the Issue at that point. Issues remain open until the release containing the work has actually shipped — closing is part of the release process, not the per-PR workflow.

### General

- Comments must be in English.
- Variable names must describe their role, type, and content. Avoid generic names.
  - NG: `seen`, `current`, `result`, `temp`
  - OK: `num_to_index`, `target_complement`, `monthly_budget_yen`
- Python Execution: When executing Python commands or scripts, always use `uv run python` instead of `python3`.
