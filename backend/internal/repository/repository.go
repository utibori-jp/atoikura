package repository

import (
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/utibori-jp/atoikura/backend/internal/db"
)

type Repository struct {
	pool    *pgxpool.Pool
	queries *db.Queries
}

func New(pool *pgxpool.Pool) *Repository {
	return &Repository{
		pool:    pool,
		queries: db.New(pool),
	}
}
