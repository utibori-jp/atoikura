-- name: ListSurplusAllocationsByMonth :many
SELECT id, year_month, amount, destination, savings_goal_id, created_at
FROM surplus_allocations
WHERE user_id = $1 AND year_month = $2::text
ORDER BY id;

-- name: SumAllocatedByMonth :one
-- Returns the total allocated surplus (budget + savings) for the user and month.
SELECT COALESCE(SUM(amount), 0)::INTEGER AS total
FROM surplus_allocations
WHERE user_id = $1 AND year_month = $2::text;

-- name: SumSavingsAllocatedByMonth :one
-- Returns the total savings-destined allocations for the user and month.
-- Used to subtract from variable_budget in the budget summary.
SELECT COALESCE(SUM(amount), 0)::INTEGER AS total
FROM surplus_allocations
WHERE user_id = $1 AND year_month = $2::text AND destination = 'savings';

-- name: InsertSurplusAllocation :one
INSERT INTO surplus_allocations (user_id, year_month, amount, destination, savings_goal_id)
VALUES ($1, $2::text, $3, $4, $5)
RETURNING id, year_month, amount, destination, savings_goal_id, created_at;

-- name: IncrementSavingsGoalAccumulated :one
UPDATE savings_goals
SET accumulated_amount = accumulated_amount + $3,
    updated_at = NOW()
WHERE id = $1 AND user_id = $2
RETURNING id, name, emoji, monthly_amount, target_amount, accumulated_amount, deadline, last_posted_month, memo;
