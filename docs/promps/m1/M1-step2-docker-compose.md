# M1 Step 2: Docker Compose Setup

## Goal

Set up `docker-compose.yml` with three services (db / backend / frontend) and
their respective Dockerfiles. The DB container should be runnable and accessible.
Backend and frontend Dockerfiles should be written but their containers are not
expected to fully work yet (no app code).

## Branch

Create `feature/m1-step2-docker-compose` off `develop`.

## Prerequisites

- Step 1 is merged to `develop`
- Repository skeleton is in place

## Tasks

### 1. Create `docker-compose.yml` at the repository root

Three services:

**`db`**:
- Image: `postgres:16`
- Environment: `POSTGRES_USER=atoikura`, `POSTGRES_PASSWORD=dev_password`, `POSTGRES_DB=atoikura`
- Port: `5432:5432`
- Volume: named volume `postgres_data` mounted at `/var/lib/postgresql/data`
- Healthcheck using `pg_isready`

**`backend`**:
- Build: `./backend`
- Environment:
  - `DATABASE_URL=postgres://atoikura:dev_password@db:5432/atoikura?sslmode=disable`
  - `PORT=8080`
- Port: `8080:8080`
- `depends_on`: db (with condition `service_healthy`)

**`frontend`**:
- Build: `./frontend`
- Environment: `VITE_API_URL=http://localhost:8080`
- Port: `3000:80`
- `depends_on`: backend

Define the named volume `postgres_data` at the bottom.

### 2. Create `backend/Dockerfile` (multi-stage build)

```dockerfile
# Build stage
FROM golang:1.22 AS builder
WORKDIR /app
COPY go.mod go.sum* ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /server ./cmd/server

# Runtime stage
FROM gcr.io/distroless/static-debian12
COPY --from=builder /server /server
EXPOSE 8080
ENTRYPOINT ["/server"]
```

Note: this will fail to build until `cmd/server/main.go` exists (Step 5). That's expected.
Document this in a comment at the top of the Dockerfile.

### 3. Create `frontend/Dockerfile` and `frontend/nginx.conf`

`frontend/Dockerfile`:
```dockerfile
# Build stage
FROM node:20 AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Runtime stage
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

`frontend/nginx.conf`:
- Serve `/usr/share/nginx/html`
- Fallback to `index.html` for SPA routing (`try_files $uri $uri/ /index.html;`)
- No backend proxy yet (frontend talks to backend directly via `VITE_API_URL`)

### 4. Verify the DB container works

```
docker compose up -d db
docker compose ps
docker compose exec db psql -U atoikura -d atoikura -c "SELECT version();"
```

This should print the PostgreSQL version. Then:

```
docker compose down
```

Backend and frontend containers won't fully work yet (no app code), but
`docker compose build` should at least succeed for the frontend (it has the
default Vite scaffold). Backend build will fail because there's no `main.go`
— that's fine for this step.

### 5. Update `README.md`

Replace the Step 1 placeholder with real dev setup instructions:

```markdown
## Development

### Start the database
\`\`\`
docker compose up -d db
\`\`\`

### Stop everything
\`\`\`
docker compose down
\`\`\`

(Backend and frontend containers will be runnable after Step 5 and Step 7 respectively.)
```

## Verification Checklist

- [ ] `docker-compose.yml` defines `db`, `backend`, `frontend` services
- [ ] `backend/Dockerfile` exists with multi-stage build using distroless runtime
- [ ] `frontend/Dockerfile` and `frontend/nginx.conf` exist
- [ ] `docker compose up -d db` starts PostgreSQL successfully
- [ ] `docker compose exec db psql -U atoikura -d atoikura -c "SELECT version();"` works
- [ ] README has a working "start the database" section

## Commit Plan

1. `chore(docker): add docker-compose.yml with db, backend, frontend services`
2. `chore(backend): add multi-stage Dockerfile`
3. `chore(frontend): add Dockerfile and nginx config`
4. `docs(readme): document database startup`

## After Completion

PR to `develop`. Wait for user confirmation.

## Out of Scope

- No migrations yet (Step 3)
- No app code (Steps 5-7)
- Backend container build failures are expected and acceptable for now
