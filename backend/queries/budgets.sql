-- name: GetBudgetByUser :one
SELECT monthly_budget, goal_text, goal_amount
FROM budgets
WHERE user_id = $1;

-- name: UpsertBudget :one
INSERT INTO budgets (user_id, monthly_budget, goal_text, goal_amount)
VALUES ($1, $2, $3, $4)
ON CONFLICT (user_id) DO UPDATE
  SET monthly_budget = EXCLUDED.monthly_budget,
      goal_text      = EXCLUDED.goal_text,
      goal_amount    = EXCLUDED.goal_amount,
      updated_at     = NOW()
RETURNING monthly_budget, goal_text, goal_amount;
