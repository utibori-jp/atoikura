package handler

import (
	"context"
	"net/http"
	"testing"
	"time"

	"github.com/utibori-jp/atoikura/backend/internal/repository"
	"github.com/utibori-jp/atoikura/backend/internal/testutil"
)

type fakeTokenAuthRepo struct {
	fakeAuthRepo
	issued_device_name *string
	rotate_user_id     int64
	rotate_err         error
	revoked_tokens     []string
}

func (f *fakeTokenAuthRepo) IssueRefreshToken(_ context.Context, _ int64, device_name *string) (*repository.IssuedRefreshToken, error) {
	f.issued_device_name = device_name
	return &repository.IssuedRefreshToken{Token: "refresh-1", ExpiresAt: time.Now().Add(repository.RefreshTokenLifetime)}, nil
}

func (f *fakeTokenAuthRepo) RotateRefreshToken(_ context.Context, _ string) (int64, *repository.IssuedRefreshToken, error) {
	if f.rotate_err != nil {
		return 0, nil, f.rotate_err
	}
	return f.rotate_user_id, &repository.IssuedRefreshToken{Token: "refresh-2", ExpiresAt: time.Now().Add(repository.RefreshTokenLifetime)}, nil
}

func (f *fakeTokenAuthRepo) RevokeRefreshToken(_ context.Context, token string) error {
	f.revoked_tokens = append(f.revoked_tokens, token)
	return nil
}

func assertAccessTokenFor(t *testing.T, access_token string, want_user_id int64) {
	t.Helper()
	token_user_id, err := VerifyJWT(access_token, authTestSecret)
	if err != nil || token_user_id != want_user_id {
		t.Fatalf("access token user = %d, err = %v; want %d", token_user_id, err, want_user_id)
	}
}

func TestTokenLoginHandler(t *testing.T) {
	token_repo := &fakeTokenAuthRepo{fakeAuthRepo: fakeAuthRepo{user: &repository.UserAuthRecord{
		ID: 10, Email: "alice@example.com", PasswordHash: hashPassword(t, "password123"),
	}}}

	t.Run("success issues a short-lived access token and a refresh token", func(t *testing.T) {
		w := testutil.NewRecorder()
		TokenLoginHandler(token_repo, authTestSecret).ServeHTTP(w, testutil.NewRequest(t, http.MethodPost, "/auth/token", map[string]any{
			"email": "alice@example.com", "password": "password123", "device_name": "  iPhone  ",
		}))
		testutil.AssertStatus(t, w, http.StatusOK)
		var token_pair tokenPairJSON
		testutil.DecodeJSON(t, w, &token_pair)
		assertAccessTokenFor(t, token_pair.AccessToken, 10)
		access_lifetime := time.Until(token_pair.AccessTokenExpiresAt)
		if access_lifetime > AccessTokenLifetime || access_lifetime < AccessTokenLifetime-time.Minute {
			t.Fatalf("access token lifetime = %v, want 1h", access_lifetime)
		}
		if token_pair.RefreshToken != "refresh-1" || token_pair.UserID != 10 {
			t.Fatalf("token pair = %+v", token_pair)
		}
		if token_repo.issued_device_name == nil || *token_repo.issued_device_name != "iPhone" {
			t.Fatalf("device name = %v", token_repo.issued_device_name)
		}
	})

	t.Run("wrong password", func(t *testing.T) {
		w := testutil.NewRecorder()
		TokenLoginHandler(token_repo, authTestSecret).ServeHTTP(w, testutil.NewRequest(t, http.MethodPost, "/auth/token", map[string]any{
			"email": "alice@example.com", "password": "wrong-password",
		}))
		testutil.AssertStatus(t, w, http.StatusUnauthorized)
	})

	t.Run("device name too long", func(t *testing.T) {
		long_device_name := string(make([]rune, maxDeviceNameLength+1))
		w := testutil.NewRecorder()
		TokenLoginHandler(token_repo, authTestSecret).ServeHTTP(w, testutil.NewRequest(t, http.MethodPost, "/auth/token", map[string]any{
			"email": "alice@example.com", "password": "password123", "device_name": long_device_name + "x",
		}))
		testutil.AssertStatus(t, w, http.StatusBadRequest)
	})
}

func TestRefreshTokenHandler(t *testing.T) {
	test_cases := []struct {
		name        string
		body        map[string]any
		rotate_err  error
		want_status int
	}{
		{"success", map[string]any{"refresh_token": "refresh-1"}, nil, http.StatusOK},
		{"missing token", map[string]any{}, nil, http.StatusBadRequest},
		{"invalid token", map[string]any{"refresh_token": "x"}, repository.ErrRefreshTokenInvalid, http.StatusUnauthorized},
		{"reused token", map[string]any{"refresh_token": "x"}, repository.ErrRefreshTokenReused, http.StatusUnauthorized},
	}
	for _, test_case := range test_cases {
		t.Run(test_case.name, func(t *testing.T) {
			token_repo := &fakeTokenAuthRepo{rotate_user_id: 10, rotate_err: test_case.rotate_err}
			w := testutil.NewRecorder()
			RefreshTokenHandler(token_repo, authTestSecret).ServeHTTP(w, testutil.NewRequest(t, http.MethodPost, "/auth/refresh", test_case.body))
			testutil.AssertStatus(t, w, test_case.want_status)
			if test_case.want_status == http.StatusOK {
				var token_pair tokenPairJSON
				testutil.DecodeJSON(t, w, &token_pair)
				assertAccessTokenFor(t, token_pair.AccessToken, 10)
				if token_pair.RefreshToken != "refresh-2" {
					t.Fatalf("refresh token = %q, want rotated token", token_pair.RefreshToken)
				}
			}
		})
	}
}

func TestLogoutHandler(t *testing.T) {
	token_repo := &fakeTokenAuthRepo{}
	w := testutil.NewRecorder()
	LogoutHandler(token_repo).ServeHTTP(w, testutil.NewRequest(t, http.MethodPost, "/auth/logout", map[string]any{"refresh_token": "refresh-1"}))
	testutil.AssertStatus(t, w, http.StatusNoContent)
	if len(token_repo.revoked_tokens) != 1 || token_repo.revoked_tokens[0] != "refresh-1" {
		t.Fatalf("revoked = %v", token_repo.revoked_tokens)
	}

	w = testutil.NewRecorder()
	LogoutHandler(token_repo).ServeHTTP(w, testutil.NewRequest(t, http.MethodPost, "/auth/logout", map[string]any{}))
	testutil.AssertStatus(t, w, http.StatusBadRequest)
}

func TestIssueJWTWithLifetime_Expires(t *testing.T) {
	expired_token, err := IssueJWTWithLifetime(10, authTestSecret, time.Now().Add(-2*AccessTokenLifetime), AccessTokenLifetime)
	if err != nil {
		t.Fatalf("issuing: %v", err)
	}
	if _, err := VerifyJWT(expired_token, authTestSecret); err == nil {
		t.Fatal("expired access token verified")
	}
}
