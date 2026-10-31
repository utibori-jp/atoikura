import type { JournalDay, JournalEntryView } from "./journal";
import { csvTextCell, journalCsv, journalCsvFileName } from "./journalCsv";

function journalEntry(entry_overrides: Partial<JournalEntryView>): JournalEntryView {
  return {
    id: "entry",
    transaction_date: "2026-10-05",
    item: "パン",
    amount: 1200,
    category_id: "category",
    category_name: "スーパー・自炊",
    group_id: "group",
    group_name: "食費",
    statement_type_code: "food",
    is_excluded: false,
    note: null,
    is_recurring: false,
    is_category_deleted: false,
    can_edit: true,
    ...entry_overrides,
  };
}

function csvLines(csv_text: string): string[] {
  return csv_text.replace(/^\uFEFF/, "").split("\r\n");
}

describe("journal CSV", () => {
  it("lists the month's entries oldest first under a header, with a BOM and CRLF lines", () => {
    const journal_days: JournalDay[] = [
      {
        date: "2026-10-07",
        journal_entries: [
          journalEntry({ transaction_date: "2026-10-07", item: "電車", amount: 300 }),
        ],
      },
      {
        date: "2026-10-05",
        journal_entries: [
          journalEntry({ note: "特売" }),
          journalEntry({ item: null, amount: 5000, is_excluded: true }),
        ],
      },
    ];

    const csv_text = journalCsv(journal_days);

    expect(csv_text.startsWith("\uFEFF")).toBe(true);
    expect(csvLines(csv_text)).toEqual([
      "日付,大分類,カテゴリ,内容,金額,対象外,メモ",
      "2026-10-05,食費,スーパー・自炊,パン,1200,,特売",
      "2026-10-05,食費,スーパー・自炊,,5000,対象外,",
      "2026-10-07,食費,スーパー・自炊,電車,300,,",
      "",
    ]);
  });

  it("neutralizes text cells a spreadsheet would run as a formula", () => {
    for (const formula_text of [
      '=HYPERLINK("http://evil.example")',
      "+1+1",
      "-2+3",
      "@SUM(A1)",
      "\tcmd",
      "\rcmd",
      "＝1+1",
    ]) {
      expect(csvTextCell(formula_text)).toMatch(/^"?'/);
    }
    const entry_line = csvLines(
      journalCsv([
        {
          date: "2026-10-05",
          journal_entries: [journalEntry({ item: "=cmd|' /C calc'!A0", note: "@SUM(1)" })],
        },
      ])
    )[1];
    expect(entry_line).toBe("2026-10-05,食費,スーパー・自炊,'=cmd|' /C calc'!A0,1200,,'@SUM(1)");
  });

  it("quotes cells with commas, quotes or line breaks, and leaves plain text alone", () => {
    expect(csvTextCell("ランチ, 2人")).toBe('"ランチ, 2人"');
    expect(csvTextCell('お店の"特製"')).toBe('"お店の""特製"""');
    expect(csvTextCell("1行目\n2行目")).toBe('"1行目\n2行目"');
    expect(csvTextCell("=A1,B1")).toBe('"\'=A1,B1"');
    expect(csvTextCell("唐揚げ定食 - 大盛り")).toBe("唐揚げ定食 - 大盛り");
  });

  it("names the file after the month", () => {
    expect(journalCsvFileName("2026-10")).toBe("atoikura-journal-2026-10.csv");
  });
});
