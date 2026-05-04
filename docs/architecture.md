# Architecture

技術スタックとリポジトリ構成のリファレンス。
Claude Code・人間どちらも参照する。

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
| Database | PostgreSQL 16 |
| Dev environment | Docker Compose (3 containers: db / backend / frontend) |
| Deployment target | K3s (self-hosted, Tailscale internal). Deploy strategy TBD. |

---

## Repository Layout

```
atoikura/
├── backend/
│   ├── cmd/server/main.go
│   ├── internal/
│   │   ├── handler/        # HTTP handlers
│   │   ├── repository/     # Wraps sqlc-generated code
│   │   └── db/             # sqlc-generated code (do not edit by hand)
│   ├── migrations/         # golang-migrate SQL files
│   ├── queries/            # sqlc input SQL queries
│   ├── sqlc.yaml
│   ├── Dockerfile
│   ├── .env.example
│   └── go.mod
├── frontend/
│   ├── src/
│   ├── public/
│   ├── Dockerfile
│   ├── nginx.conf
│   ├── .env.example
│   ├── package.json
│   └── vite.config.ts
├── deploy/
│   └── k8s/                # K3s manifests (empty until deploy phase)
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
