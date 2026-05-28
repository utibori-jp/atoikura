package handler

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"

	"github.com/utibori-jp/atoikura/backend/internal/repository"
)

type loginResponseJSON struct {
	ID          int64      `json:"id"`
	Email       string     `json:"email"`
	DisplayName *string    `json:"display_name"`
	LastLoginAt *time.Time `json:"last_login_at"`
}

// LoginHandler is a probe endpoint: it does its own credential check against
// the Authorization header (so it can run outside the auth-protected middleware
// chain) and, on success, refreshes last_login_at and returns the user profile.
func LoginHandler(repo *repository.Repository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user_id, err := VerifyBasicAuth(r, repo)
		if err != nil {
			w.Header().Set("WWW-Authenticate", `Basic realm="atoikura"`)
			WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "認証情報が不正です")
			return
		}

		if err := repo.UpdateUserLastLogin(r.Context(), user_id); err != nil {
			slog.Error("updating last_login_at", "error", err)
			WriteError(w, http.StatusInternalServerError, "INTERNAL_SERVER_ERROR", "予期しないエラーが発生しました")
			return
		}

		profile, err := repo.GetUserByID(r.Context(), user_id)
		if err != nil {
			slog.Error("fetching user after login", "error", err)
			WriteError(w, http.StatusInternalServerError, "INTERNAL_SERVER_ERROR", "予期しないエラーが発生しました")
			return
		}

		WriteJSON(w, http.StatusOK, loginResponseJSON{
			ID:          profile.ID,
			Email:       profile.Email,
			DisplayName: profile.DisplayName,
			LastLoginAt: profile.LastLoginAt,
		})
	}
}

// SignupHandler creates a new account with default categories and returns the
// profile. Runs outside the auth-protected chain (the user has no credentials
// yet). On success the client stores the same credentials it just submitted.
func SignupHandler(repo *repository.Repository) http.HandlerFunc {
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

		WriteJSON(w, http.StatusCreated, loginResponseJSON{
			ID:          profile.ID,
			Email:       profile.Email,
			DisplayName: profile.DisplayName,
			LastLoginAt: profile.LastLoginAt,
		})
	}
}
