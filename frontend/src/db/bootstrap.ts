import { runMigrations } from "./migrate";
import type { Migration, SqlDatabase } from "./types";

// Brings a freshly opened database to the latest schema and makes sure the
// singleton sync-state row exists. The device ID is generated once per install
// and is used in HLCs; it must survive app updates, hence INSERT OR IGNORE.
export function initializeDatabase(
  db: SqlDatabase,
  migrations: Migration[],
  createDeviceId: () => string
): number[] {
  const applied_versions = runMigrations(db, migrations);
  db.exec("INSERT OR IGNORE INTO _sync_state (singleton_id, device_id) VALUES (1, ?)", [
    createDeviceId(),
  ]);
  return applied_versions;
}
