CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR NOT NULL UNIQUE,
    display_name VARCHAR,
    last_name VARCHAR,
    first_name VARCHAR,
    password_hash VARCHAR NOT NULL,
    timezone VARCHAR NOT NULL DEFAULT 'Asia/Tokyo',
    avatar_url VARCHAR,
    last_login_at TIMESTAMPTZ,
    is_deleted BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    version INTEGER NOT NULL DEFAULT 1
);
