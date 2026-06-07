import { render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "../test/server";
import { SummaryCards } from "./SummaryCards";
import { dailyAvailableTone } from "./SummaryCards.utils";
import type { components } from "../api/types";

const API_BASE = "http://localhost:8080";

function makeDailyCumulative(
  overrides: Partial<components["schemas"]["DailyCumulativeResponse"]> = {}
): components["schemas"]["DailyCumulativeResponse"] {
  return {
    year_month: "2026-06",
    monthly_budget: 150000,
    daily_budget: 5000,
    days: [
      {
        date: "2026-06-01",
        food: 1200,
        other: 800,
        total: 2000,
        is_actual: true,
      },
      {
        date: "2026-06-02",
        food: 2500,
        other: 1200,
        total: 3700,
        is_actual: true,
      },
    ],
    ...overrides,
  };
}

describe("SummaryCards", () => {
  it("renders three stat pills after data loads", async () => {
    render(<SummaryCards />);

    await waitFor(() => {
      expect(screen.getByText("今月の支出")).toBeInTheDocument();
      expect(screen.getByText("残り予算")).toBeInTheDocument();
      expect(screen.getByText("1日あたり利用可能額")).toBeInTheDocument();
    });
  });

  it("shows correct total spend from last actual day", async () => {
    server.use(
      http.get(`${API_BASE}/expenses/daily-cumulative`, () =>
        HttpResponse.json(makeDailyCumulative())
      )
    );

    render(<SummaryCards />);

    await waitFor(() => {
      expect(screen.getByText("今月の支出")).toBeInTheDocument();
    });

    expect(screen.getByText(/¥3,700/)).toBeInTheDocument();
  });

  it("shows remaining budget as monthly_budget minus total_spend", async () => {
    server.use(
      http.get(`${API_BASE}/expenses/daily-cumulative`, () =>
        HttpResponse.json(makeDailyCumulative({ monthly_budget: 10000 }))
      )
    );

    render(<SummaryCards />);

    await waitFor(() => {
      expect(screen.getByText("残り予算")).toBeInTheDocument();
    });

    expect(screen.getByText(/¥6,300/)).toBeInTheDocument();
  });
});

describe("dailyAvailableTone", () => {
  it("returns sage when daily_available is >= 50% of daily_budget", () => {
    expect(dailyAvailableTone(5000, 5000)).toBe("sage");
    expect(dailyAvailableTone(2500, 5000)).toBe("sage");
    expect(dailyAvailableTone(3000, 4000)).toBe("sage");
  });

  it("returns mustard when daily_available is < 50% of daily_budget but >= 0", () => {
    expect(dailyAvailableTone(2499, 5000)).toBe("mustard");
    expect(dailyAvailableTone(1, 5000)).toBe("mustard");
    expect(dailyAvailableTone(0, 5000)).toBe("mustard");
  });

  it("returns danger when daily_available is < 0", () => {
    expect(dailyAvailableTone(-1, 5000)).toBe("danger");
    expect(dailyAvailableTone(-5000, 5000)).toBe("danger");
  });
});
