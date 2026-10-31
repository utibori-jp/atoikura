import type { JournalDay } from "./journal";

// CSV export of a month's journal entries (#208), built from the local copy so
// it works offline. Spreadsheet apps run a cell starting with = + - @ (or a tab
// or CR) as a formula, so such text cells get a leading ' (CSV injection); the
// full-width forms are included because Japanese spreadsheet apps can read them
// as formula starts too. Amounts stay plain numbers.

const JOURNAL_CSV_HEADER = ["日付", "大分類", "カテゴリ", "内容", "金額", "対象外", "メモ"];

const FORMULA_START_PATTERN = /^[=+\-@\t\r＝＋－＠]/;

// Excel reads a UTF-8 file without a BOM as Shift_JIS and garbles Japanese.
const UTF8_BOM = "\uFEFF";

export function csvTextCell(cell_text: string): string {
  const neutralized_text = FORMULA_START_PATTERN.test(cell_text) ? `'${cell_text}` : cell_text;
  return /[",\r\n]/.test(neutralized_text)
    ? `"${neutralized_text.replace(/"/g, '""')}"`
    : neutralized_text;
}

// The month's entries, oldest first, as a CSV file with a BOM and CRLF lines.
export function journalCsv(journal_days: readonly JournalDay[]): string {
  const csv_lines = [JOURNAL_CSV_HEADER.map(csvTextCell).join(",")];
  const oldest_first_days = [...journal_days].sort((first_day, second_day) =>
    first_day.date.localeCompare(second_day.date)
  );
  for (const journal_day of oldest_first_days) {
    for (const journal_entry of journal_day.journal_entries) {
      csv_lines.push(
        [
          csvTextCell(journal_entry.transaction_date),
          csvTextCell(journal_entry.group_name),
          csvTextCell(journal_entry.category_name),
          csvTextCell(journal_entry.item ?? ""),
          String(Math.round(journal_entry.amount)),
          csvTextCell(journal_entry.is_excluded ? "対象外" : ""),
          csvTextCell(journal_entry.note ?? ""),
        ].join(",")
      );
    }
  }
  return UTF8_BOM + csv_lines.join("\r\n") + "\r\n";
}

export function journalCsvFileName(year_month: string): string {
  return `atoikura-journal-${year_month}.csv`;
}

// Saves text as a file through a temporary object URL.
export function downloadTextFile(file_name: string, file_text: string, mime_type: string): void {
  const file_url = URL.createObjectURL(new Blob([file_text], { type: mime_type }));
  const download_link = document.createElement("a");
  download_link.href = file_url;
  download_link.download = file_name;
  document.body.appendChild(download_link);
  download_link.click();
  download_link.remove();
  URL.revokeObjectURL(file_url);
}
