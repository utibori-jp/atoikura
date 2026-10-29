import type { DbRequest, DbResponse } from "./protocol";
import type { SqlDatabase } from "./types";

// Executes one worker request against the database. Kept separate from worker.ts
// so it can be tested without a Worker or OPFS. "close" and "recreate" are handled by the worker.
export function handleDbRequest(
  db: SqlDatabase,
  request: Exclude<DbRequest, { kind: "close" | "recreate" }>
): DbResponse {
  try {
    switch (request.kind) {
      case "select":
        return {
          request_id: request.request_id,
          ok: true,
          rows: db.selectRows(request.statement.sql, request.statement.bind),
        };
      case "exec":
        db.exec(request.statement.sql, request.statement.bind);
        return { request_id: request.request_id, ok: true, rows: [] };
      case "batch":
        db.transaction(() => {
          for (const statement of request.statements) {
            db.exec(statement.sql, statement.bind);
          }
        });
        return { request_id: request.request_id, ok: true, rows: [] };
    }
  } catch (caught_error) {
    const sql_error =
      caught_error instanceof Error ? caught_error : new Error(String(caught_error));
    return {
      request_id: request.request_id,
      ok: false,
      error_name: sql_error.name,
      error_message: sql_error.message,
    };
  }
}
