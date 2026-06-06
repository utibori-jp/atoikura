package handler

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"

	"github.com/utibori-jp/atoikura/backend/internal/repository"
)

// authRepository is the subset of repository.Repository used by auth handlers.
// Defined as an interface to allow unit testing without a real database.
type authRepository interface {
	GetUserByEmail(ctx context.Context, email string) (*repository.UserAuthRecord, error)
	UpdateUserLastLogin(ctx context.Context, user_id int64) error
	CreateUserWithDefaults(ctx context.Context, email string, display_name *string, password_hash string) (*repository.UserProfile, error)
}

type authResponseJSON struct {
	Token       string     `json:"token"`
	ID          int64      `json:"id"`
	Email       string     `json:"email"`
	DisplayName *string    `json:"display_name"`
	LastLoginAt *time.Time `json:"last_login_at"`
}

// LoginHandler verifies email/password from the JSON body and returns a JWT on success.
func LoginHandler(repo authRepository, jwt_secret []byte) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		type loginRequestJSON struct {
			Email    string `json:"email"`
			Password string `json:"password"`
		}
		var req loginRequestJSON
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "リクエストの形式が不正です")
			return
		}

		user, err := repo.GetUserByEmail(r.Context(), strings.TrimSpace(req.Email))
		if errors.Is(err, repository.ErrUserNotFound) {
			WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "認証情報が不正です")
			return
		}
		if err != nil {
			slog.Error("fetching user for login", "error", err)
			WriteError(w, http.StatusInternalServerError, "INTERNAL_SERVER_ERROR", "予期しないエラーが発生しました")
			return
		}
		if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
			WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "認証情報が不正です")
			return
		}

		if err := repo.UpdateUserLastLogin(r.Context(), user.ID); err != nil {
			slog.Error("updating last_login_at", "error", err)
			WriteError(w, http.StatusInternalServerError, "INTERNAL_SERVER_ERROR", "予期しないエラーが発生しました")
			return
		}

		token, err := IssueJWT(user.ID, jwt_secret)
		if err != nil {
			slog.Error("issuing JWT", "error", err)
			WriteError(w, http.StatusInternalServerError, "INTERNAL_SERVER_ERROR", "予期しないエラーが発生しました")
			return
		}

		WriteJSON(w, http.StatusOK, authResponseJSON{
			Token:       token,
			ID:          user.ID,
			Email:       user.Email,
			DisplayName: user.DisplayName,
			LastLoginAt: user.LastLoginAt,
		})
	}
}

// SignupHandler creates a new account with default categories and returns a JWT.
func SignupHandler(repo authRepository, jwt_secret []byte) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		type signupRequestJSON struct {
			Email       string  `json:"email"`
			Password    string  `json:"password"`
			DisplayName *string `json:"display_name"`
		}
		var req signupRequestJSON
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "リクエストの形式が不正です")
			return
		}

		email := strings.TrimSpace(req.Email)
		if !emailPattern.MatchString(email) {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "メールアドレスの形式が不正です")
			return
		}
		if len([]rune(req.Password)) < minPasswordLength {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "パスワードは8文字以上で入力してください")
			return
		}

		var display_name *string
		if req.DisplayName != nil {
			trimmed := strings.TrimSpace(*req.DisplayName)
			if len([]rune(trimmed)) > 50 {
				WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "表示名は50文字以内で入力してください")
				return
			}
			if trimmed != "" {
				display_name = &trimmed
			}
		}

		password_hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
		if err != nil {
			slog.Error("hashing password", "error", err)
			WriteError(w, http.StatusInternalServerError, "INTERNAL_SERVER_ERROR", "予期しないエラーが発生しました")
			return
		}

		profile, err := repo.CreateUserWithDefaults(r.Context(), email, display_name, string(password_hash))
		if errors.Is(err, repository.ErrEmailTaken) {
			WriteError(w, http.StatusConflict, "EMAIL_TAKEN", "このメールアドレスは既に登録されています")
			return
		}
		if err != nil {
			slog.Error("creating user", "error", err)
			WriteError(w, http.StatusInternalServerError, "INTERNAL_SERVER_ERROR", "予期しないエラーが発生しました")
			return
		}

		token, err := IssueJWT(profile.ID, jwt_secret)
		if err != nil {
			slog.Error("issuing JWT", "error", err)
			WriteError(w, http.StatusInternalServerError, "INTERNAL_SERVER_ERROR", "予期しないエラーが発生しました")
			return
		}

		WriteJSON(w, http.StatusCreated, authResponseJSON{
			Token:       token,
			ID:          profile.ID,
			Email:       profile.Email,
			DisplayName: profile.DisplayName,
			LastLoginAt: profile.LastLoginAt,
		})
	}
}
