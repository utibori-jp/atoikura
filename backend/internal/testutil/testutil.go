// Package testutil provides helpers for HTTP handler tests.
package testutil

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

// NewRequest builds an *http.Request for handler tests.
// body may be nil; non-nil values are JSON-encoded.
func NewRequest(t *testing.T, method, path string, body any) *http.Request {
	t.Helper()
	var buf bytes.Buffer
	if body != nil {
		if err := json.NewEncoder(&buf).Encode(body); err != nil {
			t.Fatalf("testutil.NewRequest: marshal body: %v", err)
		}
	}
	r, err := http.NewRequestWithContext(context.Background(), method, path, &buf)
	if err != nil {
		t.Fatalf("testutil.NewRequest: %v", err)
	}
	if body != nil {
		r.Header.Set("Content-Type", "application/json")
	}
	return r
}

// NewRecorder returns a fresh ResponseRecorder.
func NewRecorder() *httptest.ResponseRecorder {
	return httptest.NewRecorder()
}

// AssertStatus fails the test if the recorded status code differs from want.
func AssertStatus(t *testing.T, w *httptest.ResponseRecorder, want int) {
	t.Helper()
	if w.Code != want {
		t.Errorf("status = %d, want %d\nbody: %s", w.Code, want, w.Body.String())
	}
}

// DecodeJSON decodes the response body into dest.
func DecodeJSON(t *testing.T, w *httptest.ResponseRecorder, dest any) {
	t.Helper()
	if err := json.NewDecoder(w.Body).Decode(dest); err != nil {
		t.Fatalf("DecodeJSON: %v\nbody: %s", err, w.Body.String())
	}
}
