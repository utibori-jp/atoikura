# M1 Step 3: Database Migrations

## Goal

Write `golang-migrate` migration SQL files that create all tables defined in
`docs/atoikura.dbml`, set up partial unique indexes, insert the fixed
`statement_types` master data, and seed personal initial data so the user can
start logging entries immediately after Step 6.

## Branch

Create `feature/m1-step3-migrations` off `develop`.

## Prerequisites

- Step 2 merged. PostgreSQL container runnable via `docker compose up -d db`.
- `docs/atoikura.dbml` defines the schema (this is the source of truth).

## Tasks

### 1. Install `golang-migrate` CLI

If not already installed locally:
```
brew install golang-migrate
```
or download from https://github.com/golang-migrate/migrate/releases

Verify with `migrate -version`.

### 2. Create migration files under `backend/migrations/`

Use the naming convention `NNNNNN_description.up.sql` / `NNNNNN_description.down.sql`.
Suggested split:

```
000001_create_users.up.sql
000001_create_users.down.sql
000002_create_statement_types.up.sql
000002_create_statement_types.down.sql
000003_create_category_groups.up.sql
000003_create_category_groups.down.sql
000004_create_expense_categories.up.sql
000004_create_expense_categories.down.sql
000005_create_journal_entries.up.sql
000005_create_journal_entries.down.sql
000006_create_budgets.up.sql
000006_create_budgets.down.sql
000007_create_daily_notes.up.sql
000007_create_daily_notes.down.sql
000008_create_monthly_reviews.up.sql
000008_create_monthly_reviews.down.sql
000009_create_accounts_v2.up.sql
000009_create_accounts_v2.down.sql
000010_seed_statement_types.up.sql
000010_seed_statement_types.down.sql
000011_seed_dev_user.up.sql
000011_seed_dev_user.down.sql
000012_seed_dev_categories.up.sql
000012_seed_dev_categories.down.sql
```

(Adjust numbers if you prefer to combine some — keep ordering consistent.)

### 3. Implementation notes per table

Strictly follow `docs/atoikura.dbml`. Specific points to handle correctly:

**Timestamp columns**:
- All `created_at` / `updated_at` / `deleted_at` use `TIMESTAMPTZ` (with timezone)
- Default `created_at` to `NOW()` and `updated_at` to `NOW()`

**`statement_types`** (migration 000002 + seed in 000010):
- `id` SERIAL PRIMARY KEY
- `type_code` VARCHAR NOT NULL UNIQUE
- `statement_type_name` VARCHAR NOT NULL
- `display_order` INT NOT NULL
- Seed exactly 4 rows in 000010:
  ```sql
  INSERT INTO statement_types (id, type_code, statement_type_name, display_order) VALUES
    (1, 'food', '食費', 1),
    (2, 'other', 'その他', 2),
    (3, 'fixed', '固定費', 3),
    (4, 'excluded', '対象外', 4);
  -- Reset the SERIAL sequence past the manually inserted IDs:
  SELECT setval('statement_types_id_seq', 4);
  ```

**`category_groups`** — partial unique index:
```sql
CREATE UNIQUE INDEX category_groups_user_group_name_active_idx
  ON category_groups (user_id, group_name)
  WHERE is_deleted = false;
```

**`expense_categories`** — partial unique index:
```sql
CREATE UNIQUE INDEX expense_categories_user_group_category_name_active_idx
  ON expense_categories (user_id, group_id, category_name)
  WHERE is_deleted = false;
```

**`budgets`** — `monthly_budget` and `goal_amount` are `INTEGER NOT NULL DEFAULT 0`. Add `UNIQUE (user_id)`.

**`monthly_reviews`** — `notes` is `JSONB`. Add `UNIQUE (user_id, year_month)`.

**`daily_notes`** — `note` is `TEXT NOT NULL`. Add `UNIQUE (user_id, date)`.

**Foreign keys**: add `REFERENCES` clauses based on the `Ref:` lines at the bottom of the DBML.

### 4. Seed development data

**`000011_seed_dev_user.up.sql`**:
- Insert one user with `id = 1` (matches the V1 hardcoded user_id):
  ```sql
  INSERT INTO users (id, email, password_hash, timezone)
  VALUES (1, 'dev@atoikura.local', 'dev_placeholder_hash', 'Asia/Tokyo');
  SELECT setval('users_id_seq', 1);
  ```

**`000012_seed_dev_categories.up.sql`**:
- Insert a reasonable starting set of category_groups and expense_categories
  for `user_id = 1`. Use these defaults:
  - 食費 (statement_type_id=1): スーパー, 外食, コンビニ
  - 日用品 (statement_type_id=2): 消耗品, ドラッグストア
  - 趣味・娯楽 (statement_type_id=2): 趣味, 書籍
  - 交通費 (statement_type_id=2): 電車・バス, タクシー
  - 家賃・サブスク (statement_type_id=3): 家賃, サブスクリプション
  - 出張経費 (statement_type_id=4): 経費精算

Make sure `expense_categories.group_id` references the correct `category_groups.id`
that was just inserted. Use a CTE or sequential inserts with explicit IDs and
reset sequences afterwards.

### 5. Run and verify migrations

```
# From repo root, with db running
docker compose up -d db

# Run migrations
migrate -path backend/migrations \
  -database "postgres://atoikura:dev_password@localhost:5432/atoikura?sslmode=disable" \
  up
```

Verify:
```
docker compose exec db psql -U atoikura -d atoikura -c "\dt"
docker compose exec db psql -U atoikura -d atoikura -c "SELECT * FROM statement_types;"
docker compose exec db psql -U atoikura -d atoikura -c "SELECT * FROM users;"
docker compose exec db psql -U atoikura -d atoikura -c "SELECT * FROM category_groups WHERE user_id = 1;"
docker compose exec db psql -U atoikura -d atoikura -c "SELECT * FROM expense_categories WHERE user_id = 1;"
```

Expected:
- All tables exist
- 4 rows in `statement_types`
- 1 row in `users`
- ~6 rows in `category_groups`, ~12 rows in `expense_categories` for user_id=1

Test rollback works:
```
migrate -path backend/migrations -database "..." down 1
```
should reverse the last migration cleanly. Then run `up` again.

### 6. Add a Makefile target (optional but recommended)

`backend/Makefile`:
```makefile
DB_URL ?= postgres://atoikura:dev_password@localhost:5432/atoikura?sslmode=disable

.PHONY: migrate-up migrate-down migrate-create

migrate-up:
	migrate -path migrations -database "$(DB_URL)" up

migrate-down:
	migrate -path migrations -database "$(DB_URL)" down 1

migrate-create:
	@read -p "Migration name: " name; \
	migrate create -ext sql -dir migrations -seq $$name
```

Document in README:
```markdown
### Run migrations
\`\`\`
cd backend && make migrate-up
\`\`\`
```

## Verification Checklist

- [ ] All migrations apply cleanly with `migrate up`
- [ ] All migrations roll back cleanly with `migrate down`
- [ ] `statement_types` has exactly 4 rows with correct codes
- [ ] User with `id=1` exists
- [ ] Partial unique indexes work (test by inserting+soft-deleting+reinserting same name)
- [ ] Foreign keys are enforced (test by inserting invalid foreign key, expect error)

## Commit Plan

1. `chore(backend/migrations): create base table migrations`
2. `chore(backend/migrations): add partial unique indexes`
3. `chore(backend/migrations): seed statement_types fixed master`
4. `chore(backend/migrations): seed dev user and categories`
5. `chore(backend): add Makefile for migration commands`
6. `docs(readme): document migration commands`

## After Completion

PR to `develop`. Wait for user confirmation.

## Out of Scope

- No sqlc setup yet (Step 4)
- No Go code yet (Step 5)
- No application logic
