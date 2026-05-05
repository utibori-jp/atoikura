#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MIGRATIONS_DIR="$REPO_ROOT/backend/migrations"

psql_exec() {
    docker compose -f "$REPO_ROOT/docker-compose.yml" exec -T db psql -U atoikura -d atoikura "$@"
}

psql_exec -c "
CREATE TABLE IF NOT EXISTS applied_migrations (
    version VARCHAR PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);"

for filepath in $(ls "$MIGRATIONS_DIR"/*.sql | sort); do
    version=$(basename "$filepath" .sql)
    count=$(psql_exec -t -c "SELECT COUNT(*) FROM applied_migrations WHERE version = '$version';" | tr -d ' \n')
    if [ "$count" = "0" ]; then
        echo "Applying $version..."
        psql_exec < "$filepath"
        psql_exec -c "INSERT INTO applied_migrations (version) VALUES ('$version');"
    else
        echo "Skipping $version (already applied)"
    fi
done

echo "All migrations applied."
