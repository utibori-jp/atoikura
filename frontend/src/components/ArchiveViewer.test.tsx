import { fireEvent, screen, within } from "@testing-library/react";
import { createJournalEntry } from "../data/journal";
import { archiveLedgerData } from "../data/household";
import {
  ARCHIVE_CATEGORY_ID,
  seedArchive,
  seedPersonalLedger,
  TEST_ARCHIVE_ID,
  TestLedgerServer,
} from "../test/ledgerFixtures";
import { openSyncedSession, renderWithLedger } from "../test/renderWithLedger";
import { ArchiveViewer } from "./ArchiveViewer";

function archiveLedgerServer() {
  const ledger_server = new TestLedgerServer();
  seedPersonalLedger(ledger_server);
  seedArchive(ledger_server, {
    name: "前の家計",
    entries: [
      { transaction_date: "2026-08-10", amount: 2400, item: "E2E八月の買い物" },
      { transaction_date: "2026-09-03", amount: 1200, item: "九月の買い物" },
      { transaction_date: "2026-09-20", amount: 800 },
    ],
    incomes: [{ transaction_date: "2026-09-25", amount: 300000 }],
  });
  return ledger_server;
}

async function renderViewer(onBack = () => {}) {
  await renderWithLedger(
    <ArchiveViewer archive_ledger_id={TEST_ARCHIVE_ID} onBack={onBack} />,
    archiveLedgerServer()
  );
  expect(await screen.findByText("前の家計", undefined, { timeout: 5000 })).toBeVisible();
}

describe("ArchiveViewer", () => {
  it("shows the archive's last month of entries, read-only", async () => {
    await renderViewer();

    expect(screen.getByText("閲覧専用")).toBeInTheDocument();
    expect(screen.getByText("2026/08〜2026/09")).toBeInTheDocument();
    expect(screen.getByText("2026年9月")).toBeInTheDocument();
    expect(await screen.findByText("九月の買い物")).toBeInTheDocument();
    expect(screen.getByText("¥1,200")).toBeInTheDocument();
    // Nothing to edit: no edit buttons, notes or entry form.
    expect(screen.queryByRole("button", { name: "✎" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("moves only within the archive's months", async () => {
    await renderViewer();

    expect(screen.getByRole("button", { name: "次の月" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "前の月" }));
    expect(await screen.findByText("E2E八月の買い物")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "前の月" })).toBeDisabled();
  });

  it("totals the month by category, with its income", async () => {
    await renderViewer();

    fireEvent.click(screen.getByRole("button", { name: "振り返り" }));

    const food_section = await screen.findByRole("region", { name: "食費" });
    // The group total and its one category: 1,200 + 800.
    expect(within(food_section).getAllByText("¥2,000")).toHaveLength(2);
    expect(within(food_section).getByText("食費 · スーパー")).toBeInTheDocument();
    expect(screen.getByText("¥300,000")).toBeInTheDocument();
  });

  it("goes back", async () => {
    const onBack = vi.fn();
    await renderViewer(onBack);

    fireEvent.click(screen.getByRole("button", { name: "‹ 戻る" }));
    expect(onBack).toHaveBeenCalled();
  });
});

describe("archive ledger data", () => {
  it("refuses to write entries into a past household", async () => {
    const { ledger_data } = await openSyncedSession(archiveLedgerServer());
    const archive_data = archiveLedgerData(ledger_data, TEST_ARCHIVE_ID);

    await expect(
      createJournalEntry(archive_data, {
        transaction_date: "2026-09-04",
        amount: 100,
        category_id: ARCHIVE_CATEGORY_ID,
        is_excluded: false,
        item: null,
        note: null,
      })
    ).rejects.toThrow("過去の家計は編集できません");
  });
});
