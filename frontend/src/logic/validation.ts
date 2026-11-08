import { isValidDate, isValidYearMonth } from "./calendar";

// Validation of offline-writable records, run on the device before a write is
// stored and queued. The journal entry rules and messages mirror the server
// (POST /journal-entries today, push validation in Step 5) and are checked
// against testdata/logic/journal_entry_validation.json. Rules are checked in
// order and the first failure wins.

export type ValidationResult =
  | { valid: true; warnings: ValidationWarning[] }
  | { valid: false; message: string };

export interface ValidationWarning {
  code: "DELETED_CATEGORY";
  message: string;
}

export interface JournalEntryInput {
  transaction_date?: string;
  item?: string | null;
  amount?: number;
  category_id?: string | null;
  is_excluded?: boolean;
  note?: string | null;
}

export interface JournalEntryContext {
  // Looks the category up in the local cache of the entry's ledger.
  // "deleted" is accepted with a warning: the entry may have been written offline
  // before the deletion synced (design.md §5.1).
  categoryStatus: (category_id: string) => "active" | "deleted" | "unknown";
}

const MAX_ITEM_LENGTH = 100;
// Journal entry notes, daily notes and monthly review notes share one cap.
export const MAX_NOTE_LENGTH = 500;
const MAX_AMOUNT = 2_147_483_647;

// Length in Unicode code points, matching Go's len([]rune(s)).
export function codePointLength(text: string): number {
  return [...text].length;
}

function invalid(message: string): ValidationResult {
  return { valid: false, message };
}

export function validateJournalEntry(
  entry_input: JournalEntryInput,
  entry_context: JournalEntryContext
): ValidationResult {
  if (entry_input.transaction_date === undefined || !isValidDate(entry_input.transaction_date)) {
    return invalid("transaction_dateはYYYY-MM-DD形式で指定してください");
  }
  const amount = entry_input.amount;
  if (amount === undefined || !Number.isInteger(amount) || amount < 1 || amount > MAX_AMOUNT) {
    return invalid("amountは正の整数である必要があります");
  }
  if (!entry_input.category_id) {
    return invalid("category_idは必須です");
  }
  if (entry_input.is_excluded === undefined) {
    return invalid("is_excludedは必須です");
  }
  if (entry_input.item != null && codePointLength(entry_input.item) > MAX_ITEM_LENGTH) {
    return invalid("itemは100文字以内で入力してください");
  }
  if (entry_input.note != null && codePointLength(entry_input.note) > MAX_NOTE_LENGTH) {
    return invalid("noteは500文字以内で入力してください");
  }

  const category_status = entry_context.categoryStatus(entry_input.category_id);
  if (category_status === "unknown") {
    return invalid("指定されたcategory_idは存在しません");
  }
  const warnings: ValidationWarning[] =
    category_status === "deleted"
      ? [
          {
            code: "DELETED_CATEGORY",
            message: "削除済みのカテゴリです。別のカテゴリを選んでください",
          },
        ]
      : [];
  return { valid: true, warnings };
}

export interface DailyNoteInput {
  date?: string;
  note?: string;
}

// An empty note is valid: saving it tombstones the day's note.
export function validateDailyNote(note_input: DailyNoteInput): ValidationResult {
  if (note_input.date === undefined || !isValidDate(note_input.date)) {
    return invalid("dateはYYYY-MM-DD形式で指定してください");
  }
  if (note_input.note === undefined) {
    return invalid("リクエストの形式が不正です");
  }
  if (codePointLength(note_input.note) > MAX_NOTE_LENGTH) {
    return invalid(`noteは${MAX_NOTE_LENGTH}文字以内で入力してください`);
  }
  return { valid: true, warnings: [] };
}

export interface MonthlyReviewNoteInput {
  year_month?: string;
  category_id?: string | null;
  note?: string;
}

export function validateMonthlyReviewNote(note_input: MonthlyReviewNoteInput): ValidationResult {
  if (note_input.year_month === undefined || !isValidYearMonth(note_input.year_month)) {
    return invalid("year_monthはYYYY-MM形式で指定してください");
  }
  if (!note_input.category_id) {
    return invalid("category_idは必須です");
  }
  if (note_input.note === undefined) {
    return invalid("リクエストの形式が不正です");
  }
  if (codePointLength(note_input.note) > MAX_NOTE_LENGTH) {
    return invalid(`noteは${MAX_NOTE_LENGTH}文字以内で入力してください`);
  }
  return { valid: true, warnings: [] };
}
