import type { JournalDay } from "../data/journal";
import { downloadTextFile, journalCsv, journalCsvFileName } from "../data/journalCsv";
import { T } from "../theme";

// Saves the shown month's journal entries as a CSV file. Disabled until the
// month is loaded or when it has no entries.
export function JournalCsvButton({
  year_month,
  journal_days,
}: {
  year_month: string;
  journal_days: readonly JournalDay[] | null;
}) {
  const has_entries = journal_days !== null && journal_days.length > 0;
  return (
    <button
      type="button"
      disabled={!has_entries}
      onClick={() => {
        if (!journal_days) return;
        downloadTextFile(
          journalCsvFileName(year_month),
          journalCsv(journal_days),
          "text/csv;charset=utf-8"
        );
      }}
      style={{
        height: 32,
        padding: "0 14px",
        borderRadius: 999,
        background: "#fff",
        border: `1.5px solid ${T.hair}`,
        fontFamily: "inherit",
        fontSize: 13,
        fontWeight: 600,
        color: has_entries ? T.ink : T.inkSoft,
        cursor: has_entries ? "pointer" : "default",
        opacity: has_entries ? 1 : 0.6,
        whiteSpace: "nowrap",
      }}
    >
      ⬇ CSV
    </button>
  );
}
