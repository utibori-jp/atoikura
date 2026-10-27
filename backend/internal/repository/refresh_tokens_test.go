//go:build integration

package repository_test

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"

	"github.com/utibori-jp/atoikura/backend/internal/repository"
)

func newTokenUser(t *testing.T) int64 {
	t.Helper()
	user, err := testRepo.CreateUserWithDefaults(context.Background(), fmt.Sprintf("token-%d@example.com", time.Now().UnixNano()), nil, "testhash")
	if err != nil {
		t.Fatalf("creating user: %v", err)
	}
	return user.ID
}

func issueToken(t *testing.T, user_id int64) string {
	t.Helper()
	device_name := "test device"
	issued_token, err := testRepo.IssueRefreshToken(context.Background(), user_id, &device_name)
	if err != nil {
		t.Fatalf("issuing refresh token: %v", err)
	}
	if time.Until(issued_token.ExpiresAt) < repository.RefreshTokenLifetime-time.Minute {
		t.Fatalf("expires_at = %v, want ~90 days", issued_token.ExpiresAt)
	}
	return issued_token.Token
}

func TestRefreshToken_RotationAndStoredHash(t *testing.T) {
	ctx := context.Background()
	user_id := newTokenUser(t)
	first_token := issueToken(t, user_id)

	var plaintext_count int
	if err := testPool.QueryRow(ctx, "SELECT COUNT(*) FROM refresh_tokens WHERE token_hash = convert_to($1, 'UTF8')", first_token).Scan(&plaintext_count); err != nil {
		t.Fatalf("checking stored token: %v", err)
	}
	if plaintext_count != 0 {
		t.Fatal("refresh token stored in plaintext")
	}

	rotated_user_id, second_token, err := testRepo.RotateRefreshToken(ctx, first_token)
	if err != nil {
		t.Fatalf("rotating: %v", err)
	}
	if rotated_user_id != user_id || second_token.Token == first_token {
		t.Fatalf("rotation returned user %d, same token %v", rotated_user_id, second_token.Token == first_token)
	}
	if _, _, err := testRepo.RotateRefreshToken(ctx, second_token.Token); err != nil {
		t.Fatalf("rotating the rotated token: %v", err)
	}
}

func TestRefreshToken_ReuseRevokesFamily(t *testing.T) {
	ctx := context.Background()
	user_id := newTokenUser(t)
	first_token := issueToken(t, user_id)
	other_device_token := issueToken(t, user_id)

	_, second_token, err := testRepo.RotateRefreshToken(ctx, first_token)
	if err != nil {
		t.Fatalf("rotating: %v", err)
	}
	if _, _, err := testRepo.RotateRefreshToken(ctx, first_token); !errors.Is(err, repository.ErrRefreshTokenReused) {
		t.Fatalf("reusing rotated token: err = %v, want ErrRefreshTokenReused", err)
	}
	if _, _, err := testRepo.RotateRefreshToken(ctx, second_token.Token); !errors.Is(err, repository.ErrRefreshTokenInvalid) {
		t.Fatalf("token of revoked family: err = %v, want ErrRefreshTokenInvalid", err)
	}
	if _, _, err := testRepo.RotateRefreshToken(ctx, other_device_token); err != nil {
		t.Fatalf("other device's family was revoked: %v", err)
	}
}

func TestRefreshToken_RejectsUnknownExpiredRevokedAndDeletedUser(t *testing.T) {
	ctx := context.Background()

	t.Run("unknown", func(t *testing.T) {
		if _, _, err := testRepo.RotateRefreshToken(ctx, "not-a-token"); !errors.Is(err, repository.ErrRefreshTokenInvalid) {
			t.Fatalf("err = %v, want ErrRefreshTokenInvalid", err)
		}
	})
	t.Run("expired", func(t *testing.T) {
		user_id := newTokenUser(t)
		expired_token := issueToken(t, user_id)
		if _, err := testPool.Exec(ctx, "UPDATE refresh_tokens SET expires_at = NOW() - INTERVAL '1 second' WHERE user_id = $1", user_id); err != nil {
			t.Fatalf("expiring token: %v", err)
		}
		if _, _, err := testRepo.RotateRefreshToken(ctx, expired_token); !errors.Is(err, repository.ErrRefreshTokenInvalid) {
			t.Fatalf("err = %v, want ErrRefreshTokenInvalid", err)
		}
	})
	t.Run("revoked by logout", func(t *testing.T) {
		user_id := newTokenUser(t)
		logged_out_token := issueToken(t, user_id)
		if err := testRepo.RevokeRefreshToken(ctx, logged_out_token); err != nil {
			t.Fatalf("revoking: %v", err)
		}
		if _, _, err := testRepo.RotateRefreshToken(ctx, logged_out_token); !errors.Is(err, repository.ErrRefreshTokenInvalid) {
			t.Fatalf("err = %v, want ErrRefreshTokenInvalid", err)
		}
		if err := testRepo.RevokeRefreshToken(ctx, "unknown-token"); err != nil {
			t.Fatalf("revoking unknown token: %v", err)
		}
	})
	t.Run("deleted user", func(t *testing.T) {
		user_id := newTokenUser(t)
		deleted_user_token := issueToken(t, user_id)
		if _, err := testPool.Exec(ctx, "UPDATE users SET is_deleted = true WHERE id = $1", user_id); err != nil {
			t.Fatalf("deleting user: %v", err)
		}
		if _, _, err := testRepo.RotateRefreshToken(ctx, deleted_user_token); !errors.Is(err, repository.ErrRefreshTokenInvalid) {
			t.Fatalf("err = %v, want ErrRefreshTokenInvalid", err)
		}
	})
}
