-- name: CreateJournalEntry :one
INSERT INTO journal_entries (
  transaction_date, item, amount, category_id, user_id, is_excluded, note,
  recurring_expense_id
) VALUES (
  $1, $2, $3, $4, $5, $6, $7, $8
)
RETURNING id, transaction_date, item, amount, category_id, user_id,
          is_excluded, note, created_at, updated_at, recurring_expense_id;

-- name: UpdateJournalEntry :one
UPDATE journal_entries
SET transaction_date = $3,
    item             = $4,
    amount           = $5,
    category_id      = $6,
    is_excluded      = $7,
    note             = $8,
    updated_at       = NOW()
WHERE id = $1 AND user_id = $2
RETURNING id, transaction_date, item, amount, category_id, user_id,
          is_excluded, note, created_at, updated_at;

-- name: DeleteJournalEntry :exec
DELETE FROM journal_entries
WHERE id = $1 AND user_id = $2;

-- name: ListJournalEntriesByMonth :many
-- Joins category and group info for the response.
-- Includes soft-deleted categories so historical entries display correctly.
SELECT
  je.id,
  je.transaction_date,
  je.item,
  je.amount,
  je.category_id,
  ec.category_name,
  ec.group_id,
  cg.group_name,
  je.is_excluded,
  je.note,
  je.created_at,
  je.recurring_expense_id
FROM journal_entries je
JOIN expense_categories ec ON je.category_id = ec.id
JOIN category_groups cg ON ec.group_id = cg.id
WHERE je.user_id = $1
  AND je.transaction_date >= $2::date
  AND je.transaction_date < ($2::date + INTERVAL '1 month')
ORDER BY je.transaction_date DESC, je.id DESC;
