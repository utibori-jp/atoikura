# M1 Step 1: Monorepo Setup

## Goal

Set up the initial monorepo structure with empty directories, base config files,
and a working README. No application code yet.

## Branch

Create `feature/m1-step1-monorepo-setup` off `develop`.

## Prerequisites

- `develop` branch exists
- `CLAUDE.md` is in the repository root
- `docs/spec.md`, `docs/atoikura.dbml`, `docs/atoikura-api.yaml` are placed under `docs/`

## Tasks

### 1. Create the directory skeleton

Match the layout described in `CLAUDE.md` exactly:

```
atoikura/
├── backend/
│   ├── cmd/server/
│   ├── internal/
│   │   ├── handler/
│   │   ├── repository/
│   │   └── db/
│   ├── migrations/
│   └── queries/
├── frontend/
│   └── src/
├── deploy/
│   └── k8s/
└── docs/
    └── prompts/
```

Place a `.gitkeep` in each empty directory so git tracks them.

### 2. Initialize Go module in `backend/`

- `cd backend && go mod init github.com/<your-username>/atoikura/backend`
- Confirm `go.mod` is created with Go 1.22 or higher
- Ask the user for their GitHub username if unsure

### 3. Initialize Vite + React + TypeScript project in `frontend/`

Use the official Vite scaffolding:
```
npm create vite@latest frontend -- --template react-ts
```
But adapt it so the project lives directly in `frontend/` (not `frontend/frontend/`).

After scaffolding:
- Run `npm install` to verify it works
- Confirm `package.json` exists with React 18+ and TypeScript 5+

### 4. Create base config files

Create the following at the repository root:

**`.gitignore`** — should cover at minimum:
- Go: `*.exe`, build artifacts, `vendor/`
- Node: `node_modules/`, `dist/`, `.env*`, `!.env.example`
- IDE: `.vscode/`, `.idea/`, `.DS_Store`
- Database: any local DB volume directories
- Generated code: keep `internal/db/` empty in this step (sqlc generates here later, but no ignore needed)

**`README.md`** — should contain:
- Project name and one-line description (use the core value statement)
- Tech stack summary
- Prerequisites (Go 1.22+, Node 20+, Docker)
- Development setup commands (placeholder, will be filled in step 2)
- Link to `docs/spec.md` for full specification

**`backend/.env.example`** — placeholder for now, contents:
```
DATABASE_URL=postgres://atoikura:dev_password@localhost:5432/atoikura?sslmode=disable
PORT=8080
```

**`frontend/.env.example`**:
```
VITE_API_URL=http://localhost:8080
```

### 5. Verify nothing is broken

- `cd backend && go build ./...` should succeed (no code yet, just the empty module)
- `cd frontend && npm run build` should succeed (default Vite scaffold builds)

## Verification Checklist

- [ ] All directories from `CLAUDE.md` exist (with `.gitkeep` where empty)
- [ ] `backend/go.mod` exists with Go 1.22+
- [ ] `frontend/package.json` exists with React + TypeScript
- [ ] `frontend/npm run build` succeeds
- [ ] `.gitignore`, `README.md`, `.env.example` files are in place
- [ ] No application code is written yet (no main.go, no App.tsx logic beyond Vite default)

## Commit Plan

Suggested commits (one per logical change):

1. `chore(repo): create monorepo directory skeleton`
2. `chore(backend): init Go module`
3. `chore(frontend): scaffold Vite + React + TypeScript`
4. `chore(repo): add base config files (.gitignore, README, .env.example)`

## After Completion

- Push the feature branch
- Open PR to `develop`
- Wait for user confirmation before proceeding to Step 2

## Out of Scope (Do NOT do these)

- No Dockerfiles yet (Step 2)
- No docker-compose.yml yet (Step 2)
- No migration SQL yet (Step 3)
- No sqlc.yaml yet (Step 4)
- No HTTP handlers, no DB connection, nothing executable on the backend
- No API calls or forms in the frontend
