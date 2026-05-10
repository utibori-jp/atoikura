-- name: ListStatementTypes :many
SELECT id, type_code, statement_type_name, display_order
FROM statement_types
ORDER BY display_order ASC;
