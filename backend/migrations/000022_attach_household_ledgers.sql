-- Household as an attachable ledger (docs/local-first/design.md D5, D15, §6).
-- Every user keeps one personal ledger and can be an active member of at most
-- one household ledger at the same time. Archive ledgers keep a read-only copy
-- of a household for a member who left it.

ALTER TABLE lf.ledgers DROP CONSTRAINT IF EXISTS ledgers_kind_check;
ALTER TABLE lf.ledgers ADD CONSTRAINT ledgers_kind_check
    CHECK (kind IN ('personal', 'household', 'archive'));

-- The ledger's kind is copied onto each membership so that "one active ledger
-- of each kind" can be a unique index.
ALTER TABLE lf.ledger_members ADD COLUMN IF NOT EXISTS ledger_kind VARCHAR(10);
UPDATE lf.ledger_members m SET ledger_kind = l.kind
    FROM lf.ledgers l
    WHERE l.id = m.ledger_id AND m.ledger_kind IS NULL;
ALTER TABLE lf.ledger_members ALTER COLUMN ledger_kind SET NOT NULL;
ALTER TABLE lf.ledger_members DROP CONSTRAINT IF EXISTS ledger_members_ledger_kind_check;
ALTER TABLE lf.ledger_members ADD CONSTRAINT ledger_members_ledger_kind_check
    CHECK (ledger_kind IN ('personal', 'household', 'archive'));

DROP INDEX IF EXISTS lf.ledger_members_one_active_ledger_idx;
CREATE UNIQUE INDEX IF NOT EXISTS ledger_members_one_active_per_kind_idx
    ON lf.ledger_members (user_id, ledger_kind)
    WHERE left_at IS NULL AND deleted = false AND ledger_kind IN ('personal', 'household');

-- A row's ledger replaces the wallet: personal-ledger rows are the member's
-- allowance side, household-ledger rows are shared.
DROP INDEX IF EXISTS lf.journal_entries_allowance_idx;
ALTER TABLE lf.journal_entries DROP COLUMN IF EXISTS wallet;
ALTER TABLE lf.recurring_expenses DROP COLUMN IF EXISTS wallet;

-- Allowance totals also report what a member put into personal savings (§3).
ALTER TABLE lf.allowance_totals ADD COLUMN IF NOT EXISTS saved INTEGER NOT NULL DEFAULT 0;

-- Allowance totals are summed from a member's personal ledger by month.
CREATE INDEX IF NOT EXISTS journal_entries_ledger_date_idx
    ON lf.journal_entries (ledger_id, transaction_date)
    WHERE deleted = false;

-- Household invitations are checked by the server only and never synced. The
-- token is stored as a SHA-256 hash; the short code is for typing in by hand.
CREATE TABLE IF NOT EXISTS lf.household_invitations (
    id UUID PRIMARY KEY,
    ledger_id UUID NOT NULL REFERENCES lf.ledgers(id),
    created_by INTEGER NOT NULL REFERENCES users(id),
    token_hash BYTEA NOT NULL,
    short_code VARCHAR(16) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    used_by INTEGER REFERENCES users(id),
    used_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS household_invitations_token_hash_idx
    ON lf.household_invitations (token_hash);

-- A short code only has to be unique among invitations that can still be used.
CREATE UNIQUE INDEX IF NOT EXISTS household_invitations_open_code_idx
    ON lf.household_invitations (short_code)
    WHERE used_at IS NULL AND revoked_at IS NULL;
