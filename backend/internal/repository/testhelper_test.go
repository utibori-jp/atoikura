//go:build integration

package repository_test

import (
	"context"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/utibori-jp/atoikura/backend/internal/repository"
)

var (
	testPool *pgxpool.Pool
	testRepo *repository.Repository
)

func TestMain(m *testing.M) {
	pool, cleanup := mustSetupTestDB()
	testPool = pool
	testRepo = repository.New(pool)

	code := m.Run()

	pool.Close()
	cleanup()
	os.Exit(code)
}

func mustSetupTestDB() (*pgxpool.Pool, func()) {
	ctx := context.Background()

	admin_url := os.Getenv("TEST_DATABASE_URL")
	if admin_url == "" {
		admin_url = "postgres://atoikura:dev_password@db:5432/postgres?sslmode=disable"
	}

	admin_pool, err := pgxpool.New(ctx, admin_url)
	if err != nil {
		log.Fatalf("connecting to admin db: %v", err)
	}

	db_name := fmt.Sprintf("atoikura_itest_%d", time.Now().UnixNano())
	if _, err := admin_pool.Exec(ctx, fmt.Sprintf("CREATE DATABASE %s", db_name)); err != nil {
		log.Fatalf("creating test database %q: %v", db_name, err)
	}
	admin_pool.Close()

	test_url := replaceDBName(admin_url, db_name)
	pool, err := pgxpool.New(ctx, test_url)
	if err != nil {
		log.Fatalf("connecting to test database: %v", err)
	}

	if err := runMigrations(ctx, pool); err != nil {
		log.Fatalf("running migrations: %v", err)
	}

	cleanup := func() {
		drop_pool, err := pgxpool.New(context.Background(), admin_url)
		if err != nil {
			return
		}
		defer drop_pool.Close()
		_, _ = drop_pool.Exec(context.Background(),
			fmt.Sprintf("DROP DATABASE IF EXISTS %s WITH (FORCE)", db_name))
	}

	return pool, cleanup
}

// replaceDBName swaps the database name component of a postgres DSN.
// e.g. postgres://user:pass@host:5432/oldname?sslmode=disable → .../newname?sslmode=disable
func replaceDBName(dsn, db_name string) string {
	i := strings.LastIndex(dsn, "/")
	if i < 0 {
		return dsn
	}
	rest := dsn[i+1:]
	q := strings.Index(rest, "?")
	if q < 0 {
		return dsn[:i+1] + db_name
	}
	return dsn[:i+1] + db_name + rest[q:]
}

func runMigrations(ctx context.Context, pool *pgxpool.Pool) error {
	// Working directory for tests is the package directory, so ../../migrations
	// resolves to backend/migrations.
	migrations_dir := filepath.Join("..", "..", "migrations")
	entries, err := os.ReadDir(migrations_dir)
	if err != nil {
		return fmt.Errorf("reading migrations dir %q: %w", migrations_dir, err)
	}

	var files []string
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".sql") {
			files = append(files, filepath.Join(migrations_dir, e.Name()))
		}
	}
	sort.Strings(files)

	for _, path := range files {
		content, err := os.ReadFile(path)
		if err != nil {
			return fmt.Errorf("reading %s: %w", path, err)
		}
		if _, err := pool.Exec(ctx, string(content)); err != nil {
			return fmt.Errorf("executing %s: %w", path, err)
		}
	}
	return nil
}

type testUserSetup struct {
	UserID     int64
	CategoryID int32
}

// createTestUser creates a user with seeded default categories and returns
// the user ID and one category ID for use in entry tests.
func createTestUser(t *testing.T, email string) testUserSetup {
	t.Helper()
	ctx := context.Background()

	user, err := testRepo.CreateUserWithDefaults(ctx, email, nil, "testhash")
	if err != nil {
		t.Fatalf("creating test user %q: %v", email, err)
	}

	var cat_id int32
	if err := testPool.QueryRow(ctx,
		"SELECT id FROM expense_categories WHERE user_id = $1 ORDER BY id LIMIT 1",
		user.ID,
	).Scan(&cat_id); err != nil {
		t.Fatalf("querying category for user %d: %v", user.ID, err)
	}

	return testUserSetup{UserID: user.ID, CategoryID: cat_id}
}

func strPtr(s string) *string { return &s }
