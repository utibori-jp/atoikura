-- Household lifecycle commands (docs/local-first/design.md §6).

-- Members see each other's display name in the household. It is copied from
-- users when a membership starts, so pull never has to read the users table.
ALTER TABLE lf.ledger_members ADD COLUMN IF NOT EXISTS display_name TEXT;
UPDATE lf.ledger_members m SET display_name = u.display_name
    FROM users u
    WHERE u.id = m.user_id AND m.display_name IS NULL;

-- The allowance history has one amount per member and month it takes effect.
CREATE UNIQUE INDEX IF NOT EXISTS allowances_ledger_member_month_idx
    ON lf.allowances (ledger_id, member_id, effective_from)
    WHERE deleted = false;

-- Failed attempts to redeem an invitation, so that guessing short codes can be
-- rate-limited per user. Never synced.
CREATE TABLE IF NOT EXISTS lf.household_join_failures (
    id BIGSERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    failed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS household_join_failures_user_time_idx
    ON lf.household_join_failures (user_id, failed_at);
