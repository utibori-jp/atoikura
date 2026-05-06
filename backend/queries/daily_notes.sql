-- name: GetDailyNotesByMonth :many
SELECT date, note FROM daily_notes
WHERE user_id = $1
  AND date >= $2::date
  AND date < ($2::date + INTERVAL '1 month')
ORDER BY date DESC;

-- name: UpsertDailyNote :one
INSERT INTO daily_notes (user_id, date, note)
VALUES ($1, $2, $3)
ON CONFLICT (user_id, date) DO UPDATE
  SET note       = EXCLUDED.note,
      updated_at = NOW()
RETURNING date, note;

-- name: DeleteDailyNote :exec
DELETE FROM daily_notes
WHERE user_id = $1 AND date = $2;
