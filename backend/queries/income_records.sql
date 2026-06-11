-- name: ListIncomeRecords :many
SELECT id, transaction_date, amount, name, income_type, emoji, note
FROM income_records
WHERE user_id = $1 AND TO_CHAR(transaction_date, 'YYYY-MM') = $2::text
ORDER BY transaction_date DESC, id DESC;

-- name: CreateIncomeRecord :one
INSERT INTO income_records (user_id, transaction_date, amount, name, income_type, emoji, note)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING id, transaction_date, amount, name, income_type, emoji, note;

-- name: UpdateIncomeRecord :one
UPDATE income_records
SET transaction_date = $3, amount = $4, name = $5, income_type = $6, emoji = $7, note = $8, updated_at = NOW()
WHERE id = $1 AND user_id = $2
RETURNING id, transaction_date, amount, name, income_type, emoji, note;

-- name: DeleteIncomeRecord :exec
DELETE FROM income_records WHERE id = $1 AND user_id = $2;

-- name: SumIncomeByMonth :one
SELECT COALESCE(SUM(amount), 0)::INTEGER AS total
FROM income_records
WHERE user_id = $1 AND TO_CHAR(transaction_date, 'YYYY-MM') = $2::text;

-- name: GetBaseIncome :one
SELECT amount FROM base_income_settings WHERE user_id = $1;

-- name: UpsertBaseIncome :one
INSERT INTO base_income_settings (user_id, amount)
VALUES ($1, $2)
ON CONFLICT (user_id) DO UPDATE SET amount = EXCLUDED.amount, updated_at = NOW()
RETURNING amount;
