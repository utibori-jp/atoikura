package handler

import (
	"encoding/base64"
	"testing"
)

func TestParseBasicAuthHeader(t *testing.T) {
	tests := []struct {
		name         string
		header       string
		wantEmail    string
		wantPassword string
		wantOK       bool
	}{
		{
			name:         "valid credentials",
			header:       "Basic " + base64.StdEncoding.EncodeToString([]byte("user@example.com:secret")),
			wantEmail:    "user@example.com",
			wantPassword: "secret",
			wantOK:       true,
		},
		{
			name:         "password with colon",
			header:       "Basic " + base64.StdEncoding.EncodeToString([]byte("user@example.com:pa:ss")),
			wantEmail:    "user@example.com",
			wantPassword: "pa:ss",
			wantOK:       true,
		},
		{
			name:   "bearer token rejected",
			header: "Bearer sometoken",
			wantOK: false,
		},
		{
			name:   "empty header",
			header: "",
			wantOK: false,
		},
		{
			name:   "no colon in decoded value",
			header: "Basic " + base64.StdEncoding.EncodeToString([]byte("nocolon")),
			wantOK: false,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			email, password, ok := parseBasicAuthHeader(tc.header)
			if ok != tc.wantOK {
				t.Fatalf("ok = %v, want %v", ok, tc.wantOK)
			}
			if ok {
				if email != tc.wantEmail {
					t.Errorf("email = %q, want %q", email, tc.wantEmail)
				}
				if password != tc.wantPassword {
					t.Errorf("password = %q, want %q", password, tc.wantPassword)
				}
			}
		})
	}
}
