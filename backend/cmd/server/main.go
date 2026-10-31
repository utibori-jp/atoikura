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
	jwt_secret_str := os.Getenv("JWT_SECRET")
	if jwt_secret_str == "" {
		return errors.New("JWT_SECRET is required")
	}
	jwt_secret := []byte(jwt_secret_str)

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

	repo := repository.New(db_pool)

	// Recurring expenses and monthly savings are auto-posted lazily on the first
	// dashboard read of each month (see Repository.EnsureMonthlyAutoPosting wired into
	// GET /budget-summary). No scheduler or background job is required.

	mux := http.NewServeMux()
	registerRoutes(mux, repo, jwt_secret)

	h := handler.ChainMiddleware(mux,
		handler.LogRequest,
		handler.AllowCORS,
		handler.RequireBearerAuth(jwt_secret),
		handler.RecoverPanic,
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

func registerRoutes(mux *http.ServeMux, repo *repository.Repository, jwt_secret []byte) {
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	})
	mux.Handle("POST /auth/login", handler.LoginHandler(repo, jwt_secret))
	mux.Handle("POST /auth/signup", handler.SignupHandler(repo, jwt_secret))
	mux.Handle("POST /auth/token", handler.TokenLoginHandler(repo, jwt_secret))
	mux.Handle("POST /auth/refresh", handler.RefreshTokenHandler(repo, jwt_secret))
	mux.Handle("POST /auth/logout", handler.LogoutHandler(repo))
	mux.Handle("POST /sync/push", handler.RequireSyncProtocol(handler.PushHandler(repo)))
	mux.Handle("GET /sync/pull", handler.RequireSyncProtocol(handler.PullHandler(repo)))
	registerLedgerCommandRoutes(mux, repo)
	mux.Handle("GET /users/me", handler.GetCurrentUserHandler(repo))
	mux.Handle("PUT /users/me/password", handler.ChangePasswordHandler(repo))
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
	mux.Handle("GET /expenses/daily-cumulative", handler.GetDailyCumulativeHandler(repo))
	mux.Handle("GET /expenses/monthly-breakdown", handler.GetMonthlyBreakdownHandler(repo))
	mux.Handle("GET /notes/monthly-reviews", handler.GetMonthlyReviewsHandler(repo))
	mux.Handle("PUT /notes/monthly-reviews", handler.UpdateMonthlyReviewsHandler(repo))
	mux.Handle("GET /notes/daily", handler.GetDailyNotesHandler(repo))
	mux.Handle("PUT /notes/daily/{date}", handler.UpdateDailyNoteHandler(repo))
	mux.Handle("GET /recurring-expenses", handler.ListRecurringExpensesHandler(repo))
	mux.Handle("POST /recurring-expenses", handler.CreateRecurringExpenseHandler(repo))
	mux.Handle("GET /recurring-expenses/pending", handler.ListPendingRecurringHandler(repo))
	mux.Handle("PUT /recurring-expenses/{id}", handler.UpdateRecurringExpenseHandler(repo))
	mux.Handle("DELETE /recurring-expenses/{id}", handler.DeleteRecurringExpenseHandler(repo))
	mux.Handle("POST /recurring-expenses/{id}/confirm", handler.ConfirmRecurringExpenseHandler(repo))
	mux.Handle("GET /savings-goals", handler.ListSavingsGoalsHandler(repo))
	mux.Handle("POST /savings-goals", handler.CreateSavingsGoalHandler(repo))
	mux.Handle("PUT /savings-goals/{id}", handler.UpdateSavingsGoalHandler(repo))
	mux.Handle("DELETE /savings-goals/{id}", handler.DeleteSavingsGoalHandler(repo))
	mux.Handle("POST /savings-goals/{id}/post-monthly", handler.PostMonthlySavingsHandler(repo))
	mux.Handle("GET /income-records", handler.ListIncomeRecordsHandler(repo))
	mux.Handle("POST /income-records", handler.CreateIncomeRecordHandler(repo))
	mux.Handle("PUT /income-records/{id}", handler.UpdateIncomeRecordHandler(repo))
	mux.Handle("DELETE /income-records/{id}", handler.DeleteIncomeRecordHandler(repo))
	mux.Handle("GET /base-income", handler.GetBaseIncomeHandler(repo))
	mux.Handle("PUT /base-income", handler.UpdateBaseIncomeHandler(repo))
	mux.Handle("GET /budget-summary", handler.GetBudgetSummaryHandler(repo))
	mux.Handle("GET /surplus-allocations", handler.ListSurplusAllocationsHandler(repo))
	mux.Handle("POST /surplus-allocations", handler.CreateSurplusAllocationHandler(repo))
}

// registerLedgerCommandRoutes registers the REST commands for the online-only
// collections of the local-first clients (#213) and the household lifecycle
// commands (#207). Like /sync, they require the
// client's sync protocol version.
func registerLedgerCommandRoutes(mux *http.ServeMux, repo *repository.Repository) {
	ledger_command_routes := map[string]http.HandlerFunc{
		"POST /ledger/category-groups":                 handler.CreateLedgerCategoryGroupHandler(repo),
		"PUT /ledger/category-groups/{id}":             handler.UpdateLedgerCategoryGroupHandler(repo),
		"DELETE /ledger/category-groups/{id}":          handler.DeleteLedgerCategoryGroupHandler(repo),
		"POST /ledger/expense-categories":              handler.CreateLedgerExpenseCategoryHandler(repo),
		"PUT /ledger/expense-categories/{id}":          handler.UpdateLedgerExpenseCategoryHandler(repo),
		"DELETE /ledger/expense-categories/{id}":       handler.DeleteLedgerExpenseCategoryHandler(repo),
		"POST /ledger/income-records":                  handler.CreateLedgerIncomeRecordHandler(repo),
		"PUT /ledger/income-records/{id}":              handler.UpdateLedgerIncomeRecordHandler(repo),
		"DELETE /ledger/income-records/{id}":           handler.DeleteLedgerIncomeRecordHandler(repo),
		"PUT /ledger/base-income":                      handler.PutLedgerBaseIncomeHandler(repo),
		"POST /ledger/recurring-expenses":              handler.CreateLedgerRecurringExpenseHandler(repo),
		"PUT /ledger/recurring-expenses/{id}":          handler.UpdateLedgerRecurringExpenseHandler(repo),
		"DELETE /ledger/recurring-expenses/{id}":       handler.DeleteLedgerRecurringExpenseHandler(repo),
		"POST /ledger/recurring-expenses/{id}/confirm": handler.ConfirmLedgerRecurringExpenseHandler(repo),
		"POST /ledger/savings-goals":                   handler.CreateLedgerSavingsGoalHandler(repo),
		"PUT /ledger/savings-goals/{id}":               handler.UpdateLedgerSavingsGoalHandler(repo),
		"DELETE /ledger/savings-goals/{id}":            handler.DeleteLedgerSavingsGoalHandler(repo),
		"POST /ledger/savings-goals/{id}/postings":     handler.CreateLedgerSavingsPostingHandler(repo),
		"PUT /ledger/budget":                           handler.PutLedgerBudgetHandler(repo),
		"POST /ledger/surplus-allocations":             handler.CreateLedgerSurplusAllocationHandler(repo),
		"POST /household":                              handler.CreateHouseholdHandler(repo),
		"POST /household/invitations":                  handler.CreateHouseholdInvitationHandler(repo),
		"GET /household/invitations":                   handler.ListHouseholdInvitationsHandler(repo),
		"DELETE /household/invitations/{id}":           handler.RevokeHouseholdInvitationHandler(repo),
		"POST /household/join":                         handler.JoinHouseholdHandler(repo),
		"POST /household/leave":                        handler.LeaveHouseholdHandler(repo),
		"POST /household/dissolve":                     handler.DissolveHouseholdHandler(repo),
		"DELETE /household/members/{user_id}":          handler.RemoveHouseholdMemberHandler(repo),
		"PUT /household/allowances":                    handler.PutHouseholdAllowanceHandler(repo),
	}
	for route_pattern, command_handler := range ledger_command_routes {
		mux.Handle(route_pattern, handler.RequireSyncProtocol(command_handler))
	}
}
