package repository

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/utibori-jp/atoikura/backend/internal/db"
)

// RefreshTokenLifetime is how long a refresh token stays valid (decided in #203).
const RefreshTokenLifetime = 90 * 24 * time.Hour

var (
	// ErrRefreshTokenInvalid covers unknown, expired and revoked tokens.
	ErrRefreshTokenInvalid = errors.New("refresh token invalid")
	// ErrRefreshTokenReused means an already-rotated token was presented again; the
	// whole family has been revoked because the token may have been stolen.
	ErrRefreshTokenReused = errors.New("refresh token reused")
)

// IssuedRefreshToken is a newly issued refresh token. Only its hash is stored.
type IssuedRefreshToken struct {
	Token     string
	ExpiresAt time.Time
}

func newRefreshTokenSecret() (string, []byte, error) {
	secret_bytes := make([]byte, 32)
	if _, err := rand.Read(secret_bytes); err != nil {
		return "", nil, fmt.Errorf("generating refresh token: %w", err)
	}
	token := base64.RawURLEncoding.EncodeToString(secret_bytes)
	return token, hashRefreshToken(token), nil
}

func hashRefreshToken(token string) []byte {
	token_hash := sha256.Sum256([]byte(token))
	return token_hash[:]
}

// IssueRefreshToken starts a new token family for a login on one device.
func (r *Repository) IssueRefreshToken(ctx context.Context, user_id int64, device_name *string) (*IssuedRefreshToken, error) {
	token, token_hash, err := newRefreshTokenSecret()
	if err != nil {
		return nil, err
	}
	expires_at := time.Now().Add(RefreshTokenLifetime)
	if err := r.queries.CreateRefreshTokenInNewFamily(ctx, db.CreateRefreshTokenInNewFamilyParams{
		UserID:     int32(user_id),
		DeviceName: device_name,
		TokenHash:  token_hash,
		ExpiresAt:  expires_at,
	}); err != nil {
		return nil, fmt.Errorf("storing refresh token: %w", err)
	}
	return &IssuedRefreshToken{Token: token, ExpiresAt: expires_at}, nil
}

// RotateRefreshToken exchanges a valid refresh token for a new one in the same
// family and returns the token's user. Presenting a token that was already
// rotated revokes the whole family (ErrRefreshTokenReused).
func (r *Repository) RotateRefreshToken(ctx context.Context, token string) (int64, *IssuedRefreshToken, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return 0, nil, fmt.Errorf("beginning refresh transaction: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	tx_queries := r.queries.WithTx(tx)

	stored_token, err := tx_queries.GetRefreshTokenForUpdate(ctx, hashRefreshToken(token))
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, nil, ErrRefreshTokenInvalid
	}
	if err != nil {
		return 0, nil, fmt.Errorf("loading refresh token: %w", err)
	}
	if stored_token.RevokedAt != nil || time.Now().After(stored_token.ExpiresAt) {
		return 0, nil, ErrRefreshTokenInvalid
	}
	if stored_token.UsedAt != nil {
		if err := tx_queries.RevokeRefreshTokenFamily(ctx, stored_token.FamilyID); err != nil {
			return 0, nil, fmt.Errorf("revoking reused refresh token family: %w", err)
		}
		if err := tx.Commit(ctx); err != nil {
			return 0, nil, fmt.Errorf("committing refresh token revocation: %w", err)
		}
		return 0, nil, ErrRefreshTokenReused
	}

	if err := tx_queries.MarkRefreshTokenUsed(ctx, stored_token.ID); err != nil {
		return 0, nil, fmt.Errorf("marking refresh token used: %w", err)
	}
	next_token, next_token_hash, err := newRefreshTokenSecret()
	if err != nil {
		return 0, nil, err
	}
	expires_at := time.Now().Add(RefreshTokenLifetime)
	if err := tx_queries.CreateRefreshTokenInFamily(ctx, db.CreateRefreshTokenInFamilyParams{
		UserID:     stored_token.UserID,
		FamilyID:   stored_token.FamilyID,
		DeviceName: stored_token.DeviceName,
		TokenHash:  next_token_hash,
		ExpiresAt:  expires_at,
	}); err != nil {
		return 0, nil, fmt.Errorf("storing rotated refresh token: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return 0, nil, fmt.Errorf("committing refresh token rotation: %w", err)
	}
	return int64(stored_token.UserID), &IssuedRefreshToken{Token: next_token, ExpiresAt: expires_at}, nil
}

// RevokeRefreshToken revokes the family of the given token (logout on one
// device). Unknown tokens are ignored so that logout reveals nothing.
func (r *Repository) RevokeRefreshToken(ctx context.Context, token string) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("beginning logout transaction: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	tx_queries := r.queries.WithTx(tx)

	stored_token, err := tx_queries.GetRefreshTokenForUpdate(ctx, hashRefreshToken(token))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("loading refresh token: %w", err)
	}
	if err := tx_queries.RevokeRefreshTokenFamily(ctx, stored_token.FamilyID); err != nil {
		return fmt.Errorf("revoking refresh token family: %w", err)
	}
	return tx.Commit(ctx)
}
