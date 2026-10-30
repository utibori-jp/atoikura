import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import App from "../App";
import { todayInJst } from "../logic";
import type { FakeSyncEnvironment } from "../sync/testing/fakeEnvironment";
import { createTestAppServices } from "./appServices";
import {
  BASE_INCOME_ID,
  putJournalEntry,
  seedPersonalLedger,
  TEST_USER_ID,
  TestLedgerServer,
} from "./ledgerFixtures";
import { server } from "./server";

// Regression test for #108: the home "いくら使える？" circle must reflect a
// changed budget without a manual reload. The home computes the budget from the
// local database and re-reads it whenever a sync changes local data, so a budget
// edited elsewhere (another device, or the budget screens) shows up on its own.
// These tests lock that behaviour for both the desktop and mobile home screens.

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

// ¥3,000 spent today, so remaining = base income − 3000. Returns a function that
// changes the base income on the server and syncs it to the app.
function serveLedger(app_services: ReturnType<typeof createTestAppServices>) {
  const ledger_server = new TestLedgerServer();
  seedPersonalLedger(ledger_server, { base_income_amount: 150000 });
  putJournalEntry(ledger_server, { transaction_date: todayInJst(), amount: 3000 });
  server.use(ledger_server.pullHandler());
  return (base_income_amount: number) => {
    ledger_server.putRow("base_incomes", BASE_INCOME_ID, {
      member_id: TEST_USER_ID,
      amount: base_income_amount,
    });
    (app_services.sync_environment as FakeSyncEnvironment).wake();
  };
}

// The first render of a file waits for SQLite WASM to initialize.
const INITIAL_LOAD = { timeout: 5000 };

describe("#108 — home budget circle reflects a changed budget", () => {
  beforeAll(() => {
    global.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;
  });

  it("updates the desktop home circle when a sync brings a new budget", async () => {
    mockMatchMedia(false); // desktop
    const app_services = createTestAppServices();
    const changeBaseIncome = serveLedger(app_services);

    render(<App services={app_services} />);
    // remaining = 150000 - 3000
    await waitFor(() => expect(screen.getByText("147,000")).toBeInTheDocument(), INITIAL_LOAD);

    // The auto budget changes (e.g. the user edits income/recurring/savings).
    changeBaseIncome(100000);

    // remaining = 100000 - 3000
    await waitFor(() => expect(screen.getByText("97,000")).toBeInTheDocument());
  });

  it("updates the mobile home circle after navigating away and back", async () => {
    mockMatchMedia(true); // mobile
    const app_services = createTestAppServices();
    const changeBaseIncome = serveLedger(app_services);

    render(<App services={app_services} />);
    await waitFor(() => expect(screen.getByText("147,000")).toBeInTheDocument(), INITIAL_LOAD);

    fireEvent.click(screen.getByRole("button", { name: /予算/ }));
    await waitFor(() => expect(screen.queryByText("147,000")).not.toBeInTheDocument());
    changeBaseIncome(100000);
    fireEvent.click(screen.getByRole("button", { name: /ホーム/ }));

    await waitFor(() => expect(screen.getByText("97,000")).toBeInTheDocument());
  });
});
