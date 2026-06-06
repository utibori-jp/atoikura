package handler

import (
	"encoding/base64"
	"encoding/json"
	"strings"
	"testing"
	"time"
)

var testSecret = []byte("test-jwt-secret")

// makeExpiredToken builds a syntactically valid HS256 token whose exp is in the past.
func makeExpiredToken(t *testing.T, user_id int64) string {
	t.Helper()
	payload, err := json.Marshal(struct {
		Sub int64 `json:"sub"`
		Iat int64 `json:"iat"`
		Exp int64 `json:"exp"`
	}{
		Sub: user_id,
		Iat: time.Now().Add(-2 * jwtTokenExpiry).Unix(),
		Exp: time.Now().Add(-jwtTokenExpiry).Unix(),
	})
	if err != nil {
		t.Fatalf("makeExpiredToken marshal: %v", err)
	}
	header_dot_payload := jwtHeaderEncoded + "." + base64.RawURLEncoding.EncodeToString(payload)
	return header_dot_payload + "." + jwtSign(header_dot_payload, testSecret)
}

func TestIssueJWT(t *testing.T) {
	token, err := IssueJWT(99, testSecret)
	if err != nil {
		t.Fatalf("IssueJWT error: %v", err)
	}
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		t.Fatalf("expected 3 parts, got %d", len(parts))
	}
}

func TestVerifyJWT(t *testing.T) {
	tests := []struct {
		name      string
		makeToken func() string
		wantID    int64
		wantErr   bool
	}{
		{
			name: "valid token round-trip",
			makeToken: func() string {
				tok, _ := IssueJWT(42, testSecret)
				return tok
			},
			wantID: 42,
		},
		{
			name: "wrong secret",
			makeToken: func() string {
				tok, _ := IssueJWT(1, testSecret)
				return tok
			},
			wantErr: true, // verified with different secret below
		},
		{
			name: "expired token",
			makeToken: func() string {
				return makeExpiredToken(t, 7)
			},
			wantErr: true,
		},
		{
			name:      "empty string",
			makeToken: func() string { return "" },
			wantErr:   true,
		},
		{
			name:      "only two parts",
			makeToken: func() string { return "a.b" },
			wantErr:   true,
		},
		{
			name:      "four parts",
			makeToken: func() string { return "a.b.c.d" },
			wantErr:   true,
		},
		{
			name: "tampered payload keeps valid signature structure",
			makeToken: func() string {
				tok, _ := IssueJWT(1, testSecret)
				parts := strings.SplitN(tok, ".", 3)
				// flip a bit in the payload segment
				b, _ := base64.RawURLEncoding.DecodeString(parts[1])
				b[0] ^= 0xFF
				parts[1] = base64.RawURLEncoding.EncodeToString(b)
				return strings.Join(parts, ".")
			},
			wantErr: true,
		},
		{
			name: "tampered header",
			makeToken: func() string {
				tok, _ := IssueJWT(1, testSecret)
				parts := strings.SplitN(tok, ".", 3)
				parts[0] = base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"none","typ":"JWT"}`))
				return strings.Join(parts, ".")
			},
			wantErr: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			secret := testSecret
			if tc.name == "wrong secret" {
				secret = []byte("other-secret")
			}
			user_id, err := VerifyJWT(tc.makeToken(), secret)
			if tc.wantErr {
				if err == nil {
					t.Errorf("expected error, got user_id=%d", user_id)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if user_id != tc.wantID {
				t.Errorf("user_id = %d, want %d", user_id, tc.wantID)
			}
		})
	}
}
