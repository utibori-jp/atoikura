import { render, screen, waitFor } from "@testing-library/react";
import App from "../App";
import { todayInJst } from "../logic";
import { createTestAppServices } from "./appServices";
import { putJournalEntry, seedPersonalLedger, TestLedgerServer } from "./ledgerFixtures";
import { server } from "./server";

// #125 — when the month's spend exceeds the variable budget, Home must surface
// the over-budget state explicitly (label + overspend amount) instead of
// clamping 『あといくら』to a bare ¥0. Locks the behaviour for web and mobile.

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

// Budget ¥2,000 (the base income, nothing else deducted) with ¥3,000 spent today
// → ¥1,000 over budget, 150% used.
function serveOverBudgetLedger(): void {
  const ledger_server = new TestLedgerServer();
  seedPersonalLedger(ledger_server, { base_income_amount: 2000 });
  putJournalEntry(ledger_server, { transaction_date: todayInJst(), amount: 3000 });
  server.use(ledger_server.pullHandler());
}

// The first render of a file waits for SQLite WASM to initialize.
const INITIAL_LOAD = { timeout: 5000 };

describe("#125 — Home surfaces the over-budget state", () => {
  beforeAll(() => {
    global.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;
  });

  it("shows 予算オーバー and the overspend amount on the desktop home", async () => {
    mockMatchMedia(false); // desktop
    serveOverBudgetLedger();

    render(<App services={createTestAppServices()} />);

    await waitFor(() => expect(screen.getByText("予算オーバー")).toBeInTheDocument(), INITIAL_LOAD);
    // Overspend = 3000 − 2000 = 1000, shown with a leading minus (glyph-robust).
    expect(
      screen.getByText((content) => content.replace(/[−-]/, "-") === "-1,000")
    ).toBeInTheDocument();
    // 150% used.
    expect(screen.getByText("150%")).toBeInTheDocument();
  });

  it("shows 予算オーバー and the overspend amount on the mobile home", async () => {
    mockMatchMedia(true); // mobile
    serveOverBudgetLedger();

    render(<App services={createTestAppServices()} />);

    await waitFor(() => expect(screen.getByText("予算オーバー")).toBeInTheDocument(), INITIAL_LOAD);
    expect(
      screen.getByText((content) => content.replace(/[−-]/, "-") === "-1,000")
    ).toBeInTheDocument();
    expect(screen.getByText("150%")).toBeInTheDocument();
  });
});
