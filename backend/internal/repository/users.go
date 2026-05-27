package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
)

var ErrUserNotFound = errors.New("user not found")

type UserAuthRecord struct {
	ID           int64
	Email        string
	DisplayName  *string
	PasswordHash string
	LastLoginAt  *time.Time
}

type UserProfile struct {
	ID          int64
	Email       string
	DisplayName *string
	LastLoginAt *time.Time
}

// GetUserByEmail returns the user used for credential verification.
// Returns ErrUserNotFound if no active user matches the email.
func (r *Repository) GetUserByEmail(ctx context.Context, email string) (*UserAuthRecord, error) {
	row, err := r.queries.GetUserByEmail(ctx, email)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrUserNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("getting user by email: %w", err)
	}
	return &UserAuthRecord{
		ID:           int64(row.ID),
		Email:        row.Email,
		DisplayName:  row.DisplayName,
		PasswordHash: row.PasswordHash,
		LastLoginAt:  row.LastLoginAt,
	}, nil
}

func (r *Repository) GetUserByID(ctx context.Context, user_id int64) (*UserProfile, error) {
	row, err := r.queries.GetUserByID(ctx, int32(user_id))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrUserNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("getting user by id: %w", err)
	}
	return &UserProfile{
		ID:          int64(row.ID),
		Email:       row.Email,
		DisplayName: row.DisplayName,
		LastLoginAt: row.LastLoginAt,
	}, nil
}

func (r *Repository) UpdateUserLastLogin(ctx context.Context, user_id int64) error {
	if err := r.queries.UpdateUserLastLogin(ctx, int32(user_id)); err != nil {
		return fmt.Errorf("updating last login: %w", err)
	}
	return nil
}
