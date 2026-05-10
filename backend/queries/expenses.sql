-- name: ListMonthlyBreakdown :many
-- Returns per-category totals for the target month.
-- is_excluded=true entries have their statement_type overridden to 'excluded'.
-- Logically-deleted expense_categories (is_deleted=true) are included because
-- past journal_entries may still reference them.
SELECT
  je.category_id,
  ec.category_name,
  cg.id                                                                              AS group_id,
  cg.group_name,
  CASE WHEN je.is_excluded THEN excl.id   ELSE st.id   END                          AS statement_type_id,
  CASE WHEN je.is_excluded THEN excl.statement_type_name ELSE st.statement_type_name END AS statement_type_name,
  CAST(SUM(je.amount) AS integer)                                                    AS total
FROM journal_entries je
JOIN expense_categories ec  ON je.category_id       = ec.id
JOIN category_groups    cg  ON ec.group_id           = cg.id
JOIN statement_types    st  ON cg.statement_type_id  = st.id
CROSS JOIN (
  SELECT id, statement_type_name
  FROM statement_types
  WHERE type_code = 'excluded'
) excl
WHERE je.user_id          = $1
  AND je.transaction_date >= $2::date
  AND je.transaction_date <  $2::date + INTERVAL '1 month'
GROUP BY
  je.category_id,
  ec.category_name,
  cg.id,
  cg.group_name,
  CASE WHEN je.is_excluded THEN excl.id   ELSE st.id   END,
  CASE WHEN je.is_excluded THEN excl.statement_type_name ELSE st.statement_type_name END
ORDER BY
  CASE WHEN je.is_excluded THEN excl.id   ELSE st.id   END,
  cg.id,
  je.category_id;

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
