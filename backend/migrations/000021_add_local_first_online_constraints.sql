-- Invariants of the online-only collections (#213, design.md §5.2). The server
-- enforces them on REST commands, as the legacy API does with its own indexes.

-- Category names are unique per ledger among live rows (as today per user).
CREATE UNIQUE INDEX IF NOT EXISTS category_groups_ledger_name_idx
    ON lf.category_groups (ledger_id, name)
    WHERE deleted = false;

CREATE UNIQUE INDEX IF NOT EXISTS expense_categories_ledger_group_name_idx
    ON lf.expense_categories (ledger_id, group_id, name)
    WHERE deleted = false;

CREATE UNIQUE INDEX IF NOT EXISTS expense_categories_ledger_code_idx
    ON lf.expense_categories (ledger_id, category_code)
    WHERE deleted = false AND category_code IS NOT NULL;

-- One base income per member and one budget per ledger.
CREATE UNIQUE INDEX IF NOT EXISTS base_incomes_ledger_member_idx
    ON lf.base_incomes (ledger_id, member_id)
    WHERE deleted = false;

CREATE UNIQUE INDEX IF NOT EXISTS budgets_ledger_idx
    ON lf.budgets (ledger_id)
    WHERE deleted = false;

-- The "<member_id>:<year_month>" id of allowance_totals is only unique within a
-- ledger: a member who moves to another household starts new totals there.
ALTER TABLE lf.allowance_totals DROP CONSTRAINT IF EXISTS allowance_totals_pkey;
ALTER TABLE lf.allowance_totals ADD PRIMARY KEY (ledger_id, id);

-- Allowance totals are recomputed from these rows after every allowance write.
CREATE INDEX IF NOT EXISTS journal_entries_allowance_idx
    ON lf.journal_entries (ledger_id, owner_id, transaction_date)
    WHERE wallet = 'allowance';
