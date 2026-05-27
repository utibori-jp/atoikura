-- name: GetUserByEmail :one
SELECT id, email, display_name, password_hash, last_login_at
FROM users
WHERE email = $1 AND is_deleted = false;

-- name: GetUserByID :one
SELECT id, email, display_name, last_login_at
FROM users
WHERE id = $1 AND is_deleted = false;

-- name: UpdateUserLastLogin :exec
UPDATE users
SET last_login_at = NOW(),
    updated_at    = NOW()
WHERE id = $1;
