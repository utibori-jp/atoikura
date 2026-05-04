# M1 Step 5: Backend Skeleton

## Goal

Build the minimum runnable backend: `main.go`, DB connection pool, structured
logging, a health-check endpoint, basic middleware (CORS, logging, recovery),
and a hardcoded `user_id = 1` injection. No business endpoints yet (those come in Step 6).

## Branch

Create `feature/m1-step5-backend-skeleton` off `develop`.

## Prerequisites

- Step 4 merged. sqlc-generated code is available.

## Tasks

### 1. Create `backend/cmd/server/main.go`

Responsibilities:
- Read environment variables (`DATABASE_URL`, `PORT`)
- Open a pgxpool connection to PostgreSQL
- Configure structured logging via `log/slog`
- Set up `http.ServeMux` (Go 1.22+ enhanced one)
- Register middleware chain
- Register `GET /health` endpoint that returns 200 with `{"status":"ok"}`
- Start HTTP server with graceful shutdown on SIGTERM/SIGINT

Skeleton:

```go
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	slog.SetDefault(logger)

	if err := run(context.Background()); err != nil {
		slog.Error("server exited with error", "error", err)
		os.Exit(1)
	}
}

func run(parent_ctx context.Context) error {
	database_url := os.Getenv("DATABASE_URL")
	if database_url == "" {
		return errors.New("DATABASE_URL is required")
	}
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	signal_ctx, stop := signal.NotifyContext(parent_ctx, syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	db_pool, err := pgxpool.New(signal_ctx, database_url)
	if err != nil {
		return fmt.Errorf("connecting to database: %w", err)
	}
	defer db_pool.Close()

	if err := db_pool.Ping(signal_ctx); err != nil {
		return fmt.Errorf("pinging database: %w", err)
	}
	slog.Info("connected to database")

	mux := http.NewServeMux()
	registerRoutes(mux, db_pool)

	handler := chainMiddleware(mux, logRequest, injectHardcodedUser, recoverPanic, allowCORS)

	http_server := &http.Server{
		Addr:              ":" + port,
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
	}

	server_errors := make(chan error, 1)
	go func() {
		slog.Info("server listening", "port", port)
		if err := http_server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			server_errors <- err
		}
	}()

	select {
	case err := <-server_errors:
		return fmt.Errorf("listening: %w", err)
	case <-signal_ctx.Done():
		slog.Info("shutdown signal received")
	}

	shutdown_ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	return http_server.Shutdown(shutdown_ctx)
}

func registerRoutes(mux *http.ServeMux, db_pool *pgxpool.Pool) {
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	})
	// Step 6 will add more routes here.
}
```

### 2. Create middleware in `backend/internal/handler/middleware.go`

Implement these middleware functions. All take `http.Handler` and return `http.Handler`.

**`logRequest`**:
- Log method, path, status, duration via `slog`
- Use a `responseWriter` wrapper to capture status code

**`recoverPanic`**:
- `defer recover()`. On panic, log and return 500 with the standard `ErrorResponse` shape.

**`allowCORS`**:
- For M1, allow `http://localhost:3000` (the frontend dev origin)
- Handle `OPTIONS` preflight by returning 204

**`injectHardcodedUser`**:
- This is the V1 auth bypass. Inject `user_id = 1` into the request context using a typed key.
- Define an unexported context key type and a `UserIDFromContext(ctx) (int64, bool)` accessor.

**`chainMiddleware`**:
- Helper that composes middleware right-to-left:
  ```go
  func chainMiddleware(h http.Handler, middlewares ...func(http.Handler) http.Handler) http.Handler {
      for i := len(middlewares) - 1; i >= 0; i-- {
          h = middlewares[i](h)
      }
      return h
  }
  ```

### 3. Create context utilities in `backend/internal/handler/context.go`

```go
package handler

import "context"

type contextKey string

const userIDContextKey contextKey = "user_id"

func WithUserID(ctx context.Context, user_id int64) context.Context {
	return context.WithValue(ctx, userIDContextKey, user_id)
}

func UserIDFromContext(ctx context.Context) (int64, bool) {
	user_id, ok := ctx.Value(userIDContextKey).(int64)
	return user_id, ok
}
```

`injectHardcodedUser` uses `WithUserID(ctx, 1)` to attach the hardcoded user.

### 4. Create error response utility in `backend/internal/handler/response.go`

```go
package handler

import (
	"encoding/json"
	"log/slog"
	"net/http"
)

type ErrorResponse struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

func WriteJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if body != nil {
		if err := json.NewEncoder(w).Encode(body); err != nil {
			slog.Error("encoding response", "error", err)
		}
	}
}

func WriteError(w http.ResponseWriter, status int, code string, message string) {
	WriteJSON(w, status, ErrorResponse{Code: code, Message: message})
}
```

Match the codes used in `docs/atoikura-api.yaml` (`UNAUTHORIZED`, `BAD_REQUEST`, `NOT_FOUND`, `INTERNAL_SERVER_ERROR`).

### 5. Repository wrapper skeleton

Create `backend/internal/repository/repository.go`:

```go
package repository

import (
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/<your-username>/atoikura/backend/internal/db"
)

type Repository struct {
	pool    *pgxpool.Pool
	queries *db.Queries
}

func New(pool *pgxpool.Pool) *Repository {
	return &Repository{
		pool:    pool,
		queries: db.New(pool),
	}
}
```

Domain-specific methods (CreateJournalEntry, ListJournalEntries, etc.) come in Step 6.

### 6. Verify the server runs

Update `backend/Dockerfile` if needed (it should already work since `main.go` now exists).

```
docker compose up -d db
cd backend
go run ./cmd/server
```

In another terminal:
```
curl -i http://localhost:8080/health
# Expect: HTTP/1.1 200 OK with body {"status":"ok"}
```

Test the Docker build:
```
docker compose build backend
docker compose up -d backend
curl -i http://localhost:8080/health
docker compose down
```

### 7. Update `backend/Makefile`

```makefile
.PHONY: run

run:
	go run ./cmd/server
```

## Verification Checklist

- [ ] `go run ./cmd/server` starts the server without errors
- [ ] `GET /health` returns 200 with `{"status":"ok"}`
- [ ] Server logs incoming requests in JSON
- [ ] Graceful shutdown works (Ctrl+C should let the server exit cleanly)
- [ ] CORS preflight (`OPTIONS`) returns 204 with proper headers
- [ ] `docker compose up backend` succeeds and the container responds to `/health`

## Commit Plan

1. `feat(backend/cmd): add main.go with DB pool and graceful shutdown`
2. `feat(backend/handler): add middleware (logging, recovery, CORS)`
3. `feat(backend/handler): add hardcoded user_id=1 injection middleware`
4. `feat(backend/handler): add error response helpers`
5. `feat(backend/repository): add repository wrapper skeleton`
6. `feat(backend): add /health endpoint`
7. `chore(backend): add Makefile run target`

## After Completion

PR to `develop`. Wait for user confirmation.

## Out of Scope

- The 4 business endpoints (Step 6)
- Frontend (Step 7)
- Tests (M2 onward)
