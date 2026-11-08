import type { SqlValue } from "../db/types";

// Which collections sync how (docs/local-first/design.md §2). The field lists
// mirror the server allowlists in backend/internal/syncrules.

export type FieldKind = "text" | "integer" | "boolean";

export interface OfflineCollectionSpec {
  fields: Record<string, FieldKind>;
  // Fields that can't change once the record exists (the server answers IMMUTABLE).
  immutable: string[];
  // Pushed with a new record to name its ledger, "personal" or "household"
  // (design.md D15). It is not a column: the device derives it from ledger_id.
  target_field?: string;
}

export const OFFLINE_COLLECTIONS = {
  journal_entries: {
    fields: {
      transaction_date: "text",
      item: "text",
      amount: "integer",
      is_excluded: "boolean",
      category_id: "text",
      note: "text",
    },
    immutable: [],
    target_field: "ledger",
  },
  daily_notes: {
    fields: { date: "text", note: "text" },
    immutable: ["date"],
  },
  monthly_review_notes: {
    fields: { year_month: "text", category_id: "text", note: "text" },
    immutable: ["year_month", "category_id"],
  },
} satisfies Record<string, OfflineCollectionSpec>;

export type OfflineCollectionName = keyof typeof OFFLINE_COLLECTIONS;

// Read caches of the online-only collections, replaced wholesale by pull.
export const ONLINE_ONLY_COLLECTIONS = [
  "ledgers",
  "ledger_members",
  "category_groups",
  "expense_categories",
  "income_records",
  "base_incomes",
  "recurring_expenses",
  "savings_goals",
  "savings_postings",
  "budgets",
  "allowances",
  "surplus_allocations",
  "allowance_totals",
] as const;

export type OnlineOnlyCollectionName = (typeof ONLINE_ONLY_COLLECTIONS)[number];

export type SyncedCollectionName = OfflineCollectionName | OnlineOnlyCollectionName;

// Outbox field name of a pending deletion.
export const DELETED_FIELD = "__deleted";

export function isOfflineCollection(
  collection_name: string
): collection_name is OfflineCollectionName {
  return Object.hasOwn(OFFLINE_COLLECTIONS, collection_name);
}

export function isOnlineOnlyCollection(
  collection_name: string
): collection_name is OnlineOnlyCollectionName {
  return (ONLINE_ONLY_COLLECTIONS as readonly string[]).includes(collection_name);
}

export function offlineFieldNames(collection_name: OfflineCollectionName): string[] {
  return Object.keys(OFFLINE_COLLECTIONS[collection_name].fields);
}

export function offlineFieldKind(
  collection_name: OfflineCollectionName,
  field_name: string
): FieldKind | undefined {
  const field_kinds: Record<string, FieldKind> = OFFLINE_COLLECTIONS[collection_name].fields;
  return Object.hasOwn(field_kinds, field_name) ? field_kinds[field_name] : undefined;
}

// SQLite stores booleans as 0/1; the wire format uses JSON booleans.
export function toWireValue(field_kind: FieldKind, local_value: SqlValue): unknown {
  if (field_kind === "boolean" && local_value !== null) return local_value !== 0;
  return local_value;
}

// Converts a JSON value from the server into a SQLite value.
export function toLocalValue(wire_value: unknown): SqlValue {
  if (wire_value === null || wire_value === undefined) return null;
  if (typeof wire_value === "boolean") return wire_value ? 1 : 0;
  if (typeof wire_value === "number" || typeof wire_value === "string") return wire_value;
  return JSON.stringify(wire_value);
}

// The target field a new record of the collection is pushed with, if any.
export function offlineTargetField(collection_name: OfflineCollectionName): string | undefined {
  const collection_spec: OfflineCollectionSpec = OFFLINE_COLLECTIONS[collection_name];
  return collection_spec.target_field;
}
