import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { putJournalEntry, seedPersonalLedger, TestLedgerServer } from "../../test/ledgerFixtures";
import { renderWithLedger } from "../../test/renderWithLedger";
import { WebJournal } from "./WebJournal";

const OTHER_MEMBER_ID = 2;
const INITIAL_LOAD = { timeout: 5000 };

function serveJournal() {
  const ledger_server = new TestLedgerServer();
  seedPersonalLedger(ledger_server);
  putJournalEntry(ledger_server, { transaction_date: "2026-10-05", amount: 1200, item: "パン" });
  putJournalEntry(
    ledger_server,
    { transaction_date: "2026-10-04", amount: 3400, item: "家族の買い物" },
    OTHER_MEMBER_ID
  );
  return ledger_server;
}

describe("WebJournal on the local database", () => {
  it("lists the month's entries and offers edit/delete only for the user's own", async () => {
    await renderWithLedger(
      <WebJournal year_month="2026-10" onYearMonthChange={() => {}} onEditEntry={() => {}} />,
      serveJournal()
    );

    const own_row = (await screen.findByText("パン", undefined, INITIAL_LOAD)).closest("div[style]")
      ?.parentElement?.parentElement as HTMLElement;
    expect(within(own_row).getByRole("button", { name: "✎" })).toBeInTheDocument();
    const other_row = screen.getByText("家族の買い物").closest("div[style]")?.parentElement
      ?.parentElement as HTMLElement;
    expect(within(other_row).queryByRole("button", { name: "✎" })).not.toBeInTheDocument();
  });

  it("deletes an entry after confirmation, on the device", async () => {
    const { local_db } = await renderWithLedger(
      <WebJournal year_month="2026-10" onYearMonthChange={() => {}} onEditEntry={() => {}} />,
      serveJournal()
    );
    await screen.findByText("パン", undefined, INITIAL_LOAD);

    fireEvent.click(screen.getByRole("button", { name: "🗑" }));
    fireEvent.click(await screen.findByRole("button", { name: "削除" }));

    await waitFor(() => expect(screen.queryByText("パン")).not.toBeInTheDocument());
    expect(
      await local_db.select(
        "SELECT COUNT(*) AS pending_count FROM _outbox WHERE field = '__deleted'"
      )
    ).toEqual([{ pending_count: 1 }]);
  });

  it("saves a day's note as the user types", async () => {
    const { local_db } = await renderWithLedger(
      <WebJournal year_month="2026-10" onYearMonthChange={() => {}} onEditEntry={() => {}} />,
      serveJournal()
    );
    await screen.findByText("パン", undefined, INITIAL_LOAD);

    const [newest_day_note] = screen.getAllByPlaceholderText("💭 この日のひとことを残す…");
    fireEvent.focus(newest_day_note);
    fireEvent.change(newest_day_note, { target: { value: "よく買った" } });

    await waitFor(
      async () =>
        expect(await local_db.select("SELECT date, note FROM daily_notes")).toEqual([
          { date: "2026-10-05", note: "よく買った" },
        ]),
      { timeout: 3000 }
    );
    expect((newest_day_note as HTMLInputElement).value).toBe("よく買った");
  });
});

describe("WebJournal CSV export", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("saves the month's entries on the device as a CSV file", async () => {
    const saved_blobs: Blob[] = [];
    URL.createObjectURL = vi.fn((saved_blob: Blob) => {
      saved_blobs.push(saved_blob);
      return "blob:journal-csv";
    });
    URL.revokeObjectURL = vi.fn();
    const saved_file_names: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement
    ) {
      saved_file_names.push(this.download);
    });
    await renderWithLedger(
      <WebJournal year_month="2026-10" onYearMonthChange={() => {}} onEditEntry={() => {}} />,
      serveJournal()
    );
    await screen.findByText("パン", undefined, INITIAL_LOAD);

    fireEvent.click(screen.getByRole("button", { name: "⬇ CSV" }));

    expect(saved_file_names).toEqual(["atoikura-journal-2026-10.csv"]);
    const csv_text = await saved_blobs[0].text();
    expect(csv_text).toContain(",家族の買い物,3400,");
    expect(csv_text).toContain(",パン,1200,");
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:journal-csv");
  });

  it("is disabled for a month without entries", async () => {
    await renderWithLedger(
      <WebJournal year_month="2026-09" onYearMonthChange={() => {}} onEditEntry={() => {}} />,
      serveJournal()
    );
    await screen.findByText("この月の仕訳はありません", undefined, INITIAL_LOAD);
    expect(screen.getByRole("button", { name: "⬇ CSV" })).toBeDisabled();
  });
});
