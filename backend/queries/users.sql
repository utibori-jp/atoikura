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

-- name: CreateUser :one
INSERT INTO users (email, display_name, password_hash)
VALUES ($1, $2, $3)
RETURNING id, email, display_name, last_login_at;

-- name: GetUserPasswordHashByID :one
SELECT password_hash
FROM users
WHERE id = $1 AND is_deleted = false;

-- name: UpdateUserPassword :execrows
UPDATE users
SET password_hash = $2,
    updated_at    = NOW(),
    version       = version + 1
WHERE id = $1 AND is_deleted = false;
