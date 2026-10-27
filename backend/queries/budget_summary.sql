-- name: SumRecurringFixed :one
SELECT COALESCE(SUM(amount), 0)::INTEGER AS total
FROM recurring_expenses
WHERE user_id = $1 AND type = 'fixed' AND amount IS NOT NULL;

-- name: SumSavingsMonthly :one
SELECT COALESCE(SUM(monthly_amount), 0)::INTEGER AS total
FROM savings_goals
WHERE user_id = $1;

-- name: SumActualSpendByMonth :one
-- Variable spending (food/other, not excluded) for the budget history. Fixed costs
-- are left out because the budget already has fixed recurring expenses subtracted.
SELECT COALESCE(SUM(je.amount), 0)::INTEGER AS total
FROM journal_entries je
JOIN expense_categories ec ON je.category_id = ec.id
JOIN category_groups    cg ON ec.group_id     = cg.id
JOIN statement_types    st ON cg.statement_type_id = st.id
WHERE je.user_id = $1
  AND TO_CHAR(je.transaction_date, 'YYYY-MM') = $2::text
  AND je.is_excluded = false
  AND st.type_code IN ('food', 'other');
