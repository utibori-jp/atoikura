package handler

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

// okHandler is a trivial downstream handler that writes 200 and the user_id from context.
var okHandler = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
	user_id, ok := UserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "no user_id in context", http.StatusInternalServerError)
		return
	}
	w.Header().Set("X-User-ID", itoa(user_id))
	w.WriteHeader(http.StatusOK)
})

func itoa(n int64) string {
	if n == 0 {
		return "0"
	}
	buf := make([]byte, 0, 20)
	for n > 0 {
		buf = append([]byte{byte('0' + n%10)}, buf...)
		n /= 10
	}
	return string(buf)
}

func TestRequireBearerAuth(t *testing.T) {
	secret := []byte("middleware-test-secret")
	validToken, err := IssueJWT(55, secret)
	if err != nil {
		t.Fatalf("IssueJWT: %v", err)
	}

	handler := RequireBearerAuth(secret)(okHandler)

	tests := []struct {
		name       string
		path       string
		authHeader string
		wantStatus int
		wantUserID string
	}{
		{
			name:       "valid token",
			path:       "/budgets",
			authHeader: "Bearer " + validToken,
			wantStatus: http.StatusOK,
			wantUserID: "55",
		},
		{
			name:       "missing Authorization header",
			path:       "/budgets",
			wantStatus: http.StatusUnauthorized,
		},
		{
			name:       "Basic scheme rejected",
			path:       "/budgets",
			authHeader: "Basic dXNlcjpwYXNz",
			wantStatus: http.StatusUnauthorized,
		},
		{
			name:       "Bearer with invalid token",
			path:       "/budgets",
			authHeader: "Bearer not.a.valid.token",
			wantStatus: http.StatusUnauthorized,
		},
		{
			name: "Bearer with wrong secret",
			path: "/budgets",
			authHeader: func() string {
				tok, _ := IssueJWT(1, []byte("wrong-secret"))
				return "Bearer " + tok
			}(),
			wantStatus: http.StatusUnauthorized,
		},
		{
			name:       "expired token",
			path:       "/budgets",
			authHeader: "Bearer " + makeExpiredToken(t, 1),
			wantStatus: http.StatusUnauthorized,
		},
		{
			name:       "public path /auth/login bypasses auth",
			path:       "/auth/login",
			wantStatus: http.StatusInternalServerError, // okHandler returns 500 when no user_id
		},
		{
			name:       "public path /auth/signup bypasses auth",
			path:       "/auth/signup",
			wantStatus: http.StatusInternalServerError,
		},
		{
			name:       "public path /health bypasses auth",
			path:       "/health",
			wantStatus: http.StatusInternalServerError,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			r := httptest.NewRequest(http.MethodGet, tc.path, nil)
			if tc.authHeader != "" {
				r.Header.Set("Authorization", tc.authHeader)
			}
			w := httptest.NewRecorder()
			handler.ServeHTTP(w, r)

			if w.Code != tc.wantStatus {
				t.Errorf("status = %d, want %d (body: %s)", w.Code, tc.wantStatus, w.Body.String())
			}
			if tc.wantUserID != "" && w.Header().Get("X-User-ID") != tc.wantUserID {
				t.Errorf("X-User-ID = %q, want %q", w.Header().Get("X-User-ID"), tc.wantUserID)
			}
		})
	}
}

func TestRequireBearerAuth_OptionsPassThrough(t *testing.T) {
	secret := []byte("secret")
	handler := RequireBearerAuth(secret)(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))

	r := httptest.NewRequest(http.MethodOptions, "/budgets", nil)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, r)

	if w.Code != http.StatusNoContent {
		t.Errorf("OPTIONS status = %d, want 204", w.Code)
	}
}

func TestSetSecurityHeaders(t *testing.T) {
	response_recorder := httptest.NewRecorder()
	SetSecurityHeaders(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})).ServeHTTP(response_recorder, httptest.NewRequest(http.MethodGet, "/sync/pull", nil))

	expected_headers := map[string]string{
		"Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
		"X-Content-Type-Options":  "nosniff",
		"X-Frame-Options":         "DENY",
		"Referrer-Policy":         "no-referrer",
		"Cache-Control":           "no-store",
	}
	for header_name, expected_value := range expected_headers {
		if got_value := response_recorder.Header().Get(header_name); got_value != expected_value {
			t.Errorf("%s = %q, want %q", header_name, got_value, expected_value)
		}
	}
}

func TestAllowCORS_OriginList(t *testing.T) {
	t.Setenv("CORS_ALLOWED_ORIGIN", "https://app.example.com, http://localhost:4173")
	cors_handler := AllowCORS(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	for _, test_case := range []struct {
		request_origin string
		allowed_origin string
	}{
		{"https://app.example.com", "https://app.example.com"},
		{"http://localhost:4173", "http://localhost:4173"},
		{"https://evil.example.com", ""},
		{"", ""},
	} {
		request := httptest.NewRequest(http.MethodOptions, "/sync/pull", nil)
		if test_case.request_origin != "" {
			request.Header.Set("Origin", test_case.request_origin)
		}
		response_recorder := httptest.NewRecorder()
		cors_handler.ServeHTTP(response_recorder, request)

		if got_origin := response_recorder.Header().Get("Access-Control-Allow-Origin"); got_origin != test_case.allowed_origin {
			t.Errorf("origin %q: Access-Control-Allow-Origin = %q, want %q", test_case.request_origin, got_origin, test_case.allowed_origin)
		}
		if response_recorder.Header().Get("Vary") != "Origin" {
			t.Errorf("origin %q: missing Vary: Origin", test_case.request_origin)
		}
		if response_recorder.Code != http.StatusNoContent {
			t.Errorf("origin %q: preflight status = %d", test_case.request_origin, response_recorder.Code)
		}
	}
}

func TestAllowCORS_DefaultsToTheDevServer(t *testing.T) {
	t.Setenv("CORS_ALLOWED_ORIGIN", "")
	request := httptest.NewRequest(http.MethodGet, "/health", nil)
	request.Header.Set("Origin", "http://localhost:3000")
	response_recorder := httptest.NewRecorder()
	AllowCORS(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {})).ServeHTTP(response_recorder, request)

	if got_origin := response_recorder.Header().Get("Access-Control-Allow-Origin"); got_origin != "http://localhost:3000" {
		t.Errorf("Access-Control-Allow-Origin = %q", got_origin)
	}
}
