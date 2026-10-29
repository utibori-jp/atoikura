import type { SqlRow, SqlValue } from "./types";

// Message protocol between the main thread (client.ts) and the DB worker (worker.ts).

export interface SqlStatement {
  sql: string;
  bind?: SqlValue[];
}

export type DbRequest =
  | { request_id: number; kind: "select"; statement: SqlStatement }
  | { request_id: number; kind: "exec"; statement: SqlStatement }
  // All statements run in one transaction; any failure rolls the whole batch back.
  | { request_id: number; kind: "batch"; statements: SqlStatement[] }
  // Runs a registered read query (localQueries.ts) and returns its result.
  | { request_id: number; kind: "query"; query_name: string; query_args: unknown[] }
  | { request_id: number; kind: "close" }
  // Deletes the database file and creates a fresh one at the latest schema. The
  // response row carries the new schema_version.
  | { request_id: number; kind: "recreate" };

export type DbResponse =
  | { request_id: number; ok: true; rows: SqlRow[]; result?: unknown }
  | { request_id: number; ok: false; error_name: string; error_message: string };

// MIGRATION_FAILED and SCHEMA_TOO_NEW leave the worker running with the old database
// (recoverable), so pending changes can be pushed before it is recreated.
export type DbInitErrorCode =
  | "OPFS_UNAVAILABLE"
  | "OPEN_FAILED"
  | "MIGRATION_FAILED"
  | "SCHEMA_TOO_NEW";

export type DbWorkerEvent =
  | { kind: "ready"; schema_version: number }
  | {
      kind: "init_error";
      error_code: DbInitErrorCode;
      error_message: string;
      recoverable: boolean;
    };
