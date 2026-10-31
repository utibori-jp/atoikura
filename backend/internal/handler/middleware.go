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

// SetSecurityHeaders marks every API response as data that is never rendered,
// framed, sniffed or cached (#208). The app's own pages get their policy from
// the frontend (frontend/securityHeaders.ts).
func SetSecurityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		response_header := w.Header()
		response_header.Set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'")
		response_header.Set("X-Content-Type-Options", "nosniff")
		response_header.Set("X-Frame-Options", "DENY")
		response_header.Set("Referrer-Policy", "no-referrer")
		// Responses carry the user's data: no shared or browser cache keeps them.
		response_header.Set("Cache-Control", "no-store")
		next.ServeHTTP(w, r)
	})
}

// allowedOriginSet parses CORS_ALLOWED_ORIGIN, a comma-separated list of origins.
func allowedOriginSet(allowed_origins_value string) map[string]bool {
	if strings.TrimSpace(allowed_origins_value) == "" {
		allowed_origins_value = "http://localhost:3000"
	}
	allowed_origin_set := map[string]bool{}
	for _, allowed_origin := range strings.Split(allowed_origins_value, ",") {
		if trimmed_origin := strings.TrimSpace(allowed_origin); trimmed_origin != "" {
			allowed_origin_set[trimmed_origin] = true
		}
	}
	return allowed_origin_set
}

// AllowCORS lets the origins in CORS_ALLOWED_ORIGIN (comma-separated) call the
// API. The response names the caller's origin only when it is allowed.
func AllowCORS(next http.Handler) http.Handler {
	allowed_origin_set := allowedOriginSet(os.Getenv("CORS_ALLOWED_ORIGIN"))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Add("Vary", "Origin")
		if request_origin := r.Header.Get("Origin"); allowed_origin_set[request_origin] {
			w.Header().Set("Access-Control-Allow-Origin", request_origin)
		}
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Expose-Headers", SyncProtocolHeader)
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, "+SyncProtocolHeader)

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// publicPaths bypass JWT auth entirely. The /auth endpoints verify credentials
// (password or refresh token) themselves.
var publicPaths = map[string]bool{
	"/health":       true,
	"/auth/login":   true,
	"/auth/signup":  true,
	"/auth/token":   true,
	"/auth/refresh": true,
	"/auth/logout":  true,
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
