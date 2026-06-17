# M6: Verify the rebuilt devcontainer + run the E2E happy path

## Goal

Issues **#90 (docker-outside-of-docker)**, **#91 (`make logs`)**, and
**#92 (Playwright E2E)** are implemented and merged into `develop`, but none of
their Definition-of-Done / Acceptance checks could run in the session that wrote
them: every one requires a **devcontainer rebuild** (the docker socket, the
`COMPOSE_PROJECT_NAME`, and the baked-in Chromium browser only exist after a
rebuild), and rebuilding kills the active Claude Code connection.

The user has now rebuilt the container. This step **executes those deferred
verifications**, fixes any small gaps it finds, and reports the result. Treat
each issue's "Definition of Done" / "Acceptance Criteria" as the spec — start
with `gh issue view <NN>`.

## Prerequisites

- The devcontainer has just been **rebuilt**.
- You are on `develop`, up to date with `origin/develop`
  (the integrated branch with #90/#91/#92 **and** #75). Confirm with
  `git log --oneline -1` and `git status`.
- Read `CLAUDE.md` first — especially the new `### Docker (devcontainer)`,
  `### Container logs (devcontainer)`, and `### E2E tests (Playwright)`
  sections, plus the **Firewall** rules.

## Hard safety rules (do not violate)

1. **NEVER run `/usr/local/bin/init-firewall.sh`** — it flushes iptables and
   kills the session. The firewall is already active.
2. **NEVER run a bare `docker compose down` / `docker compose stop`** (no
   service args) from inside the devcontainer — the devcontainer *is* the `dev`
   service of the same compose project, so a bare down/stop kills this session.
   Always name services explicitly: `docker compose up -d backend frontend`,
   `docker compose stop backend frontend`.
3. Do not rebuild the container yourself.

## Tasks

Run these in order. Capture the actual command output for the final report.

### 0. Sanity: tooling is present after the rebuild

```bash
docker --version            # docker CLI now exists in the devcontainer
docker ps                   # lists the HOST's containers (DooD socket works)
```

If `docker` is missing or `docker ps` errors with a socket/permission error,
the docker-outside-of-docker feature did not take effect — stop and report; do
not try to fix it by re-running the firewall script.

### 1. Verify #90 — docker-outside-of-docker + COMPOSE_PROJECT_NAME

```bash
cd /workspace/atoikura
docker ps                   # DoD: lists host containers
docker compose ps           # should show the EXISTING project's dev + db
                            # (and adminer) — NOT a duplicate stack
```

- Confirm `docker compose ps` reports the same project that VS Code started,
  with **no duplicate `db`**. Note the project name it prints.
- **If the project name is not `atoikura`**, then `COMPOSE_PROJECT_NAME` in
  `.devcontainer/devcontainer.json` is wrong: a bare `docker compose` command
  inside the container would target a *different* project. Record the real
  project name — it needs a one-line fix (see "If fixes are needed").
- Start/stop the app services and confirm the `dev` container is unaffected:
  ```bash
  docker compose up -d backend frontend
  docker compose ps          # dev still up; backend/frontend now running
  docker logs $(docker compose ps -q backend) | tail   # DoD: backend logs returned
  docker compose stop backend frontend
  ```

DoD for #90: `docker ps` lists host containers; start/stop of `backend`/
`frontend` does not affect `dev`; `docker logs <backend>` returns logs.

### 2. Verify #91 — `make logs`

With the backend compose service running:

```bash
cd /workspace/atoikura
docker compose up -d backend
timeout 8 make logs SERVICES=backend || true   # streams; timeout just stops the follow
timeout 8 make logs || true                     # both backend+frontend (start frontend first if needed)
docker compose stop backend
```

Acceptance for #91: `make logs SERVICES=backend` streams live backend logs with
a service prefix; the default `make logs` follows backend+frontend. (Use
`timeout` so the `-f` follow returns control to you.)

### 3. Verify #92 — Playwright happy-path E2E

```bash
# 3a. DB must be migrated so /auth/signup works (the happy path signs up a user).
make -C backend migrate-up

# 3b. Confirm Chromium was baked into the image (no CDN download — firewall-blocked).
cd /workspace/atoikura/frontend
npx playwright --version
ls "${PLAYWRIGHT_BROWSERS_PATH:-$HOME/.cache/ms-playwright}"   # chromium-* present

# 3c. Run the suite. webServer auto-starts backend (make -C ../backend run, :8080)
#     and Vite (:3000). Headless only.
npm run test:e2e
```

Acceptance for #92:
- A single command does launch → test → teardown, exits **non-zero on failure**.
- **Re-run it back-to-back** (`npm run test:e2e` twice) — it must pass both times
  with no manual cleanup (the spec uses a unique `e2e-<timestamp>@example.com`
  per run).
- The HTML report lands in `frontend/playwright-report/`.

The happy-path selectors (`新規登録` toggle, `#auth-email`/`#auth-password`
fill, `アカウント作成` submit, `ホーム` assertion) were written from
`frontend/src/components/LoginScreen.tsx` and `frontend/src/App.tsx` but never
executed. If the assertion is flaky because `ホーム` matches multiple nodes
(web vs. mobile nav), tighten the locator (e.g. `getByRole`, a more specific
container, or `.first()`) rather than loosening the test.

## If fixes are needed

If a verification fails for a fixable reason (wrong `COMPOSE_PROJECT_NAME`, a
happy-path selector that needs tightening, a missing `webServer` wait, etc.):

- Create a branch `fix/m6-verify-<short-slug>` off `develop`.
- Make the minimal fix; for frontend changes run `npm run lint` **and**
  `npm run format` before committing (project rule).
- Conventional Commit message, English, title only, no `Co-Authored-By`.
- Open a PR into `develop` whose body references the issue(s) it corrects
  (`Refs #90` etc.). Wait for CI (Backend / Frontend / Docker build /
  Integration Tests) to pass — branch protection blocks merge and auto-merge is
  disabled, so merge manually with `gh pr merge <N> --merge --delete-branch`
  once green.
- Do **not** re-label or close the issues; they already carry `v0.4.0` and stay
  open until release.

If nothing needs fixing, do not open a PR — just report.

## Final report

Report, per issue, PASS/FAIL against the DoD with the actual command output that
proves it, the compose project name observed in step 1, whether the E2E suite
passed on two consecutive runs, and any fix PR opened/merged.
