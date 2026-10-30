import { validateDailyNote, validateMonthlyReviewNote } from "../logic";
import type { LedgerData } from "./ledgerData";

// Daily notes and monthly review notes: the signed-in user's own, offline-writable.
// Saving an empty note deletes it, as the legacy API did.

// date -> note of the user's notes in the month.
export async function listDailyNotes(
  ledger_data: LedgerData,
  year_month: string
): Promise<Record<string, string>> {
  const note_rows = await ledger_data.local_db.select(
    `SELECT date, note FROM daily_notes
     WHERE ledger_id = ? AND owner_id = ? AND deleted = 0 AND substr(date, 1, 7) = ?`,
    [ledger_data.ledger_id, ledger_data.user_id, year_month]
  );
  return Object.fromEntries(
    note_rows.map((note_row) => [String(note_row.date), String(note_row.note)])
  );
}

export async function saveDailyNote(
  ledger_data: LedgerData,
  date: string,
  note: string
): Promise<void> {
  const validation_result = validateDailyNote({ date, note });
  if (!validation_result.valid) throw new Error(validation_result.message);
  const [existing_row] = await ledger_data.local_db.select(
    `SELECT id FROM daily_notes
     WHERE ledger_id = ? AND owner_id = ? AND deleted = 0 AND date = ?`,
    [ledger_data.ledger_id, ledger_data.user_id, date]
  );
  await saveNote(ledger_data, "daily_notes", existing_row ? String(existing_row.id) : null, note, {
    date,
  });
}

// category_id -> note of the user's review notes for the month.
export async function listMonthlyReviewNotes(
  ledger_data: LedgerData,
  year_month: string
): Promise<Record<string, string>> {
  const note_rows = await ledger_data.local_db.select(
    `SELECT category_id, note FROM monthly_review_notes
     WHERE ledger_id = ? AND owner_id = ? AND deleted = 0 AND year_month = ?`,
    [ledger_data.ledger_id, ledger_data.user_id, year_month]
  );
  return Object.fromEntries(
    note_rows.map((note_row) => [String(note_row.category_id), String(note_row.note)])
  );
}

// Saves the notes of the given categories; categories not listed are left as is.
export async function saveMonthlyReviewNotes(
  ledger_data: LedgerData,
  year_month: string,
  notes_by_category_id: Record<string, string>
): Promise<void> {
  for (const [category_id, note] of Object.entries(notes_by_category_id)) {
    const validation_result = validateMonthlyReviewNote({ year_month, category_id, note });
    if (!validation_result.valid) throw new Error(validation_result.message);
  }
  const existing_ids_by_category_id = new Map(
    (
      await ledger_data.local_db.select(
        `SELECT id, category_id FROM monthly_review_notes
         WHERE ledger_id = ? AND owner_id = ? AND deleted = 0 AND year_month = ?`,
        [ledger_data.ledger_id, ledger_data.user_id, year_month]
      )
    ).map((note_row) => [String(note_row.category_id), String(note_row.id)])
  );
  for (const [category_id, note] of Object.entries(notes_by_category_id)) {
    await saveNote(
      ledger_data,
      "monthly_review_notes",
      existing_ids_by_category_id.get(category_id) ?? null,
      note,
      { year_month, category_id }
    );
  }
}

async function saveNote(
  ledger_data: LedgerData,
  collection_name: "daily_notes" | "monthly_review_notes",
  existing_note_id: string | null,
  note: string,
  key_fields: Record<string, string>
): Promise<void> {
  if (note === "") {
    if (existing_note_id) await ledger_data.store.deleteRecord(collection_name, existing_note_id);
    return;
  }
  if (existing_note_id) {
    await ledger_data.store.updateRecord(collection_name, existing_note_id, { note });
    return;
  }
  await ledger_data.store.createRecord(collection_name, { ...key_fields, note });
}
