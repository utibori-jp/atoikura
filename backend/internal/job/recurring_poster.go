package job

import (
	"context"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// RecurringPoster auto-posts fixed recurring expenses on their billing day.
// It wakes once per day at 08:00 JST, queries all fixed recurring expenses whose
// billing_day matches today, and inserts journal_entries for any not yet posted
// this month.
type RecurringPoster struct {
	pool   *pgxpool.Pool
	stopCh chan struct{}
}

// NewRecurringPoster creates a RecurringPoster backed by pool.
func NewRecurringPoster(pool *pgxpool.Pool) *RecurringPoster {
	return &RecurringPoster{pool: pool, stopCh: make(chan struct{})}
}

// Start launches the daily posting loop in a background goroutine.
func (p *RecurringPoster) Start() {
	go p.loop()
}

// Stop signals the background loop to exit cleanly.
func (p *RecurringPoster) Stop() {
	close(p.stopCh)
}

func (p *RecurringPoster) loop() {
	for {
		timer := time.NewTimer(time.Until(nextDailyRun(8)))
		select {
		case <-timer.C:
			p.run()
		case <-p.stopCh:
			timer.Stop()
			return
		}
	}
}

// nextDailyRun returns the next occurrence of hour:00:00 JST after now.
func nextDailyRun(hour int) time.Time {
	loc, err := time.LoadLocation("Asia/Tokyo")
	if err != nil {
		loc = time.FixedZone("JST", 9*60*60)
	}
	now := time.Now().In(loc)
	next := time.Date(now.Year(), now.Month(), now.Day(), hour, 0, 0, 0, loc)
	if !next.After(now) {
		next = next.Add(24 * time.Hour)
	}
	return next
}

// run posts fixed recurring expenses due today that have not yet been posted this month.
func (p *RecurringPoster) run() {
	ctx := context.Background()

	loc, err := time.LoadLocation("Asia/Tokyo")
	if err != nil {
		loc = time.FixedZone("JST", 9*60*60)
	}
	now := time.Now().In(loc)
	today_day := now.Day()
	year_month := now.Format("2006-01")
	today_date := now.Format("2006-01-02")

	rows, err := p.pool.Query(ctx, `
		SELECT re.id, re.user_id, re.name, re.amount, re.category_id
		FROM recurring_expenses re
		WHERE re.type = 'fixed'
		  AND re.billing_day = $1
		  AND re.amount IS NOT NULL
		  AND NOT EXISTS (
		    SELECT 1 FROM journal_entries je
		    WHERE je.recurring_expense_id = re.id
		      AND TO_CHAR(je.transaction_date, 'YYYY-MM') = $2
		  )
	`, today_day, year_month)
	if err != nil {
		slog.Error("recurring poster: query failed", "error", err)
		return
	}
	defer rows.Close()

	type dueEntry struct {
		id, user_id, amount, category_id int32
		name                             string
	}
	var due []dueEntry
	for rows.Next() {
		var e dueEntry
		if err := rows.Scan(&e.id, &e.user_id, &e.name, &e.amount, &e.category_id); err != nil {
			slog.Error("recurring poster: scan failed", "error", err)
			return
		}
		due = append(due, e)
	}
	if err := rows.Err(); err != nil {
		slog.Error("recurring poster: rows error", "error", err)
		return
	}

	posted := 0
	for _, e := range due {
		_, err := p.pool.Exec(ctx, `
			INSERT INTO journal_entries
			    (transaction_date, item, amount, category_id, user_id, is_excluded, recurring_expense_id)
			VALUES ($1, $2, $3, $4, $5, false, $6)
		`, today_date, e.name, e.amount, e.category_id, e.user_id, e.id)
		if err != nil {
			slog.Error("recurring poster: insert failed", "error", err, "recurring_expense_id", e.id)
			continue
		}
		posted++
	}

	if posted > 0 {
		slog.Info("recurring poster: auto-posted entries", "count", posted, "date", today_date)
	}
}
