import {
  computeAllowanceSummary,
  computeLedgerSummary,
  listDailyVariableSums,
  listHouseholdMembers,
  listMemberAllowanceTotals,
  listMonthlyBreakdown,
  listOwnAllowanceSpending,
  listPostedRecurringIds,
  sumVariableSpending,
} from "../logic/queries";
import type { SqlDatabase } from "./types";

// Read queries that run inside the DB worker (#201). The logic layer is written
// against the synchronous SqlDatabase, which only exists next to the database,
// so the main thread names a query and gets back only its result instead of
// pulling every row across the worker boundary. Only functions listed here can
// be called; their results must be structured-cloneable.
export const LOCAL_QUERIES = {
  computeAllowanceSummary,
  computeLedgerSummary,
  listDailyVariableSums,
  listHouseholdMembers,
  listMemberAllowanceTotals,
  listMonthlyBreakdown,
  listOwnAllowanceSpending,
  listPostedRecurringIds,
  sumVariableSpending,
} satisfies Record<string, (sql_db: SqlDatabase, ...query_args: never[]) => unknown>;

export type LocalQueryName = keyof typeof LOCAL_QUERIES;

type WithoutDatabase<TParameters extends unknown[]> = TParameters extends [unknown, ...infer TArgs]
  ? TArgs
  : never;

export type LocalQueryArgs<TName extends LocalQueryName> = WithoutDatabase<
  Parameters<(typeof LOCAL_QUERIES)[TName]>
>;

export type LocalQueryResult<TName extends LocalQueryName> = ReturnType<
  (typeof LOCAL_QUERIES)[TName]
>;

export class UnknownLocalQueryError extends Error {
  constructor(query_name: string) {
    super(`unknown local query: ${query_name}`);
    this.name = "UnknownLocalQueryError";
  }
}

// Runs a registered query in one read transaction, so it sees a consistent
// snapshot even if it issues several statements.
export function runLocalQuery(
  sql_db: SqlDatabase,
  query_name: string,
  query_args: unknown[]
): unknown {
  if (!Object.hasOwn(LOCAL_QUERIES, query_name)) throw new UnknownLocalQueryError(query_name);
  const local_query = LOCAL_QUERIES[query_name as LocalQueryName] as (
    sql_db: SqlDatabase,
    ...query_args: unknown[]
  ) => unknown;
  return sql_db.transaction(() => local_query(sql_db, ...query_args));
}
