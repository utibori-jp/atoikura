CREATE TABLE IF NOT EXISTS surplus_allocations (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    year_month VARCHAR(7) NOT NULL,
    amount INTEGER NOT NULL CHECK (amount >= 1),
    destination VARCHAR(10) NOT NULL CHECK (destination IN ('budget', 'savings')),
    savings_goal_id INTEGER REFERENCES savings_goals(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK ((destination = 'savings' AND savings_goal_id IS NOT NULL) OR (destination = 'budget' AND savings_goal_id IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_surplus_allocations_user_ym ON surplus_allocations (user_id, year_month);
