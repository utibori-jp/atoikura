CREATE TABLE IF NOT EXISTS category_groups (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    group_name VARCHAR NOT NULL,
    statement_type_id INTEGER NOT NULL REFERENCES statement_types(id),
    description TEXT,
    is_deleted BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    version INTEGER NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX IF NOT EXISTS category_groups_user_group_name_active_idx
    ON category_groups (user_id, group_name)
    WHERE is_deleted = false;
