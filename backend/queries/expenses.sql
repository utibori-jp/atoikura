-- name: ListDailyExpenseSumsForMonth :many
-- Returns per-day, per-type_code subtotals for the target month.
-- Only includes is_excluded=false entries with type_code 'food' or 'other'.
SELECT
  je.transaction_date::text AS date,
  st.type_code,
  CAST(SUM(je.amount) AS integer) AS daily_sum
FROM journal_entries je
JOIN expense_categories ec ON je.category_id = ec.id
JOIN category_groups    cg ON ec.group_id     = cg.id
JOIN statement_types    st ON cg.statement_type_id = st.id
WHERE je.user_id      = $1
  AND je.is_excluded  = false
  AND st.type_code    IN ('food', 'other')
  AND je.transaction_date >= $2::date
  AND je.transaction_date <  $2::date + INTERVAL '1 month'
GROUP BY je.transaction_date, st.type_code
ORDER BY je.transaction_date ASC;
