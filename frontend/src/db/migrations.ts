import type { Migration } from "./types";

// Client schema for the hybrid local-first design (docs/local-first/design.md §3.1).
//
// Two kinds of tables live here:
// - offline-writable collections (journal_entries, daily_notes, monthly_review_notes):
//   the device is the source of truth; each row carries field_hlc (JSON map of
//   field name -> HLC) for field-level LWW.
// - read caches of online-only collections: rows are replaced wholesale by pull.
//
// No UNIQUE constraints are placed on cache tables: the server enforces uniqueness,
// and pulled rows can transiently overlap (e.g. a tombstone and its replacement).

// Envelope columns shared by every synced row. seq is NULL until the server has
// accepted the row; owner_id / ledger_id are always filled from the session.
const SYNC_ENVELOPE_COLUMNS = `
  id TEXT PRIMARY KEY NOT NULL,
  ledger_id TEXT NOT NULL,
  owner_id INTEGER NOT NULL,
  seq INTEGER,
  deleted INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1)),
  deleted_at TEXT,
  created_at TEXT,
  updated_at TEXT`;

const FIELD_HLC_COLUMN = `field_hlc TEXT NOT NULL DEFAULT '{}'`;

const SCHEMA_V1_STATEMENTS = [
  // --- Online-only collections (read cache) ---
  `CREATE TABLE ledgers (
    id TEXT PRIMARY KEY NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('personal', 'household')),
    name TEXT,
    seq INTEGER,
    deleted INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1)),
    deleted_at TEXT,
    created_at TEXT,
    updated_at TEXT
  )`,
  `CREATE TABLE ledger_members (${SYNC_ENVELOPE_COLUMNS},
    user_id INTEGER NOT NULL,
    display_name TEXT,
    role TEXT NOT NULL CHECK (role IN ('owner', 'member')),
    joined_at TEXT,
    left_at TEXT
  )`,
  `CREATE TABLE category_groups (${SYNC_ENVELOPE_COLUMNS},
    name TEXT NOT NULL,
    statement_type_code TEXT NOT NULL,
    description TEXT
  )`,
  `CREATE TABLE expense_categories (${SYNC_ENVELOPE_COLUMNS},
    group_id TEXT NOT NULL,
    name TEXT NOT NULL,
    category_code TEXT,
    description TEXT
  )`,
  `CREATE TABLE income_records (${SYNC_ENVELOPE_COLUMNS},
    earner_id INTEGER NOT NULL,
    transaction_date TEXT NOT NULL,
    amount INTEGER NOT NULL,
    name TEXT NOT NULL,
    income_type TEXT NOT NULL,
    emoji TEXT,
    note TEXT
  )`,
  `CREATE TABLE base_incomes (${SYNC_ENVELOPE_COLUMNS},
    member_id INTEGER NOT NULL,
    amount INTEGER NOT NULL
  )`,
  `CREATE TABLE recurring_expenses (${SYNC_ENVELOPE_COLUMNS},
    wallet TEXT NOT NULL CHECK (wallet IN ('ledger', 'allowance')),
    name TEXT NOT NULL,
    emoji TEXT,
    billing_day INTEGER NOT NULL,
    amount INTEGER,
    type TEXT NOT NULL CHECK (type IN ('fixed', 'variable')),
    category_id TEXT NOT NULL
  )`,
  `CREATE TABLE savings_goals (${SYNC_ENVELOPE_COLUMNS},
    name TEXT NOT NULL,
    emoji TEXT,
    monthly_amount INTEGER NOT NULL DEFAULT 0,
    target_amount INTEGER NOT NULL DEFAULT 0,
    deadline TEXT,
    memo TEXT
  )`,
  `CREATE TABLE savings_postings (${SYNC_ENVELOPE_COLUMNS},
    goal_id TEXT NOT NULL,
    year_month TEXT NOT NULL,
    amount INTEGER NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('auto', 'manual'))
  )`,
  `CREATE TABLE budgets (${SYNC_ENVELOPE_COLUMNS},
    monthly_budget INTEGER NOT NULL DEFAULT 0,
    goal_text TEXT,
    goal_amount INTEGER NOT NULL DEFAULT 0
  )`,
  // Allowance history: one row per change, keyed by the month it takes effect.
  // The allowance carry-over needs the amount in effect for every past month.
  `CREATE TABLE allowances (${SYNC_ENVELOPE_COLUMNS},
    member_id INTEGER NOT NULL,
    effective_from TEXT NOT NULL,
    amount INTEGER NOT NULL
  )`,
  `CREATE TABLE surplus_allocations (${SYNC_ENVELOPE_COLUMNS},
    year_month TEXT NOT NULL,
    amount INTEGER NOT NULL,
    destination TEXT NOT NULL CHECK (destination IN ('budget', 'savings')),
    savings_goal_id TEXT
  )`,
  // Server-computed view: the only window other members have into an allowance.
  // id is the composite "<member_id>:<year_month>" sent by pull.
  `CREATE TABLE allowance_totals (
    id TEXT PRIMARY KEY NOT NULL,
    ledger_id TEXT NOT NULL,
    member_id INTEGER NOT NULL,
    year_month TEXT NOT NULL,
    spent INTEGER NOT NULL,
    seq INTEGER
  )`,

  // --- Offline-writable collections ---
  `CREATE TABLE journal_entries (${SYNC_ENVELOPE_COLUMNS},
    wallet TEXT NOT NULL CHECK (wallet IN ('ledger', 'allowance')),
    transaction_date TEXT NOT NULL,
    item TEXT,
    amount INTEGER NOT NULL,
    is_excluded INTEGER NOT NULL DEFAULT 0 CHECK (is_excluded IN (0, 1)),
    category_id TEXT NOT NULL,
    note TEXT,
    recurring_expense_id TEXT,
    recurring_year_month TEXT,
    ${FIELD_HLC_COLUMN}
  )`,
  `CREATE TABLE daily_notes (${SYNC_ENVELOPE_COLUMNS},
    date TEXT NOT NULL,
    note TEXT NOT NULL,
    ${FIELD_HLC_COLUMN}
  )`,
  `CREATE TABLE monthly_review_notes (${SYNC_ENVELOPE_COLUMNS},
    year_month TEXT NOT NULL,
    category_id TEXT NOT NULL,
    note TEXT NOT NULL,
    ${FIELD_HLC_COLUMN}
  )`,

  // --- Sync bookkeeping (docs/local-first/sync-protocol.md §5) ---
  // Pending local changes, coalesced per record and field ('__deleted' for tombstones).
  `CREATE TABLE _outbox (
    collection TEXT NOT NULL,
    record_id TEXT NOT NULL,
    field TEXT NOT NULL,
    hlc TEXT NOT NULL,
    PRIMARY KEY (collection, record_id, field)
  )`,
  // Last server-confirmed value of each field that has a pending local change,
  // used to revert when the server rejects the change.
  `CREATE TABLE _shadow (
    collection TEXT NOT NULL,
    record_id TEXT NOT NULL,
    field TEXT NOT NULL,
    value TEXT,
    hlc TEXT,
    PRIMARY KEY (collection, record_id, field)
  )`,
  // Single row: the device's pull cursor for its current ledger.
  `CREATE TABLE _sync_state (
    singleton_id INTEGER PRIMARY KEY NOT NULL CHECK (singleton_id = 1),
    device_id TEXT NOT NULL,
    ledger_id TEXT,
    since INTEGER NOT NULL DEFAULT 0
  )`,

  // --- Indexes for the month-based screens and aggregations ---
  `CREATE INDEX journal_entries_ledger_date_idx ON journal_entries (ledger_id, transaction_date)`,
  `CREATE INDEX journal_entries_recurring_idx ON journal_entries (recurring_expense_id, recurring_year_month)`,
  `CREATE INDEX daily_notes_owner_date_idx ON daily_notes (owner_id, date)`,
  `CREATE INDEX monthly_review_notes_owner_month_idx ON monthly_review_notes (owner_id, year_month)`,
  `CREATE INDEX income_records_ledger_date_idx ON income_records (ledger_id, transaction_date)`,
  `CREATE INDEX expense_categories_group_idx ON expense_categories (group_id)`,
  `CREATE INDEX allowances_member_effective_idx ON allowances (member_id, effective_from)`,
  `CREATE INDEX allowance_totals_member_month_idx ON allowance_totals (member_id, year_month)`,
  `CREATE INDEX savings_postings_goal_idx ON savings_postings (goal_id)`,
];

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    description: "initial local-first schema (#199)",
    statements: SCHEMA_V1_STATEMENTS,
  },
];
