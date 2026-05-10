package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/utibori-jp/atoikura/backend/internal/handler"
	"github.com/utibori-jp/atoikura/backend/internal/repository"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	slog.SetDefault(logger)

	if err := run(context.Background()); err != nil {
		slog.Error("server exited with error", "error", err)
		os.Exit(1)
	}
}

func run(parent_ctx context.Context) error {
	database_url := os.Getenv("DATABASE_URL")
	if database_url == "" {
		return errors.New("DATABASE_URL is required")
	}
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	signal_ctx, stop := signal.NotifyContext(parent_ctx, syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	db_pool, err := pgxpool.New(signal_ctx, database_url)
	if err != nil {
		return fmt.Errorf("connecting to database: %w", err)
	}
	defer db_pool.Close()

	if err := db_pool.Ping(signal_ctx); err != nil {
		return fmt.Errorf("pinging database: %w", err)
	}
	slog.Info("connected to database")

	mux := http.NewServeMux()
	registerRoutes(mux, db_pool)

	h := handler.ChainMiddleware(mux,
		handler.LogRequest,
		handler.InjectHardcodedUser,
		handler.RecoverPanic,
		handler.AllowCORS,
	)

	http_server := &http.Server{
		Addr:              ":" + port,
		Handler:           h,
		ReadHeaderTimeout: 5 * time.Second,
	}

	server_errors := make(chan error, 1)
	go func() {
		slog.Info("server listening", "port", port)
		if err := http_server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			server_errors <- err
		}
	}()

	select {
	case err := <-server_errors:
		return fmt.Errorf("listening: %w", err)
	case <-signal_ctx.Done():
		slog.Info("shutdown signal received")
	}

	shutdown_ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	return http_server.Shutdown(shutdown_ctx)
}

func registerRoutes(mux *http.ServeMux, db_pool *pgxpool.Pool) {
	repo := repository.New(db_pool)

	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	})
	mux.Handle("GET /category-groups", handler.ListCategoryGroupsHandler(repo))
	mux.Handle("POST /category-groups", handler.CreateCategoryGroupHandler(repo))
	mux.Handle("PUT /category-groups/{id}", handler.UpdateCategoryGroupHandler(repo))
	mux.Handle("DELETE /category-groups/{id}", handler.DeleteCategoryGroupHandler(repo))
	mux.Handle("GET /statement-types", handler.ListStatementTypesHandler(repo))
	mux.Handle("GET /expense-categories", handler.ListExpenseCategoriesHandler(repo))
	mux.Handle("POST /expense-categories", handler.CreateExpenseCategoryHandler(repo))
	mux.Handle("PUT /expense-categories/{id}", handler.UpdateExpenseCategoryHandler(repo))
	mux.Handle("DELETE /expense-categories/{id}", handler.DeleteExpenseCategoryHandler(repo))
	mux.Handle("POST /journal-entries", handler.CreateJournalEntryHandler(repo))
	mux.Handle("GET /journal-entries", handler.ListJournalEntriesHandler(repo))
	mux.Handle("PUT /journal-entries/{id}", handler.UpdateJournalEntryHandler(repo))
	mux.Handle("DELETE /journal-entries/{id}", handler.DeleteJournalEntryHandler(repo))
	mux.Handle("GET /budgets", handler.GetBudgetsHandler(repo))
	mux.Handle("PUT /budgets", handler.UpdateBudgetsHandler(repo))
	mux.Handle("GET /expenses/daily-cumulative", handler.GetDailyCumulativeHandler(repo))
	mux.Handle("GET /expenses/monthly-breakdown", handler.GetMonthlyBreakdownHandler(repo))
	mux.Handle("GET /notes/monthly-reviews", handler.GetMonthlyReviewsHandler(repo))
	mux.Handle("PUT /notes/monthly-reviews", handler.UpdateMonthlyReviewsHandler(repo))
	mux.Handle("GET /notes/daily", handler.GetDailyNotesHandler(repo))
	mux.Handle("PUT /notes/daily/{date}", handler.UpdateDailyNoteHandler(repo))
}
