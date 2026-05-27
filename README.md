# atoikura

A personal-budget app focused on one question: **how much can I still spend this month?**

It tracks the gap between a monthly variable-expense budget and cumulative spending. Income is intentionally excluded from the calculation.

Designed for family-internal use, deployed to a self-hosted K3s cluster reachable over Tailscale.

The UI is in Japanese (the target users are native Japanese speakers); the codebase, docs, and tooling are in English.

---

## Requirements

- Docker / Docker Compose
- Either:
  - VS Code with the **Dev Containers** extension (recommended; everything is bundled in `.devcontainer/`)
  - Or, for local development: Go 1.25+ and Node 24+

---

## Development

The devcontainer is the recommended path — it pins all toolchains, runs an egress firewall, and works the same on every machine.

### Option A: Devcontainer (recommended)

1. Open the repository in VS Code.
2. Run **Dev Containers: Reopen in Container** from the command palette.
3. First-time build takes 5–10 minutes. When it's done, a shell inside the container opens.
4. Inside the container, apply migrations:
   ```
   cd backend && make migrate-up
   ```
5. Start the backend and frontend in separate terminals:
   ```
   cd backend && make run                       # http://localhost:8080
   cd frontend && npm install && npm run dev    # http://localhost:3000
   ```

The `db` and `adminer` services come up automatically alongside the devcontainer. Adminer is at http://localhost:8001.

On container start, an egress firewall (`.devcontainer/init-firewall.sh`) blocks all outbound traffic except an allowlist (GitHub, npm registry, Go module proxy, Anthropic API, VS Code marketplace, etc.). If you add a dependency hosted somewhere new, update the allowlist in that script.

### Option B: Run locally without the devcontainer

```
docker compose up -d db                       # start just the database
cd backend && make migrate-up
cd backend && make run                        # http://localhost:8080
cd frontend && npm install && npm run dev     # http://localhost:3000
```

### Stop everything

```
docker compose down
```

---

## Docs

- `docs/spec.md` — product specification (in Japanese)
- `docs/architecture.md` — tech stack and repository layout
- `docs/atoikura.dbml` — database schema
- `docs/atoikura-api.yaml` — OpenAPI spec
- `docs/prompts/README.md` — implementation roadmap for Claude Code
