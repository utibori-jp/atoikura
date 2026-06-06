package handler

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"strings"
	"time"
)

const jwtTokenExpiry = 24 * time.Hour

var (
	errJWTMalformed = errors.New("malformed token")
	errJWTExpired   = errors.New("token expired")
	errJWTInvalid   = errors.New("invalid token signature")
)

// jwtHeaderEncoded is the base64url-encoded fixed header {"alg":"HS256","typ":"JWT"}.
var jwtHeaderEncoded = base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"HS256","typ":"JWT"}`))

// IssueJWT signs a new HS256 JWT containing user_id as the subject.
func IssueJWT(user_id int64, secret []byte) (string, error) {
	now := time.Now()
	payload, err := json.Marshal(struct {
		Sub int64 `json:"sub"`
		Iat int64 `json:"iat"`
		Exp int64 `json:"exp"`
	}{
		Sub: user_id,
		Iat: now.Unix(),
		Exp: now.Add(jwtTokenExpiry).Unix(),
	})
	if err != nil {
		return "", err
	}

	header_dot_payload := jwtHeaderEncoded + "." + base64.RawURLEncoding.EncodeToString(payload)
	sig := jwtSign(header_dot_payload, secret)
	return header_dot_payload + "." + sig, nil
}

// VerifyJWT verifies the token's signature and expiry, returning the user_id claim.
func VerifyJWT(token string, secret []byte) (int64, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return 0, errJWTMalformed
	}

	if parts[0] != jwtHeaderEncoded {
		return 0, errJWTInvalid
	}

	signing_input := parts[0] + "." + parts[1]
	if !hmac.Equal([]byte(parts[2]), []byte(jwtSign(signing_input, secret))) {
		return 0, errJWTInvalid
	}

	payload_bytes, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return 0, errJWTMalformed
	}
	var claims struct {
		Sub int64 `json:"sub"`
		Exp int64 `json:"exp"`
	}
	if err := json.Unmarshal(payload_bytes, &claims); err != nil {
		return 0, errJWTMalformed
	}
	if time.Now().Unix() > claims.Exp {
		return 0, errJWTExpired
	}
	return claims.Sub, nil
}

func jwtSign(data string, secret []byte) string {
	mac := hmac.New(sha256.New, secret)
	_, _ = mac.Write([]byte(data))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}
