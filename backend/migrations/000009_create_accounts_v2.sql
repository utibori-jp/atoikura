CREATE TABLE IF NOT EXISTS accounts (
    id SERIAL PRIMARY KEY,
    account_code VARCHAR,
    account_name VARCHAR,
    account_type VARCHAR,
    user_id INTEGER NOT NULL REFERENCES users(id),
    description TEXT,
    is_deleted BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    version INTEGER NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX IF NOT EXISTS accounts_user_account_code_active_idx
    ON accounts (user_id, account_code)
    WHERE is_deleted = false AND account_code IS NOT NULL;

CREATE TABLE IF NOT EXISTS account_transactions (
    id SERIAL PRIMARY KEY,
    transaction_date DATE NOT NULL,
    description VARCHAR,
    amount INTEGER NOT NULL,
    account_id INTEGER NOT NULL REFERENCES accounts(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    version INTEGER NOT NULL DEFAULT 1
);
