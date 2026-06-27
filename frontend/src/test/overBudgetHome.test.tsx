import { render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import App from "../App";
import { server } from "./server";
import type { components } from "../api/types";

// #125 — when the month's spend exceeds the variable budget, Home must surface
// the over-budget state explicitly (label + overspend amount) instead of
// clamping 『あといくら』to a bare ¥0. Locks the behaviour for web and mobile.

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

// Budget ¥2,000 with ¥3,000 spent → ¥1,000 over budget, 150% used.
function overBudgetCumulative(): components["schemas"]["DailyCumulativeResponse"] {
  return {
    year_month: "2026-06",
    variable_budget: 2000,
    daily_budget: 5000,
    days: [{ date: "2026-06-01", food: 1800, other: 1200, total: 3000, is_actual: true }],
  };
}

describe("#125 — Home surfaces the over-budget state", () => {
  beforeAll(() => {
    global.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;
  });
  beforeEach(() => sessionStorage.setItem(TOKEN_KEY, "test-token"));
  afterEach(() => sessionStorage.removeItem(TOKEN_KEY));

  it("shows 予算オーバー and the overspend amount on the desktop home", async () => {
    mockMatchMedia(false); // desktop
    server.use(
      http.get(`${API_BASE}/expenses/daily-cumulative`, () =>
        HttpResponse.json(overBudgetCumulative())
      )
    );

    render(<App />);

    await waitFor(() => expect(screen.getByText("予算オーバー")).toBeInTheDocument());
    // Overspend = 3000 − 2000 = 1000, shown with a leading minus (glyph-robust).
    expect(
      screen.getByText((content) => content.replace(/[−-]/, "-") === "-1,000")
    ).toBeInTheDocument();
    // 150% used.
    expect(screen.getByText("150%")).toBeInTheDocument();
  });

  it("shows 予算オーバー and the overspend amount on the mobile home", async () => {
    mockMatchMedia(true); // mobile
    server.use(
      http.get(`${API_BASE}/expenses/daily-cumulative`, () =>
        HttpResponse.json(overBudgetCumulative())
      )
    );

    render(<App />);

    await waitFor(() => expect(screen.getByText("予算オーバー")).toBeInTheDocument());
    expect(
      screen.getByText((content) => content.replace(/[−-]/, "-") === "-1,000")
    ).toBeInTheDocument();
    expect(screen.getByText("150%")).toBeInTheDocument();
  });
});
