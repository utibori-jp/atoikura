-- name: ListCategoryGroupsByUser :many
SELECT
  cg.id,
  cg.group_name,
  cg.description,
  cg.statement_type_id,
  st.type_code AS statement_type_code,
  st.statement_type_name,
  st.display_order AS statement_type_display_order
FROM category_groups cg
JOIN statement_types st ON cg.statement_type_id = st.id
WHERE cg.user_id = $1 AND cg.is_deleted = false
ORDER BY cg.group_name ASC;
