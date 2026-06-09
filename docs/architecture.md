# Architecture

Reference for the technology stack and repository structure.
To be used by both Claude Code and human developers.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend language | Go 1.22+ |
| HTTP routing | Standard library `net/http` (Go 1.22+ ServeMux). No frameworks. |
| DB access | `sqlc` (handwritten SQL → type-safe Go code generation) |
| Migration | `golang-migrate` |
| Backend layering | `handler` + `repository` (2-layer). Add `usecase` only when logic gets complex. |
| Frontend | TypeScript + Vite + React |
| Frontend mobile | PWA with responsive design. Dedicated mobile component layouts with `vite-plugin-pwa`. Service worker caching strategy: NetworkFirst for dynamic data, CacheFirst for static masters. |
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
│   └── vite.config.ts          # VitePWA plugin configuration, service worker caching rules
├── deploy/
│   └── k8s/                 # K3s manifests (empty until deploy phase)
├── docs/
│   ├── spec.md
│   ├── atoikura.dbml
│   ├── atoikura-api.yaml
│   ├── architecture.md
│   ├── conventions/
│   └── prompts/
├── docker-compose.yml
├── .gitignore
├── CLAUDE.md
└── README.md
```
