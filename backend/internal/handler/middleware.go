package handler

import (
	"encoding/base64"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"

	"github.com/utibori-jp/atoikura/backend/internal/repository"
)

type responseWriter struct {
	http.ResponseWriter
	status int
}

func (rw *responseWriter) WriteHeader(status int) {
	rw.status = status
	rw.ResponseWriter.WriteHeader(status)
}

func LogRequest(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		rw := &responseWriter{ResponseWriter: w, status: http.StatusOK}
		start := time.Now()
		next.ServeHTTP(rw, r)
		slog.Info("request",
			"method", r.Method,
			"path", r.URL.Path,
			"status", rw.status,
			"duration_ms", time.Since(start).Milliseconds(),
		)
	})
}

func RecoverPanic(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if rec := recover(); rec != nil {
				slog.Error("panic recovered", "error", rec)
				WriteError(w, http.StatusInternalServerError, "INTERNAL_SERVER_ERROR", "an unexpected error occurred")
			}
		}()
		next.ServeHTTP(w, r)
	})
}

func AllowCORS(next http.Handler) http.Handler {
	allowedOrigin := os.Getenv("CORS_ALLOWED_ORIGIN")
	if allowedOrigin == "" {
		allowedOrigin = "http://localhost:3000"
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", allowedOrigin)
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// VerifyBasicAuth parses the Authorization header and looks up + verifies the user.
// Returns the user id on success, or an error code suitable for a 401 response.
func VerifyBasicAuth(r *http.Request, repo *repository.Repository) (int64, error) {
	email, password, ok := parseBasicAuthHeader(r.Header.Get("Authorization"))
	if !ok {
		return 0, errors.New("missing or malformed Authorization header")
	}
	user, err := repo.GetUserByEmail(r.Context(), email)
	if errors.Is(err, repository.ErrUserNotFound) {
		return 0, errors.New("invalid credentials")
	}
	if err != nil {
		return 0, err
	}
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)); err != nil {
		return 0, errors.New("invalid credentials")
	}
	return user.ID, nil
}

// parseBasicAuthHeader extracts (email, password) from an `Authorization: Basic ...` header.
// Mirrors http.Request.BasicAuth but works on the raw header string so it can be unit-tested directly.
func parseBasicAuthHeader(header string) (string, string, bool) {
	const prefix = "Basic "
	if len(header) < len(prefix) || !strings.EqualFold(header[:len(prefix)], prefix) {
		return "", "", false
	}
	decoded, err := base64.StdEncoding.DecodeString(header[len(prefix):])
	if err != nil {
		return "", "", false
	}
	sep := strings.IndexByte(string(decoded), ':')
	if sep < 0 {
		return "", "", false
	}
	return string(decoded[:sep]), string(decoded[sep+1:]), true
}

// publicPaths bypass Basic auth entirely. /auth/login verifies credentials
// itself inside the handler; /auth/signup is for users who have no account yet.
var publicPaths = map[string]bool{
	"/health":      true,
	"/auth/login":  true,
	"/auth/signup": true,
}

// RequireBasicAuth enforces Basic auth on every protected request and injects user_id into the context.
// Public endpoints (CORS preflight, /health, /auth/*) bypass auth.
func RequireBasicAuth(repo *repository.Repository) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Method == http.MethodOptions || publicPaths[r.URL.Path] {
				next.ServeHTTP(w, r)
				return
			}
			user_id, err := VerifyBasicAuth(r, repo)
			if err != nil {
				w.Header().Set("WWW-Authenticate", `Basic realm="atoikura"`)
				WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "認証情報が不正です")
				return
			}
			ctx := WithUserID(r.Context(), user_id)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func ChainMiddleware(h http.Handler, middlewares ...func(http.Handler) http.Handler) http.Handler {
	for i := len(middlewares) - 1; i >= 0; i-- {
		h = middlewares[i](h)
	}
	return h
}
