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
  | { request_id: number; kind: "close" };

export type DbResponse =
  | { request_id: number; ok: true; rows: SqlRow[] }
  | { request_id: number; ok: false; error_name: string; error_message: string };

export type DbInitErrorCode = "OPFS_UNAVAILABLE" | "OPEN_FAILED";

export type DbWorkerEvent =
  | { kind: "ready"; schema_version: number }
  | { kind: "init_error"; error_code: DbInitErrorCode; error_message: string };
