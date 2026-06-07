package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/utibori-jp/atoikura/backend/internal/db"
)

var (
	ErrUserNotFound = errors.New("user not found")
	ErrEmailTaken   = errors.New("email already registered")
)

const uniqueViolationCode = "23505"

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

// CreateUserWithDefaults inserts a new user and seeds the default category
// groups + expense categories in a single transaction. Returns ErrEmailTaken
// if the email is already registered.
func (r *Repository) CreateUserWithDefaults(ctx context.Context, email string, display_name *string, password_hash string) (*UserProfile, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("beginning signup transaction: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	qtx := r.queries.WithTx(tx)

	created, err := qtx.CreateUser(ctx, db.CreateUserParams{
		Email:        email,
		DisplayName:  display_name,
		PasswordHash: password_hash,
	})
	if err != nil {
		var pg_err *pgconn.PgError
		if errors.As(err, &pg_err) && pg_err.Code == uniqueViolationCode {
			return nil, ErrEmailTaken
		}
		return nil, fmt.Errorf("creating user: %w", err)
	}

	for _, group := range defaultCategoryGroups {
		created_group, err := qtx.CreateCategoryGroup(ctx, db.CreateCategoryGroupParams{
			UserID:          created.ID,
			GroupName:       group.GroupName,
			StatementTypeID: group.StatementTypeID,
			Description:     nil,
		})
		if err != nil {
			return nil, fmt.Errorf("seeding category group %q: %w", group.GroupName, err)
		}
		for _, category_name := range group.Categories {
			if _, err := qtx.CreateExpenseCategory(ctx, db.CreateExpenseCategoryParams{
				UserID:       created.ID,
				GroupID:      created_group.ID,
				CategoryName: category_name,
				Description:  nil,
			}); err != nil {
				return nil, fmt.Errorf("seeding category %q: %w", category_name, err)
			}
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("committing signup transaction: %w", err)
	}

	return &UserProfile{
		ID:          int64(created.ID),
		Email:       created.Email,
		DisplayName: created.DisplayName,
		LastLoginAt: created.LastLoginAt,
	}, nil
}

// GetUserPasswordHash returns the bcrypt hash for the given user, used to
// verify the current password before a change.
func (r *Repository) GetUserPasswordHash(ctx context.Context, user_id int64) (string, error) {
	hash, err := r.queries.GetUserPasswordHashByID(ctx, int32(user_id))
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrUserNotFound
	}
	if err != nil {
		return "", fmt.Errorf("getting password hash: %w", err)
	}
	return hash, nil
}

// UpdateUserPassword sets a new bcrypt hash. Returns ErrUserNotFound if no
// active user matched.
func (r *Repository) UpdateUserPassword(ctx context.Context, user_id int64, password_hash string) error {
	rows, err := r.queries.UpdateUserPassword(ctx, db.UpdateUserPasswordParams{
		ID:           int32(user_id),
		PasswordHash: password_hash,
	})
	if err != nil {
		return fmt.Errorf("updating password: %w", err)
	}
	if rows == 0 {
		return ErrUserNotFound
	}
	return nil
}
