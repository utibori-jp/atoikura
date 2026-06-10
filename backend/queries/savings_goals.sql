-- name: ListSavingsGoals :many
SELECT id, name, emoji, monthly_amount, target_amount, accumulated_amount, deadline, last_posted_month, memo
FROM savings_goals
WHERE user_id = $1
ORDER BY id;

-- name: CreateSavingsGoal :one
INSERT INTO savings_goals (user_id, name, emoji, monthly_amount, target_amount, accumulated_amount, deadline, memo)
VALUES ($1, $2, $3, $4, $5, 0, $6, $7)
RETURNING id, name, emoji, monthly_amount, target_amount, accumulated_amount, deadline, last_posted_month, memo;

-- name: UpdateSavingsGoal :one
UPDATE savings_goals
SET name = $3, emoji = $4, monthly_amount = $5, target_amount = $6, deadline = $7, memo = $8, updated_at = NOW()
WHERE id = $1 AND user_id = $2
RETURNING id, name, emoji, monthly_amount, target_amount, accumulated_amount, deadline, last_posted_month, memo;

-- name: PostMonthlySavings :one
UPDATE savings_goals
SET accumulated_amount = accumulated_amount + $3,
    last_posted_month = $4,
    updated_at = NOW()
WHERE id = $1 AND user_id = $2
RETURNING id, name, emoji, monthly_amount, target_amount, accumulated_amount, deadline, last_posted_month, memo;

-- name: DeleteSavingsGoal :exec
DELETE FROM savings_goals WHERE id = $1 AND user_id = $2;

-- name: GetSavingsGoalByID :one
SELECT id, name, emoji, monthly_amount, target_amount, accumulated_amount, deadline, last_posted_month, memo
FROM savings_goals WHERE id = $1 AND user_id = $2;
