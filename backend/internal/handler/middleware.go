package handler

import (
	"log/slog"
	"net/http"
	"os"
	"strings"
	"time"
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

// publicPaths bypass JWT auth entirely. /auth/login and /auth/signup are
// open endpoints; the former verifies credentials itself.
var publicPaths = map[string]bool{
	"/health":      true,
	"/auth/login":  true,
	"/auth/signup": true,
}

// RequireBearerAuth enforces JWT Bearer auth on every protected request and
// injects user_id into the context. Public endpoints and CORS preflight bypass auth.
func RequireBearerAuth(jwt_secret []byte) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Method == http.MethodOptions || publicPaths[r.URL.Path] {
				next.ServeHTTP(w, r)
				return
			}

			auth_header := r.Header.Get("Authorization")
			const prefix = "Bearer "
			if !strings.HasPrefix(auth_header, prefix) {
				WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "認証情報が不正です")
				return
			}
			token := auth_header[len(prefix):]

			user_id, err := VerifyJWT(token, jwt_secret)
			if err != nil {
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
