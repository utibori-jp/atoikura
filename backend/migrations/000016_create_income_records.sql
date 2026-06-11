CREATE TABLE IF NOT EXISTS income_records (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    transaction_date DATE NOT NULL,
    amount INTEGER NOT NULL,
    name VARCHAR(50) NOT NULL,
    income_type VARCHAR(10) NOT NULL CHECK (income_type IN ('salary', 'side', 'bonus', 'oneoff')),
    emoji VARCHAR(10) NOT NULL DEFAULT '💴',
    note TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS base_income_settings (
    user_id INTEGER NOT NULL PRIMARY KEY REFERENCES users(id),
    amount INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
