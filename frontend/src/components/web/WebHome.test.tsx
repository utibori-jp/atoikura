import { screen, waitFor, fireEvent } from "@testing-library/react";
import { seedPersonalLedger, TestLedgerServer } from "../../test/ledgerFixtures";
import { renderWithLedger } from "../../test/renderWithLedger";
import { WebHome } from "./WebHome";

function todayJST(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

// Regression test for #118: the home entry form must keep the date the user
// entered after a successful save, so consecutive entries on the same past date
// don't require re-selecting the date each time.
describe("WebHome entry form date retention (#118)", () => {
  it("keeps the entered past date after saving instead of resetting to today", async () => {
    const ledger_server = new TestLedgerServer();
    seedPersonalLedger(ledger_server);
    const { local_db } = await renderWithLedger(<WebHome />, ledger_server);

    // Wait for the master data (group chip button) to load.
    await waitFor(() => expect(screen.getByRole("button", { name: /食費/ })).toBeInTheDocument(), {
      timeout: 5000,
    });

    const date_input = screen.getByLabelText("日付") as HTMLInputElement;
    const past_date = "2026-06-01";
    fireEvent.change(date_input, { target: { value: past_date } });

    // Select group then category chip.
    fireEvent.click(screen.getByRole("button", { name: /食費/ }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "スーパー" })).toBeInTheDocument()
    );
    fireEvent.click(screen.getByRole("button", { name: "スーパー" }));

    // Enter amount.
    const amount_input = screen.getByPlaceholderText("0") as HTMLInputElement;
    fireEvent.change(amount_input, { target: { value: "1200" } });

    // Submit.
    fireEvent.click(screen.getByText("＋ 記録する"));

    // The entry is stored on the device (and queued for push).
    await waitFor(async () =>
      expect(await local_db.select("SELECT transaction_date, amount FROM journal_entries")).toEqual(
        [{ transaction_date: past_date, amount: 1200 }]
      )
    );

    // The date field must still hold the entered past date, not snap to today.
    await waitFor(() => {
      expect((screen.getByLabelText("日付") as HTMLInputElement).value).toBe(past_date);
    });
    expect((screen.getByLabelText("日付") as HTMLInputElement).value).not.toBe(todayJST());

    // Amount still resets after a successful save.
    expect((screen.getByPlaceholderText("0") as HTMLInputElement).value).toBe("");
  });
});
