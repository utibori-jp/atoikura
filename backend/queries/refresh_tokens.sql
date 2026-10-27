-- name: CreateRefreshTokenInNewFamily :exec
-- First refresh token of a login; later rotations share its family_id.
INSERT INTO refresh_tokens (user_id, family_id, device_name, token_hash, expires_at)
VALUES ($1, gen_random_uuid(), $2, $3, $4);

-- name: CreateRefreshTokenInFamily :exec
INSERT INTO refresh_tokens (user_id, family_id, device_name, token_hash, expires_at)
VALUES ($1, $2, $3, $4, $5);

-- name: GetRefreshTokenForUpdate :one
-- Locks the token row so that two concurrent refreshes cannot both rotate it.
-- Tokens of deleted users are never returned.
SELECT rt.id, rt.user_id, rt.family_id, rt.device_name, rt.expires_at, rt.used_at, rt.revoked_at
FROM refresh_tokens rt
JOIN users u ON u.id = rt.user_id AND u.is_deleted = false
WHERE rt.token_hash = $1
FOR UPDATE OF rt;

-- name: MarkRefreshTokenUsed :exec
UPDATE refresh_tokens SET used_at = NOW() WHERE id = $1;

-- name: RevokeRefreshTokenFamily :exec
UPDATE refresh_tokens SET revoked_at = NOW() WHERE family_id = $1 AND revoked_at IS NULL;
