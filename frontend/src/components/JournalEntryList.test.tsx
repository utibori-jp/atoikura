import { render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "../test/server";
import { JournalEntryList } from "./JournalEntryList";
import type { components } from "../api/types";

const API_BASE = "http://localhost:8080";

describe("JournalEntryList", () => {
  it("shows empty state when no entries exist", async () => {
    render(<JournalEntryList year_month="2026-06" refresh_token={0} />);

    await waitFor(() => {
      expect(screen.getByText("この月はまだ仕訳が登録されていません")).toBeInTheDocument();
    });
  });

  it("renders entries grouped by date", async () => {
    const entryList: components["schemas"]["JournalEntryListResponse"] = {
      year_month: "2026-06",
      entries: [
        {
          date: "2026-06-01",
          journal_entries: [
            {
              id: 1,
              transaction_date: "2026-06-01",
              item: "スーパー購入",
              amount: 1200,
              category_id: 1,
              category_name: "スーパー",
              group_id: 1,
              group_name: "食費",
              is_excluded: false,
              note: null,
              created_at: "2026-06-01T10:00:00Z",
            },
          ],
        },
      ],
    };

    server.use(http.get(`${API_BASE}/journal-entries`, () => HttpResponse.json(entryList)));

    render(<JournalEntryList year_month="2026-06" refresh_token={0} />);

    await waitFor(() => {
      expect(screen.getByText("スーパー購入")).toBeInTheDocument();
    });

    expect(screen.getByText("食費")).toBeInTheDocument();
  });

  it("shows monthly total of non-excluded entries in the total pill", async () => {
    const entryList: components["schemas"]["JournalEntryListResponse"] = {
      year_month: "2026-06",
      entries: [
        {
          date: "2026-06-01",
          journal_entries: [
            {
              id: 1,
              transaction_date: "2026-06-01",
              item: "食費",
              amount: 1000,
              category_id: 1,
              category_name: "スーパー",
              group_id: 1,
              group_name: "食費",
              is_excluded: false,
              note: null,
              created_at: "2026-06-01T10:00:00Z",
            },
            {
              id: 2,
              transaction_date: "2026-06-01",
              item: "記念日",
              amount: 5000,
              category_id: 1,
              category_name: "スーパー",
              group_id: 1,
              group_name: "食費",
              is_excluded: true,
              note: null,
              created_at: "2026-06-01T11:00:00Z",
            },
          ],
        },
      ],
    };

    server.use(http.get(`${API_BASE}/journal-entries`, () => HttpResponse.json(entryList)));

    render(<JournalEntryList year_month="2026-06" refresh_token={0} />);

    await waitFor(() => {
      expect(screen.getByText("今月の合計（変動費）")).toBeInTheDocument();
    });

    // The monthly total pill shows ¥1,000 (excluding the ¥5,000 is_excluded entry)
    const totalPill = screen.getByText("今月の合計（変動費）").parentElement!;
    expect(totalPill).toHaveTextContent("¥1,000");
  });
});
