import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import App from "../App";

// recharts ResponsiveContainer uses ResizeObserver, which jsdom doesn't provide
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
beforeAll(() => {
  global.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;
});

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

const TOKEN_KEY = "atoikura.jwt_token";

describe("App — mobile layout (≤ 1023 px)", () => {
  beforeEach(() => {
    mockMatchMedia(true);
    sessionStorage.setItem(TOKEN_KEY, "test-token");
  });

  afterEach(() => {
    sessionStorage.removeItem(TOKEN_KEY);
  });

  it("renders bottom tab bar instead of top nav", async () => {
    render(<App />);

    await waitFor(() => expect(screen.getByText("Atoikura")).toBeInTheDocument());

    // Bottom tab bar items
    expect(screen.getByRole("button", { name: /ホーム/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /振り返り/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /仕訳/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /予算/ })).toBeInTheDocument();

    // Desktop <nav> element must not be present
    expect(document.querySelector("nav")).not.toBeInTheDocument();
  });

  it("opens EntrySheet when FAB is clicked", async () => {
    render(<App />);

    await waitFor(() => expect(screen.getByText("Atoikura")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "＋" }));

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
  });

  it("closes EntrySheet when the close button is clicked", async () => {
    render(<App />);

    await waitFor(() => expect(screen.getByText("Atoikura")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "＋" }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("shows month navigation when journal tab is active", async () => {
    render(<App />);

    await waitFor(() => expect(screen.getByText("Atoikura")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /仕訳/ }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "‹" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "›" })).toBeInTheDocument();
    });
  });

  it("navigates to account view when avatar is clicked", async () => {
    render(<App />);

    await waitFor(() => expect(screen.getByText("Atoikura")).toBeInTheDocument());

    // Avatar button shows the initial of the user's display name
    fireEvent.click(screen.getByTitle("アカウント"));

    await waitFor(() => {
      // UserInfo renders a ログアウト button unique to the account view
      expect(screen.getByRole("button", { name: /ログアウト/ })).toBeInTheDocument();
    });
  });
});

describe("App — desktop layout (≥ 1024 px)", () => {
  beforeEach(() => {
    mockMatchMedia(false);
    sessionStorage.setItem(TOKEN_KEY, "test-token");
  });

  afterEach(() => {
    sessionStorage.removeItem(TOKEN_KEY);
  });

  it("renders top navigation bar with a <nav> element", async () => {
    render(<App />);

    await waitFor(() => expect(screen.getByText("Atoikura")).toBeInTheDocument());

    expect(document.querySelector("nav")).toBeInTheDocument();
  });

  it("includes マスタ tab that is absent from the mobile tab bar", async () => {
    render(<App />);

    await waitFor(() => expect(screen.getByText("Atoikura")).toBeInTheDocument());

    expect(screen.getByRole("button", { name: /マスタ/ })).toBeInTheDocument();
  });

  it("returns to the budget hub when the header 予算 button is clicked from a sub-screen (#134)", async () => {
    render(<App />);

    await waitFor(() => expect(screen.getByText("Atoikura")).toBeInTheDocument());

    const nav = document.querySelector("nav") as HTMLElement;

    // Open the budget tab → land on the hub.
    fireEvent.click(within(nav).getByRole("button", { name: /予算/ }));
    await waitFor(() => expect(screen.getByText("今月の予算プラン")).toBeInTheDocument());

    // Drill into the 収入 (income) sub-screen via the hub tile.
    fireEvent.click(screen.getByText("毎月の見込み収入"));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /収入を記録/ })).toBeInTheDocument()
    );
    expect(screen.queryByText("今月の予算プラン")).not.toBeInTheDocument();

    // Clicking the header 予算 button must bring the hub back, not leave us
    // stranded on the income sub-screen.
    fireEvent.click(within(nav).getByRole("button", { name: /予算/ }));
    await waitFor(() => expect(screen.getByText("今月の予算プラン")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /収入を記録/ })).not.toBeInTheDocument();
  });

  it("pushes a history entry for each in-app screen transition (#165)", async () => {
    const push_spy = vi.spyOn(window.history, "pushState");
    render(<App />);

    await waitFor(() => expect(screen.getByText("Atoikura")).toBeInTheDocument());
    const nav = document.querySelector("nav") as HTMLElement;

    // Tab change pushes a history entry carrying the new location.
    fireEvent.click(within(nav).getByRole("button", { name: /予算/ }));
    await waitFor(() => expect(screen.getByText("今月の予算プラン")).toBeInTheDocument());
    expect(push_spy).toHaveBeenCalledWith({ nav: { tab: "budget", sub: "hub" } }, "");

    // Drilling into a sub-screen pushes another entry.
    fireEvent.click(screen.getByText("毎月の見込み収入"));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /収入を記録/ })).toBeInTheDocument()
    );
    expect(push_spy).toHaveBeenCalledWith({ nav: { tab: "budget", sub: "income" } }, "");

    push_spy.mockRestore();
  });

  it("browser Back (popstate) returns to the previous in-app screen (#165)", async () => {
    render(<App />);

    await waitFor(() => expect(screen.getByText("Atoikura")).toBeInTheDocument());
    const nav = document.querySelector("nav") as HTMLElement;

    // Navigate home → budget hub → income sub-screen.
    fireEvent.click(within(nav).getByRole("button", { name: /予算/ }));
    await waitFor(() => expect(screen.getByText("今月の予算プラン")).toBeInTheDocument());
    fireEvent.click(screen.getByText("毎月の見込み収入"));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /収入を記録/ })).toBeInTheDocument()
    );

    // Back restores the budget hub (the previous location), not an app exit.
    window.dispatchEvent(
      new PopStateEvent("popstate", { state: { nav: { tab: "budget", sub: "hub" } } })
    );
    await waitFor(() => expect(screen.getByText("今月の予算プラン")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /収入を記録/ })).not.toBeInTheDocument();

    // Back again restores home.
    window.dispatchEvent(
      new PopStateEvent("popstate", { state: { nav: { tab: "home", sub: "hub" } } })
    );
    await waitFor(() => expect(screen.queryByText("今月の予算プラン")).not.toBeInTheDocument());
  });
});
