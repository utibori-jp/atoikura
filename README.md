# atoikura

A personal budget management application. It allows users to see "how much more can be spent this month" at a glance.

---

## Requirements

* Docker / Docker Compose
* Go 1.25+ (for local development)
* Node.js 20+ (for local development)

---

## Development

### Start the database

```bash
docker compose up -d db

```

### Run migrations

```bash
cd backend && make migrate-up

```

### Run the frontend

```bash
cd frontend
npm install
npm run dev

```

The app will be available at http://localhost:3000.

### Stop everything

```bash
docker compose down

```

---

## Docs

* `docs/spec.md` — Specifications
* `docs/architecture.md` — Tech stack and architecture
* `docs/atoikura.dbml` — DB schema
* `docs/atoikura-api.yaml` — OpenAPI spec
* `docs/prompts/README.md` — Implementation roadmap for Claude Code
