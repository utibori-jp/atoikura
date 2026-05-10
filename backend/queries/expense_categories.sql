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

-- name: GetExpenseCategoryByID :one
SELECT
  ec.id,
  ec.category_name,
  ec.category_code,
  ec.group_id,
  cg.group_name,
  ec.description
FROM expense_categories ec
JOIN category_groups cg ON ec.group_id = cg.id
WHERE ec.id = $1 AND ec.user_id = $2 AND ec.is_deleted = false;

-- name: CreateExpenseCategory :one
INSERT INTO expense_categories (user_id, group_id, category_name, description)
VALUES ($1, $2, $3, $4)
RETURNING id, category_name, category_code, group_id, description;

-- name: UpdateExpenseCategoryByID :execrows
UPDATE expense_categories
SET category_name = $3, group_id = $4, description = $5, updated_at = NOW(), version = version + 1
WHERE id = $1 AND user_id = $2 AND is_deleted = false;

-- name: SoftDeleteExpenseCategory :execrows
UPDATE expense_categories
SET is_deleted = true, deleted_at = NOW(), updated_at = NOW(), version = version + 1
WHERE id = $1 AND user_id = $2 AND is_deleted = false;
