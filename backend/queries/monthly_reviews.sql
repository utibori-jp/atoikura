-- name: GetMonthlyReview :one
SELECT notes FROM monthly_reviews
WHERE user_id = $1 AND year_month = $2;

-- name: UpsertMonthlyReview :one
INSERT INTO monthly_reviews (user_id, year_month, notes)
VALUES ($1, $2, $3)
ON CONFLICT (user_id, year_month) DO UPDATE
  SET notes      = EXCLUDED.notes,
      updated_at = NOW()
RETURNING notes;
