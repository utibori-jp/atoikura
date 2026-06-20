-- name: ListRecurringExpenses :many
SELECT re.id, re.name, re.emoji, re.billing_day, re.amount, re.type,
       re.category_id, ec.group_id, cg.group_name, ec.category_name
FROM recurring_expenses re
JOIN expense_categories ec ON re.category_id = ec.id
JOIN category_groups cg ON ec.group_id = cg.id
WHERE re.user_id = $1
ORDER BY re.billing_day, re.id;

-- name: ListPendingRecurring :many
SELECT re.id, re.name, re.emoji, re.billing_day, re.amount, cg.group_name
FROM recurring_expenses re
JOIN expense_categories ec ON re.category_id = ec.id
JOIN category_groups cg ON ec.group_id = cg.id
WHERE re.user_id = $1
  AND re.type = 'variable'
  AND NOT EXISTS (
    SELECT 1 FROM journal_entries je
    WHERE je.recurring_expense_id = re.id
      AND TO_CHAR(je.transaction_date, 'YYYY-MM') = $2::text
  )
ORDER BY re.billing_day;

-- name: CreateRecurringExpense :one
INSERT INTO recurring_expenses (user_id, name, emoji, billing_day, amount, type, category_id)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING id, name, emoji, billing_day, amount, type, category_id;

-- name: UpdateRecurringExpense :one
UPDATE recurring_expenses
SET name = $3, emoji = $4, billing_day = $5, amount = $6, type = $7, category_id = $8, updated_at = NOW()
WHERE id = $1 AND user_id = $2
RETURNING id, name, emoji, billing_day, amount, type, category_id;

-- name: DeleteRecurringExpense :exec
DELETE FROM recurring_expenses WHERE id = $1 AND user_id = $2;

-- name: GetRecurringExpenseByID :one
SELECT id, name, emoji, billing_day, amount, type, category_id
FROM recurring_expenses WHERE id = $1 AND user_id = $2;

-- name: ExistsRecurringJournalEntryForMonth :one
-- True when a journal entry already links this recurring expense in the given month.
SELECT EXISTS (
  SELECT 1 FROM journal_entries je
  WHERE je.recurring_expense_id = $1
    AND je.user_id = $2
    AND TO_CHAR(je.transaction_date, 'YYYY-MM') = $3::text
) AS exists;

-- name: AutoPostFixedRecurringForMonth :execrows
-- Inserts journal entries for all of the user's FIXED recurring expenses that have a
-- defined amount and are not yet linked to a journal entry in the given month. The
-- transaction date is the billing day clamped to the last day of the month. The
-- NOT EXISTS guard makes this idempotent per (recurring_expense, month); callers
-- serialize concurrent first-requests of the month with an advisory lock to close the
-- check-then-insert race window. Returns the number of entries inserted.
INSERT INTO journal_entries (
  transaction_date, item, amount, category_id, user_id, is_excluded, recurring_expense_id
)
SELECT
  make_date(
    EXTRACT(YEAR FROM m.month_start)::int,
    EXTRACT(MONTH FROM m.month_start)::int,
    LEAST(re.billing_day, EXTRACT(DAY FROM (m.month_start + INTERVAL '1 month - 1 day'))::int)
  ),
  re.name,
  re.amount,
  re.category_id,
  re.user_id,
  false,
  re.id
FROM recurring_expenses re
CROSS JOIN (SELECT ($2::text || '-01')::date AS month_start) AS m
WHERE re.user_id = $1
  AND re.type = 'fixed'
  AND re.amount IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM journal_entries je
    WHERE je.recurring_expense_id = re.id
      AND TO_CHAR(je.transaction_date, 'YYYY-MM') = $2::text
  );
