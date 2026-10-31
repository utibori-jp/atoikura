# Architecture

Reference for the technology stack and repository structure.
To be used by both Claude Code and human developers.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend language | Go 1.27+ |
| HTTP routing | Standard library `net/http` (Go 1.22+ ServeMux). No frameworks. |
| DB access | `sqlc` (handwritten SQL → type-safe Go code generation) |
| Migration | `golang-migrate` |
| Backend layering | `handler` + `repository` (2-layer). Add `usecase` only when logic gets complex. |
| Frontend | TypeScript + Vite + React |
| Frontend mobile | PWA with responsive design. Dedicated mobile component layouts with `vite-plugin-pwa`. The service worker precaches the app shell (including the SQLite WASM) so the app starts offline, caches only the web fonts at runtime, and never caches API responses: data lives in the local database. New versions wait for the in-app update prompt (or the next start). |
| Database | PostgreSQL 16 |
| Dev environment | Docker Compose (3 containers: db / backend / frontend) |
| Deployment target | K3s (self-hosted, Tailscale internal). Deploy strategy TBD. |

---

## Repository Layout

```text
atoikura/
├── backend/
│   ├── cmd/server/main.go
│   ├── internal/
│   │   ├── handler/         # HTTP handlers
│   │   ├── repository/      # Wraps sqlc-generated code
│   │   └── db/              # sqlc-generated code (do not edit by hand)
│   ├── migrations/          # golang-migrate SQL files
│   ├── queries/             # sqlc input SQL queries
│   ├── sqlc.yaml
│   ├── Dockerfile
│   ├── .env.example
│   └── go.mod
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── mobile/         # Responsive mobile screens (MobileHome, MobileJournal, MobileEntryForm)
│   │   │   └── ...             # Desktop components (HomeGraph, ReviewScreen, MasterManagement, etc.)
│   │   ├── api/                # API client and type definitions
│   │   └── test/               # Test setup and mocks
│   ├── public/
│   │   └── icons/              # PWA manifest icons (192px, 512px)
│   ├── Dockerfile
│   ├── nginx.conf
│   ├── .env.example
│   ├── package.json
│   └── vite.config.ts          # VitePWA plugin configuration: precache and update behaviour
├── deploy/
│   └── k8s/                 # K3s manifests (empty until deploy phase)
├── docs/
│   ├── spec.md                # product spec (source of truth)
│   ├── atoikura.dbml          # DB schema
│   ├── atoikura-api.yaml      # OpenAPI contracts
│   ├── architecture.md        # this file
│   ├── deploy-migrations.md   # production migration runbook
│   ├── conventions/           # backend & frontend coding conventions
│   └── design/                # high-fidelity UI design references (mobile & web)
├── docker-compose.yml
├── .gitignore
├── CLAUDE.md
└── README.md
```
