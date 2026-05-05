-- name: ListExpenseCategoriesByUser :many
SELECT
  ec.id,
  ec.category_name,
  ec.description,
  ec.group_id,
  cg.group_name
FROM expense_categories ec
JOIN category_groups cg ON ec.group_id = cg.id
WHERE ec.user_id = $1
  AND ec.is_deleted = false
  AND cg.is_deleted = false
ORDER BY cg.group_name ASC, ec.category_name ASC;

-- name: GetActiveExpenseCategoryByID :one
-- Used to validate category_id when creating/updating a journal entry
SELECT id, user_id, group_id, is_deleted
FROM expense_categories
WHERE id = $1 AND user_id = $2 AND is_deleted = false;
