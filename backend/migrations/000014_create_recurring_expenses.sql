CREATE TABLE IF NOT EXISTS recurring_expenses (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    name VARCHAR(50) NOT NULL,
    emoji VARCHAR(10) NOT NULL DEFAULT '🔁',
    billing_day SMALLINT NOT NULL CHECK (billing_day >= 1 AND billing_day <= 31),
    amount INTEGER,
    type VARCHAR(10) NOT NULL DEFAULT 'fixed' CHECK (type IN ('fixed', 'variable')),
    category_id INTEGER NOT NULL REFERENCES expense_categories(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
