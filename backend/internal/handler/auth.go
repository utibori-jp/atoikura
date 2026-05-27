package handler

import (
	"log/slog"
	"net/http"
	"time"

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
