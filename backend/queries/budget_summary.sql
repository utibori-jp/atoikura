-- name: SumRecurringFixed :one
SELECT COALESCE(SUM(amount), 0)::INTEGER AS total
FROM recurring_expenses
WHERE user_id = $1 AND type = 'fixed' AND amount IS NOT NULL;

-- name: SumSavingsMonthly :one
SELECT COALESCE(SUM(monthly_amount), 0)::INTEGER AS total
FROM savings_goals
WHERE user_id = $1;

-- name: SumActualSpendByMonth :one
SELECT COALESCE(SUM(je.amount), 0)::INTEGER AS total
FROM journal_entries je
WHERE je.user_id = $1
  AND TO_CHAR(je.transaction_date, 'YYYY-MM') = $2::text
  AND je.is_excluded = false;
