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

- Headroom is installed automatically by `postStartCommand` on the **first start after a rebuild** (runs `uv tool install headroom-ai[mcp,proxy] && headroom mcp install` only if not already present). This takes ~2 minutes on first run.
- On subsequent starts the install is skipped (`headroom --version` check).
- Do NOT manually run `uv tool install headroom-ai` or `headroom mcp install` — postStartCommand handles it.
- If `headroom --help` fails after the container is fully started, ask the user to stop and restart the container to trigger postStartCommand again.

### Docker (devcontainer)

Configured in issue #90 via the `docker-outside-of-docker` devcontainer feature and `COMPOSE_PROJECT_NAME`. These take effect only after a devcontainer **REBUILD**. After rebuilding, verify with `docker ps`, `docker compose ps`, and `docker logs <backend-container>`.

- **NEVER run a bare `docker compose down` or `docker compose stop`** (no service arguments) from inside the devcontainer. The devcontainer itself is the `dev` service of the same compose project — a bare down/stop kills the running container and the Claude Code session.
- Manage app services explicitly by naming them:
  ```bash
  docker compose up -d backend frontend
  docker compose stop backend frontend
  ```
- The following read-only commands are safe inside the container:
  ```bash
  docker ps
  docker logs <container-name>
  docker compose ps
  ```
- `COMPOSE_PROJECT_NAME=atoikura` is set in `containerEnv` so in-container compose commands target the existing project (the one VS Code started), preventing a duplicate `db` container from being created.

### Container logs (devcontainer)

Requires the #90 docker access to be active (devcontainer rebuild must have taken effect).

There are two distinct log sources in this project:

- **Dev-loop logs** (normal development): `make run` (Go backend) and `npm run dev` (Vite frontend) run natively in the devcontainer. Their output appears directly in the terminal where those commands are running — no Docker needed.
- **Production-style compose-service logs**: the `backend` and `frontend` containers launched via `docker compose up` write logs that are only reachable via `docker compose logs` / `docker logs`.

Use compose logs only when the production-style `backend`/`frontend` containers are running. For the normal dev loop, just read the terminal where `make run` / `npm run dev` is running.

**Stream logs for both services (root Makefile target):**

```bash
make logs
# wraps: docker compose logs -f --tail=100 backend frontend
```

**Filter to a single service:**

```bash
make logs SERVICES=backend
# or directly:
docker compose logs -f --tail=100 backend
```

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
