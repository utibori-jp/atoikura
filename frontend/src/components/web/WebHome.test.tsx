import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "../../test/server";
import { WebHome } from "./WebHome";

const API_BASE = "http://localhost:8080";

function todayJST(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

// Regression test for #118: the home entry form must keep the date the user
// entered after a successful save, so consecutive entries on the same past date
// don't require re-selecting the date each time.
describe("WebHome entry form date retention (#118)", () => {
  it("keeps the entered past date after saving instead of resetting to today", async () => {
    let created = 0;
    server.use(
      http.post(`${API_BASE}/journal-entries`, () => {
        created += 1;
        return HttpResponse.json(
          {
            id: 1,
            transaction_date: "2026-06-01",
            item: null,
            amount: 1200,
            category_id: 1,
            category_name: "スーパー",
            group_id: 1,
            group_name: "食費",
            is_excluded: false,
            note: null,
            created_at: "2026-06-01T00:00:00Z",
          },
          { status: 201 }
        );
      })
    );

    render(<WebHome refresh_token={0} onSuccess={() => {}} />);

    // Wait for the master data (group chip button) to load.
    await waitFor(() => expect(screen.getByRole("button", { name: /食費/ })).toBeInTheDocument());

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

    await waitFor(() => expect(created).toBe(1));

    // The date field must still hold the entered past date, not snap to today.
    await waitFor(() => {
      expect((screen.getByLabelText("日付") as HTMLInputElement).value).toBe(past_date);
    });
    expect((screen.getByLabelText("日付") as HTMLInputElement).value).not.toBe(todayJST());

    // Amount still resets after a successful save.
    expect((screen.getByPlaceholderText("0") as HTMLInputElement).value).toBe("");
  });
});
