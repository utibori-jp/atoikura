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

-- name: GetCategoryGroupByID :one
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
WHERE cg.id = $1 AND cg.user_id = $2 AND cg.is_deleted = false;

-- name: CreateCategoryGroup :one
INSERT INTO category_groups (user_id, group_name, statement_type_id, description)
VALUES ($1, $2, $3, $4)
RETURNING id, group_name, statement_type_id, description;

-- name: UpdateCategoryGroupByID :execrows
UPDATE category_groups
SET group_name = $3, statement_type_id = $4, description = $5, updated_at = NOW(), version = version + 1
WHERE id = $1 AND user_id = $2 AND is_deleted = false;

-- name: SoftDeleteCategoryGroup :execrows
UPDATE category_groups
SET is_deleted = true, deleted_at = NOW(), updated_at = NOW(), version = version + 1
WHERE id = $1 AND user_id = $2 AND is_deleted = false;

-- name: CountActiveExpenseCategoriesByGroup :one
SELECT COUNT(*) FROM expense_categories
WHERE group_id = $1 AND user_id = $2 AND is_deleted = false;
