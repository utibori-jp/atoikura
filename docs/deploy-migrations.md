# Migration Runbook

## Option A — Manual (current approach)

Run `migrate-prod.sh` from your local machine. It spawns a throwaway `postgres:16` pod via `kubectl` — no local `psql` required.

**Requirements:** `kubectl` configured with access to the cluster (e.g. via Tailscale + kubeconfig).

```bash
DATABASE_URL=postgres://<user>:<password>@<host>:5432/atoikura?sslmode=disable \
  ./backend/scripts/migrate-prod.sh
```

The script is idempotent — already-applied migrations are skipped. The pod is automatically deleted after the run (`--rm`).

---

## Option B — Init Container (next deployment)

When K3s manifests are written, add an init container to the backend Deployment so migrations run automatically before the server starts.

### 1. Add a `migrate` binary to the backend image

`backend/cmd/migrate/main.go` — reads `DATABASE_URL`, creates `applied_migrations` table, applies all `*.sql` files embedded via `embed.FS`, then exits 0.

Update `backend/Dockerfile`:

```dockerfile
FROM golang:1.25 AS builder
WORKDIR /app
COPY go.mod go.sum* ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /server  ./cmd/server
RUN CGO_ENABLED=0 GOOS=linux go build -o /migrate ./cmd/migrate

FROM gcr.io/distroless/static-debian12
COPY --from=builder /server  /server
COPY --from=builder /migrate /migrate
EXPOSE 8080
ENTRYPOINT ["/server"]
```

### 2. Add init container to the K3s Deployment manifest

```yaml
spec:
  template:
    spec:
      initContainers:
        - name: migrate
          image: ghcr.io/utibori-jp/atoikura-backend:<tag>
          command: ["/migrate"]
          env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: atoikura-backend-secret
                  key: DATABASE_URL
      containers:
        - name: backend
          image: ghcr.io/utibori-jp/atoikura-backend:<tag>
          # ...
```

The init container runs all pending migrations and exits 0. Only then does the `backend` container start. If migrations fail, the Pod stays in `Init:Error` and the server never starts.

### 3. Deploy

```bash
kubectl apply -f deploy/k8s/
```
