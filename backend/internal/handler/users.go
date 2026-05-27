package handler

import (
	"errors"
	"log/slog"
	"net/http"
	"time"

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
