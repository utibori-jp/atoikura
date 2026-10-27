import type { Migration, SqlDatabase } from "./types";

export class SchemaVersionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SchemaVersionError";
  }
}

export function getSchemaVersion(db: SqlDatabase): number {
  const version_rows = db.selectRows("PRAGMA user_version");
  return Number(version_rows[0]?.user_version ?? 0);
}

function assertMigrationSequence(migrations: Migration[]): void {
  migrations.forEach((migration, migration_index) => {
    if (migration.version !== migration_index + 1) {
      throw new SchemaVersionError(
        `migration versions must be 1..n without gaps (found ${migration.version} at position ${migration_index + 1})`
      );
    }
  });
}

// Applies every migration newer than the database's PRAGMA user_version, each in
// its own transaction together with the version bump, so a failing migration
// leaves the database at the previous version. Re-running is a no-op.
// Returns the list of versions that were applied.
export function runMigrations(db: SqlDatabase, migrations: Migration[]): number[] {
  assertMigrationSequence(migrations);

  const current_version = getSchemaVersion(db);
  const latest_known_version = migrations.length;
  if (current_version > latest_known_version) {
    // A newer app version already upgraded this device's DB. Running older code
    // against it could corrupt data, so refuse instead of guessing.
    throw new SchemaVersionError(
      `local database is at schema version ${current_version}, newer than this app (${latest_known_version})`
    );
  }

  const applied_versions: number[] = [];
  for (const migration of migrations.slice(current_version)) {
    db.transaction(() => {
      for (const statement of migration.statements) {
        db.exec(statement);
      }
      // PRAGMA does not accept bound parameters; the version is a trusted integer.
      db.exec(`PRAGMA user_version = ${migration.version}`);
    });
    applied_versions.push(migration.version);
  }
  return applied_versions;
}
