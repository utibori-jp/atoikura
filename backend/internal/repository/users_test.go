//go:build integration

package repository_test

import (
	"context"
	"testing"

	"github.com/utibori-jp/atoikura/backend/internal/repository"
)

func TestUsers_CreateWithDefaults(t *testing.T) {
	ctx := context.Background()
	name := "Test User"

	got, err := testRepo.CreateUserWithDefaults(ctx, "u_create@test.example", &name, "hash1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got.ID == 0 {
		t.Error("id is 0")
	}
	if got.Email != "u_create@test.example" {
		t.Errorf("email = %q, want %q", got.Email, "u_create@test.example")
	}
	if got.DisplayName == nil || *got.DisplayName != name {
		t.Errorf("display_name = %v, want %q", got.DisplayName, name)
	}
	if got.LastLoginAt != nil {
		t.Error("last_login_at should be nil on fresh create")
	}
}

func TestUsers_CreateWithDefaults_DuplicateEmail(t *testing.T) {
	ctx := context.Background()

	if _, err := testRepo.CreateUserWithDefaults(ctx, "u_dup@test.example", nil, "hash"); err != nil {
		t.Fatalf("first create: %v", err)
	}

	_, err := testRepo.CreateUserWithDefaults(ctx, "u_dup@test.example", nil, "hash2")
	if err != repository.ErrEmailTaken {
		t.Errorf("error = %v, want ErrEmailTaken", err)
	}
}

func TestUsers_GetByEmail_Found(t *testing.T) {
	ctx := context.Background()

	created, err := testRepo.CreateUserWithDefaults(ctx, "u_get@test.example", nil, "myhash")
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	got, err := testRepo.GetUserByEmail(ctx, "u_get@test.example")
	if err != nil {
		t.Fatalf("GetUserByEmail: %v", err)
	}
	if got.ID != created.ID {
		t.Errorf("id = %d, want %d", got.ID, created.ID)
	}
	if got.PasswordHash != "myhash" {
		t.Errorf("password_hash = %q, want %q", got.PasswordHash, "myhash")
	}
}

func TestUsers_GetByEmail_NotFound(t *testing.T) {
	ctx := context.Background()

	_, err := testRepo.GetUserByEmail(ctx, "nobody@test.example")
	if err != repository.ErrUserNotFound {
		t.Errorf("error = %v, want ErrUserNotFound", err)
	}
}

func TestUsers_UpdateLastLogin(t *testing.T) {
	ctx := context.Background()

	created, err := testRepo.CreateUserWithDefaults(ctx, "u_login@test.example", nil, "hash")
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	if err := testRepo.UpdateUserLastLogin(ctx, created.ID); err != nil {
		t.Fatalf("UpdateUserLastLogin: %v", err)
	}

	got, err := testRepo.GetUserByID(ctx, created.ID)
	if err != nil {
		t.Fatalf("GetUserByID: %v", err)
	}
	if got.LastLoginAt == nil {
		t.Error("last_login_at is nil after update")
	}
}

func TestUsers_UpdatePassword(t *testing.T) {
	ctx := context.Background()

	created, err := testRepo.CreateUserWithDefaults(ctx, "u_pw@test.example", nil, "oldhash")
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	if err := testRepo.UpdateUserPassword(ctx, created.ID, "newhash"); err != nil {
		t.Fatalf("UpdateUserPassword: %v", err)
	}

	got, err := testRepo.GetUserByEmail(ctx, "u_pw@test.example")
	if err != nil {
		t.Fatalf("GetUserByEmail: %v", err)
	}
	if got.PasswordHash != "newhash" {
		t.Errorf("password_hash = %q, want %q", got.PasswordHash, "newhash")
	}
}

func TestUsers_UpdatePassword_NotFound(t *testing.T) {
	ctx := context.Background()

	err := testRepo.UpdateUserPassword(ctx, 999999, "hash")
	if err != repository.ErrUserNotFound {
		t.Errorf("error = %v, want ErrUserNotFound", err)
	}
}
