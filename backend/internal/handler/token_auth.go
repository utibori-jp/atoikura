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

// maxDeviceNameLength matches refresh_tokens.device_name.
const maxDeviceNameLength = 100

// tokenAuthRepository is the subset of repository.Repository used by the
// access/refresh token endpoints of the local-first clients.
type tokenAuthRepository interface {
	GetUserByEmail(ctx context.Context, email string) (*repository.UserAuthRecord, error)
	UpdateUserLastLogin(ctx context.Context, user_id int64) error
	IssueRefreshToken(ctx context.Context, user_id int64, device_name *string) (*repository.IssuedRefreshToken, error)
	RotateRefreshToken(ctx context.Context, token string) (int64, *repository.IssuedRefreshToken, error)
	RevokeRefreshToken(ctx context.Context, token string) error
}

type tokenPairJSON struct {
	AccessToken           string    `json:"access_token"`
	AccessTokenExpiresAt  time.Time `json:"access_token_expires_at"`
	RefreshToken          string    `json:"refresh_token"`
	RefreshTokenExpiresAt time.Time `json:"refresh_token_expires_at"`
	UserID                int64     `json:"user_id"`
}

type refreshTokenRequestJSON struct {
	RefreshToken string `json:"refresh_token"`
}

func writeTokenPair(w http.ResponseWriter, user_id int64, refresh_token *repository.IssuedRefreshToken, jwt_secret []byte) {
	issued_at := time.Now()
	access_token, err := IssueJWTWithLifetime(user_id, jwt_secret, issued_at, AccessTokenLifetime)
	if err != nil {
		slog.Error("issuing access token", "error", err)
		WriteError(w, http.StatusInternalServerError, "INTERNAL_SERVER_ERROR", "予期しないエラーが発生しました")
		return
	}
	WriteJSON(w, http.StatusOK, tokenPairJSON{
		AccessToken:           access_token,
		AccessTokenExpiresAt:  issued_at.Add(AccessTokenLifetime).UTC(),
		RefreshToken:          refresh_token.Token,
		RefreshTokenExpiresAt: refresh_token.ExpiresAt.UTC(),
		UserID:                user_id,
	})
}

// TokenLoginHandler verifies email/password and returns a short-lived access token
// plus a refresh token bound to one device.
func TokenLoginHandler(repo tokenAuthRepository, jwt_secret []byte) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		type tokenLoginRequestJSON struct {
			Email      string  `json:"email"`
			Password   string  `json:"password"`
			DeviceName *string `json:"device_name"`
		}
		var req tokenLoginRequestJSON
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "リクエストの形式が不正です")
			return
		}
		var device_name *string
		if req.DeviceName != nil {
			trimmed_device_name := strings.TrimSpace(*req.DeviceName)
			if len([]rune(trimmed_device_name)) > maxDeviceNameLength {
				WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "端末名は100文字以内で入力してください")
				return
			}
			if trimmed_device_name != "" {
				device_name = &trimmed_device_name
			}
		}

		user, err := repo.GetUserByEmail(r.Context(), strings.TrimSpace(req.Email))
		if errors.Is(err, repository.ErrUserNotFound) {
			WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "認証情報が不正です")
			return
		}
		if err != nil {
			slog.Error("fetching user for token login", "error", err)
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

		refresh_token, err := repo.IssueRefreshToken(r.Context(), user.ID, device_name)
		if err != nil {
			slog.Error("issuing refresh token", "error", err)
			WriteError(w, http.StatusInternalServerError, "INTERNAL_SERVER_ERROR", "予期しないエラーが発生しました")
			return
		}
		writeTokenPair(w, user.ID, refresh_token, jwt_secret)
	}
}

// RefreshTokenHandler exchanges a refresh token for a new access token and a new
// refresh token. The presented refresh token can't be used again.
func RefreshTokenHandler(repo tokenAuthRepository, jwt_secret []byte) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req refreshTokenRequestJSON
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.RefreshToken == "" {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "リクエストの形式が不正です")
			return
		}
		user_id, refresh_token, err := repo.RotateRefreshToken(r.Context(), req.RefreshToken)
		if errors.Is(err, repository.ErrRefreshTokenReused) {
			slog.Warn("refresh token reuse detected; token family revoked")
		}
		if errors.Is(err, repository.ErrRefreshTokenInvalid) || errors.Is(err, repository.ErrRefreshTokenReused) {
			WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "再度ログインしてください")
			return
		}
		if err != nil {
			slog.Error("rotating refresh token", "error", err)
			WriteError(w, http.StatusInternalServerError, "INTERNAL_SERVER_ERROR", "予期しないエラーが発生しました")
			return
		}
		writeTokenPair(w, user_id, refresh_token, jwt_secret)
	}
}

// LogoutHandler revokes the refresh token of this device. It always answers 204
// for a well-formed request, so it reveals nothing about the token.
func LogoutHandler(repo tokenAuthRepository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req refreshTokenRequestJSON
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.RefreshToken == "" {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "リクエストの形式が不正です")
			return
		}
		if err := repo.RevokeRefreshToken(r.Context(), req.RefreshToken); err != nil {
			slog.Error("revoking refresh token", "error", err)
			WriteError(w, http.StatusInternalServerError, "INTERNAL_SERVER_ERROR", "予期しないエラーが発生しました")
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}
