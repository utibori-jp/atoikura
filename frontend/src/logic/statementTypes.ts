// The global statement_types master is an app constant in the local-first design
// (docs/local-first/design.md §3.1) and is referenced by type_code, never by ID.
// Mirrors backend/migrations/000010_seed_statement_types.sql.

export type StatementTypeCode = "food" | "other" | "fixed" | "excluded";

export interface StatementType {
  type_code: StatementTypeCode;
  statement_type_name: string;
  display_order: number;
}

export const STATEMENT_TYPES: readonly StatementType[] = [
  { type_code: "food", statement_type_name: "食費", display_order: 1 },
  { type_code: "other", statement_type_name: "その他", display_order: 2 },
  { type_code: "fixed", statement_type_name: "固定費", display_order: 3 },
  { type_code: "excluded", statement_type_name: "対象外", display_order: 4 },
];

// Statement types that count as variable spending ("あといくら" and the home graph).
export const VARIABLE_STATEMENT_TYPE_CODES: readonly StatementTypeCode[] = ["food", "other"];
