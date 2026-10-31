import type { SqlRow, SqlValue } from "../db/types";
import { STATEMENT_TYPES, type StatementTypeCode, validateJournalEntry } from "../logic";
import type { LedgerData } from "./ledgerData";

// Journal entries and the categories they reference, read from the local
// database. Entries are offline-writable: writes are validated here with the
// same rules as the server, then stored and queued for push.

export interface StatementTypeView {
  // The legacy statement_types ID, which equals the display order (1 food …
  // 4 excluded); screens still pick a type by it.
  id: number;
  type_code: StatementTypeCode;
  statement_type_name: string;
}

export interface CategoryGroupView {
  id: string;
  group_name: string;
  statement_type: StatementTypeView;
  description: string | null;
}

export interface ExpenseCategoryView {
  id: string;
  category_name: string;
  category_code: string | null;
  group_id: string;
  group_name: string;
  description: string | null;
}

export interface JournalEntryView {
  id: string;
  transaction_date: string;
  item: string | null;
  amount: number;
  category_id: string;
  category_name: string;
  group_id: string;
  group_name: string;
  statement_type_code: StatementTypeCode;
  is_excluded: boolean;
  note: string | null;
  is_recurring: boolean;
  // The category was deleted after the entry was written (design.md §5.1).
  is_category_deleted: boolean;
  // Only the author edits an entry, except household recurring postings (D11).
  can_edit: boolean;
}

export interface JournalDay {
  date: string;
  journal_entries: JournalEntryView[];
}

// What the entry forms edit.
export interface JournalEntryFields {
  transaction_date: string;
  amount: number;
  category_id: string;
  is_excluded: boolean;
  item: string | null;
  note: string | null;
}

export const STATEMENT_TYPE_VIEWS: readonly StatementTypeView[] = STATEMENT_TYPES.map(
  (statement_type) => ({
    id: statement_type.display_order,
    type_code: statement_type.type_code,
    statement_type_name: statement_type.statement_type_name,
  })
);

export function statementTypeView(type_code: StatementTypeCode): StatementTypeView {
  return (
    STATEMENT_TYPE_VIEWS.find((statement_type) => statement_type.type_code === type_code) ?? {
      id: 99,
      type_code,
      statement_type_name: type_code,
    }
  );
}

function textOrNull(raw_value: SqlValue | undefined): string | null {
  return raw_value === null || raw_value === undefined ? null : String(raw_value);
}

export async function listCategoryGroups(ledger_data: LedgerData): Promise<CategoryGroupView[]> {
  const group_rows = await ledger_data.local_db.select(
    `SELECT id, name, statement_type_code, description FROM category_groups
     WHERE ledger_id = ? AND deleted = 0
     ORDER BY created_at, id`,
    [ledger_data.ledger_id]
  );
  return group_rows.map((group_row) => ({
    id: String(group_row.id),
    group_name: String(group_row.name),
    statement_type: statementTypeView(group_row.statement_type_code as StatementTypeCode),
    description: textOrNull(group_row.description),
  }));
}

export async function listExpenseCategories(
  ledger_data: LedgerData
): Promise<ExpenseCategoryView[]> {
  const category_rows = await ledger_data.local_db.select(
    `SELECT ec.id, ec.name, ec.category_code, ec.group_id, ec.description, cg.name AS group_name
     FROM expense_categories ec
     JOIN category_groups cg ON cg.id = ec.group_id
     WHERE ec.ledger_id = ? AND ec.deleted = 0
     ORDER BY ec.created_at, ec.id`,
    [ledger_data.ledger_id]
  );
  return category_rows.map((category_row) => ({
    id: String(category_row.id),
    category_name: String(category_row.name),
    category_code: textOrNull(category_row.category_code),
    group_id: String(category_row.group_id),
    group_name: String(category_row.group_name),
    description: textOrNull(category_row.description),
  }));
}

function journalEntryView(entry_row: SqlRow, ledger_data: LedgerData): JournalEntryView {
  const is_recurring = entry_row.recurring_expense_id !== null;
  return {
    id: String(entry_row.id),
    transaction_date: String(entry_row.transaction_date),
    item: textOrNull(entry_row.item),
    amount: Number(entry_row.amount),
    category_id: String(entry_row.category_id),
    // A category that hasn't synced yet can't be joined; show the entry anyway.
    category_name: textOrNull(entry_row.category_name) ?? "",
    group_id: textOrNull(entry_row.group_id) ?? "",
    group_name: textOrNull(entry_row.group_name) ?? "",
    statement_type_code: (entry_row.statement_type_code as StatementTypeCode | null) ?? "other",
    is_excluded: Number(entry_row.is_excluded) === 1,
    note: textOrNull(entry_row.note),
    is_recurring,
    is_category_deleted: Number(entry_row.category_deleted) === 1,
    can_edit:
      ledger_data.mode !== "archive" &&
      (Number(entry_row.owner_id) === ledger_data.user_id ||
        (is_recurring && entry_row.ledger_id === ledger_data.household_ledger_id)),
  };
}

// The month's entries grouped by day, newest day first (as GET /journal-entries).
export async function listJournalDays(
  ledger_data: LedgerData,
  year_month: string
): Promise<JournalDay[]> {
  const entry_rows = await ledger_data.local_db.select(
    `SELECT je.id, je.ledger_id, je.owner_id, je.transaction_date, je.item, je.amount, je.category_id,
            je.is_excluded, je.note, je.recurring_expense_id,
            ec.name AS category_name, ec.deleted AS category_deleted,
            cg.id AS group_id, cg.name AS group_name, cg.statement_type_code
     FROM journal_entries je
     LEFT JOIN expense_categories ec ON ec.id = je.category_id
     LEFT JOIN category_groups cg ON cg.id = ec.group_id
     WHERE je.ledger_id = ? AND je.deleted = 0 AND substr(je.transaction_date, 1, 7) = ?
     ORDER BY je.transaction_date DESC, je.id DESC`,
    [ledger_data.ledger_id, year_month]
  );
  const journal_days: JournalDay[] = [];
  for (const entry_row of entry_rows) {
    const entry_view = journalEntryView(entry_row, ledger_data);
    const last_day = journal_days[journal_days.length - 1];
    if (last_day?.date === entry_view.transaction_date) {
      last_day.journal_entries.push(entry_view);
    } else {
      journal_days.push({ date: entry_view.transaction_date, journal_entries: [entry_view] });
    }
  }
  return journal_days;
}

async function categoryStatusLookup(
  ledger_data: LedgerData
): Promise<(category_id: string) => "active" | "deleted" | "unknown"> {
  const category_rows = await ledger_data.local_db.select(
    "SELECT id, deleted FROM expense_categories WHERE ledger_id = ?",
    [ledger_data.ledger_id]
  );
  const deleted_by_category_id = new Map(
    category_rows.map((category_row) => [
      String(category_row.id),
      Number(category_row.deleted) === 1,
    ])
  );
  return (category_id) => {
    const is_deleted = deleted_by_category_id.get(category_id);
    if (is_deleted === undefined) return "unknown";
    return is_deleted ? "deleted" : "active";
  };
}

async function validateEntryFields(
  ledger_data: LedgerData,
  entry_fields: JournalEntryFields
): Promise<void> {
  requireWritable(ledger_data);
  const validation_result = validateJournalEntry(
    { ...entry_fields },
    {
      categoryStatus: await categoryStatusLookup(ledger_data),
    }
  );
  if (!validation_result.valid) throw new Error(validation_result.message);
}

function entryColumnValues(entry_fields: JournalEntryFields): Record<string, SqlValue> {
  return {
    transaction_date: entry_fields.transaction_date,
    amount: entry_fields.amount,
    category_id: entry_fields.category_id,
    is_excluded: entry_fields.is_excluded ? 1 : 0,
    item: entry_fields.item,
    note: entry_fields.note,
  };
}

// A past household is read-only; the server refuses its writes as well.
function requireWritable(ledger_data: LedgerData): void {
  if (ledger_data.mode === "archive") throw new Error("過去の家計は編集できません");
}

// Records an entry in the ledger the screens show and returns its ID.
export async function createJournalEntry(
  ledger_data: LedgerData,
  entry_fields: JournalEntryFields
): Promise<string> {
  requireWritable(ledger_data);
  await validateEntryFields(ledger_data, entry_fields);
  return ledger_data.store.createRecord(
    "journal_entries",
    entryColumnValues(entry_fields),
    ledger_data.ledger_target
  );
}

export async function updateJournalEntry(
  ledger_data: LedgerData,
  entry_id: string,
  entry_fields: JournalEntryFields
): Promise<void> {
  const [entry_row] = await ledger_data.local_db.select(
    "SELECT id FROM journal_entries WHERE id = ? AND deleted = 0",
    [entry_id]
  );
  if (!entry_row) throw new Error("この支出は削除されています");
  await validateEntryFields(ledger_data, entry_fields);
  await ledger_data.store.updateRecord(
    "journal_entries",
    entry_id,
    entryColumnValues(entry_fields)
  );
}

export async function deleteJournalEntry(ledger_data: LedgerData, entry_id: string): Promise<void> {
  requireWritable(ledger_data);
  await ledger_data.store.deleteRecord("journal_entries", entry_id);
}
