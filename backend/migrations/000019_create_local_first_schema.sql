-- Local-first schema (docs/local-first/design.md §3.1, sync-protocol.md §2).
-- Lives in its own schema so it can sit alongside the legacy tables until the
-- migration in Step 7b. Every synced table carries the same envelope:
--   id, ledger_id, owner_id, seq, deleted, deleted_at, created_at, updated_at
-- seq is assigned from lf.sync_seq on every committed change and drives pull.
-- Offline-writable tables also carry field_hlc (field name -> HLC) for LWW.

CREATE SCHEMA IF NOT EXISTS lf;

CREATE SEQUENCE IF NOT EXISTS lf.sync_seq;

CREATE TABLE IF NOT EXISTS lf.ledgers (
    id UUID PRIMARY KEY,
    ledger_id UUID NOT NULL,
    owner_id INTEGER NOT NULL REFERENCES users(id),
    seq BIGINT NOT NULL,
    deleted BOOLEAN NOT NULL DEFAULT false,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    kind VARCHAR(10) NOT NULL CHECK (kind IN ('personal', 'household')),
    name TEXT,
    CHECK (ledger_id = id)
);

CREATE TABLE IF NOT EXISTS lf.ledger_members (
    id UUID PRIMARY KEY,
    ledger_id UUID NOT NULL REFERENCES lf.ledgers(id),
    owner_id INTEGER NOT NULL REFERENCES users(id),
    seq BIGINT NOT NULL,
    deleted BOOLEAN NOT NULL DEFAULT false,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    user_id INTEGER NOT NULL REFERENCES users(id),
    role VARCHAR(10) NOT NULL CHECK (role IN ('owner', 'member')),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    left_at TIMESTAMPTZ
);

-- A user belongs to exactly one ledger at a time (design.md D5).
CREATE UNIQUE INDEX IF NOT EXISTS ledger_members_one_active_ledger_idx
    ON lf.ledger_members (user_id)
    WHERE left_at IS NULL AND deleted = false;

CREATE TABLE IF NOT EXISTS lf.category_groups (
    id UUID PRIMARY KEY,
    ledger_id UUID NOT NULL REFERENCES lf.ledgers(id),
    owner_id INTEGER NOT NULL REFERENCES users(id),
    seq BIGINT NOT NULL,
    deleted BOOLEAN NOT NULL DEFAULT false,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    name TEXT NOT NULL,
    statement_type_code VARCHAR(10) NOT NULL CHECK (statement_type_code IN ('food', 'other', 'fixed', 'excluded')),
    description TEXT
);

CREATE TABLE IF NOT EXISTS lf.expense_categories (
    id UUID PRIMARY KEY,
    ledger_id UUID NOT NULL REFERENCES lf.ledgers(id),
    owner_id INTEGER NOT NULL REFERENCES users(id),
    seq BIGINT NOT NULL,
    deleted BOOLEAN NOT NULL DEFAULT false,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    group_id UUID NOT NULL REFERENCES lf.category_groups(id),
    name TEXT NOT NULL,
    category_code TEXT,
    description TEXT
);

CREATE TABLE IF NOT EXISTS lf.income_records (
    id UUID PRIMARY KEY,
    ledger_id UUID NOT NULL REFERENCES lf.ledgers(id),
    owner_id INTEGER NOT NULL REFERENCES users(id),
    seq BIGINT NOT NULL,
    deleted BOOLEAN NOT NULL DEFAULT false,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    earner_id INTEGER NOT NULL REFERENCES users(id),
    transaction_date DATE NOT NULL,
    amount INTEGER NOT NULL,
    name VARCHAR(50) NOT NULL,
    income_type VARCHAR(10) NOT NULL CHECK (income_type IN ('salary', 'side', 'bonus', 'oneoff')),
    emoji VARCHAR(10),
    note TEXT
);

CREATE TABLE IF NOT EXISTS lf.base_incomes (
    id UUID PRIMARY KEY,
    ledger_id UUID NOT NULL REFERENCES lf.ledgers(id),
    owner_id INTEGER NOT NULL REFERENCES users(id),
    seq BIGINT NOT NULL,
    deleted BOOLEAN NOT NULL DEFAULT false,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    member_id INTEGER NOT NULL REFERENCES users(id),
    amount INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS lf.recurring_expenses (
    id UUID PRIMARY KEY,
    ledger_id UUID NOT NULL REFERENCES lf.ledgers(id),
    owner_id INTEGER NOT NULL REFERENCES users(id),
    seq BIGINT NOT NULL,
    deleted BOOLEAN NOT NULL DEFAULT false,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    wallet VARCHAR(10) NOT NULL CHECK (wallet IN ('ledger', 'allowance')),
    name VARCHAR(50) NOT NULL,
    emoji VARCHAR(10),
    billing_day SMALLINT NOT NULL CHECK (billing_day >= 1 AND billing_day <= 31),
    amount INTEGER,
    type VARCHAR(10) NOT NULL CHECK (type IN ('fixed', 'variable')),
    category_id UUID NOT NULL REFERENCES lf.expense_categories(id)
);

CREATE TABLE IF NOT EXISTS lf.savings_goals (
    id UUID PRIMARY KEY,
    ledger_id UUID NOT NULL REFERENCES lf.ledgers(id),
    owner_id INTEGER NOT NULL REFERENCES users(id),
    seq BIGINT NOT NULL,
    deleted BOOLEAN NOT NULL DEFAULT false,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    name VARCHAR(50) NOT NULL,
    emoji VARCHAR(10),
    monthly_amount INTEGER NOT NULL DEFAULT 0,
    target_amount INTEGER NOT NULL DEFAULT 0,
    deadline VARCHAR(7),
    memo TEXT
);

CREATE TABLE IF NOT EXISTS lf.savings_postings (
    id UUID PRIMARY KEY,
    ledger_id UUID NOT NULL REFERENCES lf.ledgers(id),
    owner_id INTEGER NOT NULL REFERENCES users(id),
    seq BIGINT NOT NULL,
    deleted BOOLEAN NOT NULL DEFAULT false,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    goal_id UUID NOT NULL REFERENCES lf.savings_goals(id),
    year_month VARCHAR(7) NOT NULL,
    amount INTEGER NOT NULL,
    kind VARCHAR(10) NOT NULL CHECK (kind IN ('auto', 'manual'))
);

-- One automatic posting per goal per month (design.md §5.3).
CREATE UNIQUE INDEX IF NOT EXISTS savings_postings_auto_month_idx
    ON lf.savings_postings (goal_id, year_month)
    WHERE kind = 'auto';

CREATE TABLE IF NOT EXISTS lf.budgets (
    id UUID PRIMARY KEY,
    ledger_id UUID NOT NULL REFERENCES lf.ledgers(id),
    owner_id INTEGER NOT NULL REFERENCES users(id),
    seq BIGINT NOT NULL,
    deleted BOOLEAN NOT NULL DEFAULT false,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    monthly_budget INTEGER NOT NULL DEFAULT 0,
    goal_text TEXT,
    goal_amount INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS lf.allowances (
    id UUID PRIMARY KEY,
    ledger_id UUID NOT NULL REFERENCES lf.ledgers(id),
    owner_id INTEGER NOT NULL REFERENCES users(id),
    seq BIGINT NOT NULL,
    deleted BOOLEAN NOT NULL DEFAULT false,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    member_id INTEGER NOT NULL REFERENCES users(id),
    effective_from VARCHAR(7) NOT NULL,
    amount INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS lf.surplus_allocations (
    id UUID PRIMARY KEY,
    ledger_id UUID NOT NULL REFERENCES lf.ledgers(id),
    owner_id INTEGER NOT NULL REFERENCES users(id),
    seq BIGINT NOT NULL,
    deleted BOOLEAN NOT NULL DEFAULT false,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    year_month VARCHAR(7) NOT NULL,
    amount INTEGER NOT NULL CHECK (amount >= 1),
    destination VARCHAR(10) NOT NULL CHECK (destination IN ('budget', 'savings')),
    savings_goal_id UUID REFERENCES lf.savings_goals(id),
    CHECK ((destination = 'savings' AND savings_goal_id IS NOT NULL) OR (destination = 'budget' AND savings_goal_id IS NULL))
);

-- Server-computed view of each member's allowance spending. The id is the
-- composite "<member_id>:<year_month>" that devices use as the cache key.
CREATE TABLE IF NOT EXISTS lf.allowance_totals (
    id TEXT PRIMARY KEY,
    ledger_id UUID NOT NULL REFERENCES lf.ledgers(id),
    owner_id INTEGER NOT NULL REFERENCES users(id),
    seq BIGINT NOT NULL,
    deleted BOOLEAN NOT NULL DEFAULT false,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    member_id INTEGER NOT NULL REFERENCES users(id),
    year_month VARCHAR(7) NOT NULL,
    spent INTEGER NOT NULL
);

-- Offline-writable collections. Category references are not foreign keys: an entry
-- written offline may reference a category this server has not seen tombstoned yet,
-- and push validation checks the reference against the caller's ledger instead.
CREATE TABLE IF NOT EXISTS lf.journal_entries (
    id UUID PRIMARY KEY,
    ledger_id UUID NOT NULL REFERENCES lf.ledgers(id),
    owner_id INTEGER NOT NULL REFERENCES users(id),
    seq BIGINT NOT NULL,
    deleted BOOLEAN NOT NULL DEFAULT false,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    field_hlc JSONB NOT NULL DEFAULT '{}',
    wallet VARCHAR(10) NOT NULL CHECK (wallet IN ('ledger', 'allowance')),
    transaction_date DATE NOT NULL,
    item TEXT,
    amount INTEGER NOT NULL CHECK (amount >= 1),
    is_excluded BOOLEAN NOT NULL DEFAULT false,
    category_id UUID NOT NULL,
    note TEXT,
    recurring_expense_id UUID,
    recurring_year_month VARCHAR(7)
);

-- Exactly one posting per recurring expense per month (design.md D13).
CREATE UNIQUE INDEX IF NOT EXISTS journal_entries_recurring_month_idx
    ON lf.journal_entries (recurring_expense_id, recurring_year_month)
    WHERE recurring_expense_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS lf.daily_notes (
    id UUID PRIMARY KEY,
    ledger_id UUID NOT NULL REFERENCES lf.ledgers(id),
    owner_id INTEGER NOT NULL REFERENCES users(id),
    seq BIGINT NOT NULL,
    deleted BOOLEAN NOT NULL DEFAULT false,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    field_hlc JSONB NOT NULL DEFAULT '{}',
    date DATE NOT NULL,
    note TEXT NOT NULL
);

-- One live note per owner per day; a second one is merged into it on push.
CREATE UNIQUE INDEX IF NOT EXISTS daily_notes_owner_date_idx
    ON lf.daily_notes (ledger_id, owner_id, date)
    WHERE deleted = false;

CREATE TABLE IF NOT EXISTS lf.monthly_review_notes (
    id UUID PRIMARY KEY,
    ledger_id UUID NOT NULL REFERENCES lf.ledgers(id),
    owner_id INTEGER NOT NULL REFERENCES users(id),
    seq BIGINT NOT NULL,
    deleted BOOLEAN NOT NULL DEFAULT false,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    field_hlc JSONB NOT NULL DEFAULT '{}',
    year_month VARCHAR(7) NOT NULL,
    category_id UUID NOT NULL,
    note TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS monthly_review_notes_owner_month_category_idx
    ON lf.monthly_review_notes (ledger_id, owner_id, year_month, category_id)
    WHERE deleted = false;

-- Pull reads every visible row of a ledger after a cursor.
CREATE INDEX IF NOT EXISTS ledgers_ledger_seq_idx ON lf.ledgers (ledger_id, seq);
CREATE INDEX IF NOT EXISTS ledger_members_ledger_seq_idx ON lf.ledger_members (ledger_id, seq);
CREATE INDEX IF NOT EXISTS category_groups_ledger_seq_idx ON lf.category_groups (ledger_id, seq);
CREATE INDEX IF NOT EXISTS expense_categories_ledger_seq_idx ON lf.expense_categories (ledger_id, seq);
CREATE INDEX IF NOT EXISTS income_records_ledger_seq_idx ON lf.income_records (ledger_id, seq);
CREATE INDEX IF NOT EXISTS base_incomes_ledger_seq_idx ON lf.base_incomes (ledger_id, seq);
CREATE INDEX IF NOT EXISTS recurring_expenses_ledger_seq_idx ON lf.recurring_expenses (ledger_id, seq);
CREATE INDEX IF NOT EXISTS savings_goals_ledger_seq_idx ON lf.savings_goals (ledger_id, seq);
CREATE INDEX IF NOT EXISTS savings_postings_ledger_seq_idx ON lf.savings_postings (ledger_id, seq);
CREATE INDEX IF NOT EXISTS budgets_ledger_seq_idx ON lf.budgets (ledger_id, seq);
CREATE INDEX IF NOT EXISTS allowances_ledger_seq_idx ON lf.allowances (ledger_id, seq);
CREATE INDEX IF NOT EXISTS surplus_allocations_ledger_seq_idx ON lf.surplus_allocations (ledger_id, seq);
CREATE INDEX IF NOT EXISTS allowance_totals_ledger_seq_idx ON lf.allowance_totals (ledger_id, seq);
CREATE INDEX IF NOT EXISTS journal_entries_ledger_seq_idx ON lf.journal_entries (ledger_id, seq);
CREATE INDEX IF NOT EXISTS daily_notes_ledger_seq_idx ON lf.daily_notes (ledger_id, seq);
CREATE INDEX IF NOT EXISTS monthly_review_notes_ledger_seq_idx ON lf.monthly_review_notes (ledger_id, seq);
