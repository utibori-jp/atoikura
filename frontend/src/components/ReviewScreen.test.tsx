import { fireEvent, screen, waitFor } from "@testing-library/react";
import { addMonths, todayInJst } from "../logic";
import {
  putJournalEntry,
  seedPersonalLedger,
  SUPERMARKET_CATEGORY_ID,
  TestLedgerServer,
} from "../test/ledgerFixtures";
import { renderWithLedger } from "../test/renderWithLedger";
import { ReviewScreen } from "./ReviewScreen";

// The review screen opens on the previous month.
const review_month = addMonths(todayInJst().slice(0, 7), -1);

describe("ReviewScreen on the local database", () => {
  it("shows the month's category totals and saves a memo on the device", async () => {
    const ledger_server = new TestLedgerServer();
    seedPersonalLedger(ledger_server);
    putJournalEntry(ledger_server, { transaction_date: `${review_month}-10`, amount: 4321 });
    const { local_db } = await renderWithLedger(<ReviewScreen />, ledger_server);

    expect(await screen.findByText("スーパー", undefined, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.getAllByText("¥4,321").length).toBeGreaterThan(0);
    fireEvent.change(screen.getByPlaceholderText("メモを残す…"), {
      target: { value: "まとめ買いした" },
    });
    expect(screen.getByText("未保存の変更があります")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(screen.getByText("保存しました")).toBeInTheDocument());
    expect(screen.queryByText("未保存の変更があります")).not.toBeInTheDocument();
    expect(
      await local_db.select("SELECT year_month, category_id, note FROM monthly_review_notes")
    ).toEqual([
      { year_month: review_month, category_id: SUPERMARKET_CATEGORY_ID, note: "まとめ買いした" },
    ]);
    expect((screen.getByPlaceholderText("メモを残す…") as HTMLInputElement).value).toBe(
      "まとめ買いした"
    );
  });
});
