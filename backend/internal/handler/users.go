package handler

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"golang.org/x/crypto/bcrypt"

	"github.com/utibori-jp/atoikura/backend/internal/repository"
)

type userMeResponseJSON struct {
	ID          int64      `json:"id"`
	Email       string     `json:"email"`
	DisplayName *string    `json:"display_name"`
	LastLoginAt *time.Time `json:"last_login_at"`
}

func GetCurrentUserHandler(repo *repository.Repository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user_id, ok := UserIDFromContext(r.Context())
		if !ok {
			WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "認証情報が不正です")
			return
		}

		profile, err := repo.GetUserByID(r.Context(), user_id)
		if errors.Is(err, repository.ErrUserNotFound) {
			WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "認証情報が不正です")
			return
		}
		if err != nil {
			slog.Error("fetching current user", "error", err)
			WriteError(w, http.StatusInternalServerError, "INTERNAL_SERVER_ERROR", "予期しないエラーが発生しました")
			return
		}

		WriteJSON(w, http.StatusOK, userMeResponseJSON{
			ID:          profile.ID,
			Email:       profile.Email,
			DisplayName: profile.DisplayName,
			LastLoginAt: profile.LastLoginAt,
		})
	}
}

func ChangePasswordHandler(repo *repository.Repository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user_id, ok := UserIDFromContext(r.Context())
		if !ok {
			WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "認証情報が不正です")
			return
		}

		type passwordChangeRequestJSON struct {
			CurrentPassword string `json:"current_password"`
			NewPassword     string `json:"new_password"`
		}
		var req passwordChangeRequestJSON
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "リクエストの形式が不正です")
			return
		}
		if len([]rune(req.NewPassword)) < minPasswordLength {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "新しいパスワードは8文字以上で入力してください")
			return
		}

		current_hash, err := repo.GetUserPasswordHash(r.Context(), user_id)
		if errors.Is(err, repository.ErrUserNotFound) {
			WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "認証情報が不正です")
			return
		}
		if err != nil {
			slog.Error("fetching password hash", "error", err)
			WriteError(w, http.StatusInternalServerError, "INTERNAL_SERVER_ERROR", "予期しないエラーが発生しました")
			return
		}

		if err := bcrypt.CompareHashAndPassword([]byte(current_hash), []byte(req.CurrentPassword)); err != nil {
			WriteError(w, http.StatusBadRequest, "INVALID_CURRENT_PASSWORD", "現在のパスワードが正しくありません")
			return
		}

		new_hash, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
		if err != nil {
			slog.Error("hashing new password", "error", err)
			WriteError(w, http.StatusInternalServerError, "INTERNAL_SERVER_ERROR", "予期しないエラーが発生しました")
			return
		}

		if err := repo.UpdateUserPassword(r.Context(), user_id, string(new_hash)); err != nil {
			slog.Error("updating password", "error", err)
			WriteError(w, http.StatusInternalServerError, "INTERNAL_SERVER_ERROR", "予期しないエラーが発生しました")
			return
		}

		w.WriteHeader(http.StatusNoContent)
	}
}
