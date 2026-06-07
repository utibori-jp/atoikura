package handler

import (
	"context"
	"net/http"
	"testing"

	"golang.org/x/crypto/bcrypt"

	"github.com/utibori-jp/atoikura/backend/internal/repository"
	"github.com/utibori-jp/atoikura/backend/internal/testutil"
)

type fakeUserRepo struct {
	getUserByID        func(context.Context, int64) (*repository.UserProfile, error)
	getUserPasswordHash func(context.Context, int64) (string, error)
	updateUserPassword  func(context.Context, int64, string) error
}

func (f *fakeUserRepo) GetUserByID(ctx context.Context, user_id int64) (*repository.UserProfile, error) {
	if f.getUserByID != nil {
		return f.getUserByID(ctx, user_id)
	}
	email := "dev@atoikura.local"
	return &repository.UserProfile{ID: user_id, Email: email}, nil
}

func (f *fakeUserRepo) GetUserPasswordHash(ctx context.Context, user_id int64) (string, error) {
	if f.getUserPasswordHash != nil {
		return f.getUserPasswordHash(ctx, user_id)
	}
	hash, _ := bcrypt.GenerateFromPassword([]byte("correct-password"), bcrypt.MinCost)
	return string(hash), nil
}

func (f *fakeUserRepo) UpdateUserPassword(ctx context.Context, user_id int64, password_hash string) error {
	if f.updateUserPassword != nil {
		return f.updateUserPassword(ctx, user_id, password_hash)
	}
	return nil
}

func TestGetCurrentUserHandler(t *testing.T) {
	tests := []struct {
		name       string
		authed     bool
		repo       *fakeUserRepo
		wantStatus int
	}{
		{
			name:       "success",
			authed:     true,
			repo:       &fakeUserRepo{},
			wantStatus: http.StatusOK,
		},
		{
			name:       "unauthorized",
			authed:     false,
			repo:       &fakeUserRepo{},
			wantStatus: http.StatusUnauthorized,
		},
		{
			name:   "unauthorized when user not found in repo",
			authed: true,
			repo: &fakeUserRepo{
				getUserByID: func(_ context.Context, _ int64) (*repository.UserProfile, error) {
					return nil, repository.ErrUserNotFound
				},
			},
			wantStatus: http.StatusUnauthorized,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			r := testutil.NewRequest(t, http.MethodGet, "/users/me", nil)
			if tc.authed {
				r = authCtx(r, 1)
			}
			w := testutil.NewRecorder()
			GetCurrentUserHandler(tc.repo)(w, r)
			testutil.AssertStatus(t, w, tc.wantStatus)
		})
	}
}

func TestChangePasswordHandler(t *testing.T) {
	correctHash, _ := bcrypt.GenerateFromPassword([]byte("correct-password"), bcrypt.MinCost)

	tests := []struct {
		name       string
		authed     bool
		body       any
		repo       *fakeUserRepo
		wantStatus int
	}{
		{
			name:   "success",
			authed: true,
			body: map[string]any{
				"current_password": "correct-password",
				"new_password":     "new-valid-password",
			},
			repo: &fakeUserRepo{
				getUserPasswordHash: func(_ context.Context, _ int64) (string, error) {
					return string(correctHash), nil
				},
			},
			wantStatus: http.StatusNoContent,
		},
		{
			name:       "unauthorized",
			authed:     false,
			body:       map[string]any{"current_password": "x", "new_password": "valid-pass"},
			repo:       &fakeUserRepo{},
			wantStatus: http.StatusUnauthorized,
		},
		{
			name:   "bad request when new password too short",
			authed: true,
			body: map[string]any{
				"current_password": "correct-password",
				"new_password":     "short",
			},
			repo:       &fakeUserRepo{},
			wantStatus: http.StatusBadRequest,
		},
		{
			name:   "bad request when current password wrong",
			authed: true,
			body: map[string]any{
				"current_password": "wrong-password",
				"new_password":     "new-valid-password",
			},
			repo: &fakeUserRepo{
				getUserPasswordHash: func(_ context.Context, _ int64) (string, error) {
					return string(correctHash), nil
				},
			},
			wantStatus: http.StatusBadRequest,
		},
		{
			name:   "unauthorized when user not found",
			authed: true,
			body: map[string]any{
				"current_password": "correct-password",
				"new_password":     "new-valid-password",
			},
			repo: &fakeUserRepo{
				getUserPasswordHash: func(_ context.Context, _ int64) (string, error) {
					return "", repository.ErrUserNotFound
				},
			},
			wantStatus: http.StatusUnauthorized,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			r := testutil.NewRequest(t, http.MethodPut, "/users/me/password", tc.body)
			if tc.authed {
				r = authCtx(r, 1)
			}
			w := testutil.NewRecorder()
			ChangePasswordHandler(tc.repo)(w, r)
			testutil.AssertStatus(t, w, tc.wantStatus)
		})
	}
}
