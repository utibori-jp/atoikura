CREATE TABLE IF NOT EXISTS statement_types (
    id SERIAL PRIMARY KEY,
    type_code VARCHAR NOT NULL UNIQUE,
    statement_type_name VARCHAR NOT NULL,
    display_order INT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
