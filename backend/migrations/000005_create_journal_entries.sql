CREATE TABLE IF NOT EXISTS journal_entries (
    id SERIAL PRIMARY KEY,
    transaction_date DATE NOT NULL,
    item VARCHAR,
    amount INTEGER NOT NULL,
    is_excluded BOOLEAN NOT NULL DEFAULT false,
    category_id INTEGER NOT NULL REFERENCES expense_categories(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    version INTEGER NOT NULL DEFAULT 1
);
