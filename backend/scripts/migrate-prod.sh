#!/usr/bin/env bash
# Run pending migrations via a throwaway kubectl pod (no local psql required).
# Usage: DATABASE_URL=postgres://user:pass@host:5432/dbname ./backend/scripts/migrate-prod.sh
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"

MIGRATIONS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../migrations" && pwd)"

generate_sql() {
    cat <<'SQL'
CREATE TABLE IF NOT EXISTS applied_migrations (
    version VARCHAR PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
SQL

    for filepath in $(ls "$MIGRATIONS_DIR"/*.sql | sort); do
        version=$(basename "$filepath" .sql)
        migration_sql=$(sed 's/SELECT setval(/PERFORM setval(/g' "$filepath")
        cat <<SQL
DO \$migration_block\$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM applied_migrations WHERE version = '${version}') THEN
        ${migration_sql}
        INSERT INTO applied_migrations (version) VALUES ('${version}');
        RAISE NOTICE 'Applied ${version}';
    ELSE
        RAISE NOTICE 'Skipping ${version} (already applied)';
    END IF;
END
\$migration_block\$;
SQL
    done
}

NAMESPACE="${NAMESPACE:-atoikura}"

echo "Running migrations via kubectl (namespace: ${NAMESPACE})..."
generate_sql | kubectl run psql-migrate --rm -i --restart=Never \
    -n "${NAMESPACE}" \
    --image=postgres:16 \
    --env="DATABASE_URL=${DATABASE_URL}" \
    -- psql "${DATABASE_URL}"

echo "Done."
