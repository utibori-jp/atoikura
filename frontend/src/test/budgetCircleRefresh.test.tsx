import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import App from "../App";
import { server } from "./server";
import type { components } from "../api/types";

// Regression test for #108: the home "いくら使える？" circle must reflect a
// changed budget without a manual reload. The home reads `variable_budget` from
// /expenses/daily-cumulative (the auto budget, wired in #77) and refetches when
// it remounts on tab navigation. These tests lock that behaviour for both the
// desktop and mobile home screens.

const API_BASE = "http://localhost:8080";
const TOKEN_KEY = "atoikura.jwt_token";

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function mockMatchMedia(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
}

// One actual day of spend (¥3,000), so remaining = variable_budget - 3000.
function dailyCumulative(
  variable_budget: number
): components["schemas"]["DailyCumulativeResponse"] {
  return {
    year_month: "2026-06",
    variable_budget,
    daily_budget: 5000,
    days: [{ date: "2026-06-01", food: 1200, other: 800, total: 3000, is_actual: true }],
  };
}

describe("#108 — home budget circle reflects a changed budget", () => {
  beforeAll(() => {
    global.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;
  });
  beforeEach(() => sessionStorage.setItem(TOKEN_KEY, "test-token"));
  afterEach(() => sessionStorage.removeItem(TOKEN_KEY));

  it("updates the desktop home circle after navigating away and back", async () => {
    mockMatchMedia(false); // desktop
    let budget = 150000;
    server.use(
      http.get(`${API_BASE}/expenses/daily-cumulative`, () =>
        HttpResponse.json(dailyCumulative(budget))
      )
    );

    render(<App />);
    // remaining = 150000 - 3000
    await waitFor(() => expect(screen.getByText("147,000")).toBeInTheDocument());

    // The auto budget changes (e.g. the user edits income/recurring/savings).
    budget = 100000;

    fireEvent.click(screen.getByRole("button", { name: /予算/ }));
    await waitFor(() => expect(screen.queryByText("147,000")).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /ホーム/ }));

    // remaining = 100000 - 3000
    await waitFor(() => expect(screen.getByText("97,000")).toBeInTheDocument());
  });

  it("updates the mobile home circle after navigating away and back", async () => {
    mockMatchMedia(true); // mobile
    let budget = 150000;
    server.use(
      http.get(`${API_BASE}/expenses/daily-cumulative`, () =>
        HttpResponse.json(dailyCumulative(budget))
      )
    );

    render(<App />);
    await waitFor(() => expect(screen.getByText("147,000")).toBeInTheDocument());

    budget = 100000;

    fireEvent.click(screen.getByRole("button", { name: /予算/ }));
    await waitFor(() => expect(screen.queryByText("147,000")).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /ホーム/ }));

    await waitFor(() => expect(screen.getByText("97,000")).toBeInTheDocument());
  });
});
