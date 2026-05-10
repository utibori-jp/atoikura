CREATE TABLE IF NOT EXISTS expense_categories (
    id SERIAL PRIMARY KEY,
    category_code VARCHAR,
    category_name VARCHAR NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(id),
    group_id INTEGER NOT NULL REFERENCES category_groups(id),
    description TEXT,
    is_deleted BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    version INTEGER NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX IF NOT EXISTS expense_categories_user_category_code_active_idx
    ON expense_categories (user_id, category_code)
    WHERE is_deleted = false AND category_code IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS expense_categories_user_group_category_name_active_idx
    ON expense_categories (user_id, group_id, category_name)
    WHERE is_deleted = false;
