package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"testing"
	"time"

	"golang.org/x/crypto/bcrypt"

	"github.com/utibori-jp/atoikura/backend/internal/repository"
	"github.com/utibori-jp/atoikura/backend/internal/testutil"
)

// fakeAuthRepo implements authRepository for handler tests without a real DB.
type fakeAuthRepo struct {
	user          *repository.UserAuthRecord
	getUserErr    error
	lastLoginErr  error
	createProfile *repository.UserProfile
	createErr     error
}

func (f *fakeAuthRepo) GetUserByEmail(_ context.Context, _ string) (*repository.UserAuthRecord, error) {
	return f.user, f.getUserErr
}

func (f *fakeAuthRepo) UpdateUserLastLogin(_ context.Context, _ int64) error {
	return f.lastLoginErr
}

func (f *fakeAuthRepo) CreateUserWithDefaults(_ context.Context, email string, display_name *string, _ string) (*repository.UserProfile, error) {
	if f.createErr != nil {
		return nil, f.createErr
	}
	if f.createProfile != nil {
		return f.createProfile, nil
	}
	return &repository.UserProfile{ID: 1, Email: email, DisplayName: display_name}, nil
}

// hashPassword is a test helper that generates a bcrypt hash for the given password.
func hashPassword(t *testing.T, password string) string {
	t.Helper()
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.MinCost)
	if err != nil {
		t.Fatalf("hashPassword: %v", err)
	}
	return string(hash)
}

var authTestSecret = []byte("auth-handler-test-secret")

// decodeAuthResponse decodes the authResponseJSON from the response body.
func decodeAuthResponse(t *testing.T, w interface{ Body() interface{ String() string } }) authResponseJSON {
	t.Helper()
	// handled via testutil.DecodeJSON pattern — use json.Decoder directly
	return authResponseJSON{}
}

func TestLoginHandler(t *testing.T) {
	displayName := "Alice"
	now := time.Now()
	validUser := &repository.UserAuthRecord{
		ID:           10,
		Email:        "alice@example.com",
		DisplayName:  &displayName,
		PasswordHash: hashPassword(t, "correct-horse"),
		LastLoginAt:  &now,
	}

	tests := []struct {
		name       string
		body       any
		repo       fakeAuthRepo
		wantStatus int
		wantToken  bool
	}{
		{
			name:       "valid credentials returns 200 and JWT",
			body:       map[string]string{"email": "alice@example.com", "password": "correct-horse"},
			repo:       fakeAuthRepo{user: validUser},
			wantStatus: http.StatusOK,
			wantToken:  true,
		},
		{
			name:       "wrong password returns 401",
			body:       map[string]string{"email": "alice@example.com", "password": "wrong"},
			repo:       fakeAuthRepo{user: validUser},
			wantStatus: http.StatusUnauthorized,
		},
		{
			name:       "unknown email returns 401",
			body:       map[string]string{"email": "nobody@example.com", "password": "whatever"},
			repo:       fakeAuthRepo{getUserErr: repository.ErrUserNotFound},
			wantStatus: http.StatusUnauthorized,
		},
		{
			name:       "bad JSON returns 400",
			body:       nil,
			repo:       fakeAuthRepo{},
			wantStatus: http.StatusBadRequest,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			var bodyStr string
			if tc.body != nil {
				b, _ := json.Marshal(tc.body)
				bodyStr = string(b)
			} else {
				bodyStr = "not-json{"
			}

			r := testutil.NewRequest(t, http.MethodPost, "/auth/login", nil)
			r.Body = io_nopCloser(strings.NewReader(bodyStr))
			r.Header.Set("Content-Type", "application/json")

			w := testutil.NewRecorder()
			LoginHandler(&tc.repo, authTestSecret)(w, r)
			testutil.AssertStatus(t, w, tc.wantStatus)

			if tc.wantToken {
				var resp authResponseJSON
				testutil.DecodeJSON(t, w, &resp)
				if resp.Token == "" {
					t.Error("expected non-empty token in response")
				}
				user_id, err := VerifyJWT(resp.Token, authTestSecret)
				if err != nil {
					t.Errorf("token verification failed: %v", err)
				}
				if user_id != validUser.ID {
					t.Errorf("token user_id = %d, want %d", user_id, validUser.ID)
				}
			}
		})
	}
}

func TestSignupHandler(t *testing.T) {
	tests := []struct {
		name       string
		body       any
		repo       fakeAuthRepo
		wantStatus int
		wantToken  bool
	}{
		{
			name:       "new user returns 201 and JWT",
			body:       map[string]string{"email": "bob@example.com", "password": "securepassword"},
			repo:       fakeAuthRepo{},
			wantStatus: http.StatusCreated,
			wantToken:  true,
		},
		{
			name:       "duplicate email returns 409",
			body:       map[string]string{"email": "existing@example.com", "password": "securepassword"},
			repo:       fakeAuthRepo{createErr: repository.ErrEmailTaken},
			wantStatus: http.StatusConflict,
		},
		{
			name:       "password too short returns 400",
			body:       map[string]string{"email": "short@example.com", "password": "1234567"},
			repo:       fakeAuthRepo{},
			wantStatus: http.StatusBadRequest,
		},
		{
			name:       "invalid email format returns 400",
			body:       map[string]string{"email": "not-an-email", "password": "securepassword"},
			repo:       fakeAuthRepo{},
			wantStatus: http.StatusBadRequest,
		},
		{
			name:       "bad JSON returns 400",
			body:       nil,
			repo:       fakeAuthRepo{},
			wantStatus: http.StatusBadRequest,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			var bodyStr string
			if tc.body != nil {
				b, _ := json.Marshal(tc.body)
				bodyStr = string(b)
			} else {
				bodyStr = "not-json{"
			}

			r := testutil.NewRequest(t, http.MethodPost, "/auth/signup", nil)
			r.Body = io_nopCloser(strings.NewReader(bodyStr))
			r.Header.Set("Content-Type", "application/json")

			w := testutil.NewRecorder()
			SignupHandler(&tc.repo, authTestSecret)(w, r)
			testutil.AssertStatus(t, w, tc.wantStatus)

			if tc.wantToken {
				var resp authResponseJSON
				testutil.DecodeJSON(t, w, &resp)
				if resp.Token == "" {
					t.Error("expected non-empty token in response")
				}
				_, err := VerifyJWT(resp.Token, authTestSecret)
				if err != nil {
					t.Errorf("token verification failed: %v", err)
				}
			}
		})
	}
}

// io_nopCloser wraps a strings.Reader to satisfy io.ReadCloser.
type nopCloser struct{ *strings.Reader }

func (nopCloser) Close() error { return nil }

func io_nopCloser(r *strings.Reader) nopCloser { return nopCloser{r} }
