import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import type { ReactElement } from "react";
import { http, HttpResponse } from "msw";
import { server } from "../../test/server";
import { WebRecurring } from "./WebRecurring";
import { DialogProvider } from "../dialogs";
import type { components } from "../../api/types";

// WebRecurring consumes the confirm dialog via context (#166).
function renderWithDialogs(ui: ReactElement) {
  return render(<DialogProvider>{ui}</DialogProvider>);
}

const API_BASE = "http://localhost:8080";

// --- fixture helpers ---

function makeRecurring(
  overrides: Partial<components["schemas"]["RecurringExpense"]> = {}
): components["schemas"]["RecurringExpense"] {
  return {
    id: 1,
    name: "家賃",
    emoji: "🏠",
    billing_day: 25,
    amount: 80000,
    type: "fixed",
    category_id: 1,
    group_id: 1,
    group_name: "固定費",
    category_name: "家賃",
    ...overrides,
  };
}

function makeRecurringList(
  items: components["schemas"]["RecurringExpense"][]
): components["schemas"]["RecurringExpenseListResponse"] {
  return { recurring_expenses: items };
}

function makePendingList(
  items: components["schemas"]["PendingRecurring"][] = []
): components["schemas"]["PendingRecurringListResponse"] {
  return { pending: items };
}

function makePending(
  overrides: Partial<components["schemas"]["PendingRecurring"]> = {}
): components["schemas"]["PendingRecurring"] {
  return {
    id: 1,
    name: "電気代",
    emoji: "💡",
    billing_day: 10,
    last_amount: 7480,
    group_name: "固定費",
    ...overrides,
  };
}

function makeCategoryList(): components["schemas"]["ExpenseCategoryListResponse"] {
  return {
    expense_categories: [
      {
        id: 1,
        category_name: "スーパー",
        category_code: "food_super",
        group_id: 1,
        group_name: "食費",
        description: null,
      },
    ],
  };
}

// Helper: wait until the page subtitle is present (always rendered, unique text).
async function waitForReady() {
  await waitFor(() => {
    expect(screen.getByText("毎月の固定・半固定費を管理します")).toBeInTheDocument();
  });
}

// Category groups where group id=1 is treated as fixed-cost, so that makeCategoryList()
// categories (group_id=1) pass the fixed-cost filter in WebRecurring.
function makeDefaultCategoryGroups(): components["schemas"]["CategoryGroupListResponse"] {
  return {
    category_groups: [
      {
        id: 1,
        group_name: "固定費",
        statement_type: { id: 3, type_code: "fixed", statement_type_name: "固定費" },
        description: null,
      },
    ],
  };
}

// Override recurring + pending + expense-categories for each test suite
function useDefaultHandlers(
  recurringList: components["schemas"]["RecurringExpenseListResponse"] = makeRecurringList([])
) {
  server.use(
    http.get(`${API_BASE}/recurring-expenses`, () => HttpResponse.json(recurringList)),
    http.get(`${API_BASE}/recurring-expenses/pending`, () => HttpResponse.json(makePendingList())),
    http.get(`${API_BASE}/expense-categories`, () => HttpResponse.json(makeCategoryList())),
    http.get(`${API_BASE}/category-groups`, () => HttpResponse.json(makeDefaultCategoryGroups()))
  );
}

// --- category-filter fixtures ---

function makeFixedOnlyGroups(): components["schemas"]["CategoryGroupListResponse"] {
  return {
    category_groups: [
      {
        id: 3,
        group_name: "固定費",
        statement_type: { id: 3, type_code: "fixed", statement_type_name: "固定費" },
        description: null,
      },
      {
        id: 1,
        group_name: "食費",
        statement_type: { id: 1, type_code: "food", statement_type_name: "食費（変動費）" },
        description: null,
      },
    ],
  };
}

function makeMixedCategories(): components["schemas"]["ExpenseCategoryListResponse"] {
  return {
    expense_categories: [
      {
        id: 10,
        category_name: "家賃",
        category_code: "rent",
        group_id: 3,
        group_name: "固定費",
        description: null,
      },
      {
        id: 20,
        category_name: "スーパー",
        category_code: "food_super",
        group_id: 1,
        group_name: "食費",
        description: null,
      },
    ],
  };
}

// --- tests ---

describe("WebRecurring — category filter (fixed-cost only)", () => {
  it("shows only fixed-cost categories in the recurring picker", async () => {
    server.use(
      http.get(`${API_BASE}/recurring-expenses`, () => HttpResponse.json(makeRecurringList([]))),
      http.get(`${API_BASE}/recurring-expenses/pending`, () =>
        HttpResponse.json(makePendingList())
      ),
      http.get(`${API_BASE}/expense-categories`, () => HttpResponse.json(makeMixedCategories())),
      http.get(`${API_BASE}/category-groups`, () => HttpResponse.json(makeFixedOnlyGroups()))
    );

    renderWithDialogs(<WebRecurring onBack={() => {}} />);
    await waitForReady();

    // Open the create form to reveal the category select
    const add_buttons = screen.getAllByRole("button", { name: /定期支出を追加/ });
    fireEvent.click(add_buttons[0]);

    // Fixed-cost category should be present
    expect(screen.getByRole("option", { name: "家賃" })).toBeInTheDocument();

    // Variable category must NOT be present
    expect(screen.queryByRole("option", { name: "スーパー" })).not.toBeInTheDocument();
  });
});

describe("WebRecurring — create form", () => {
  it("opens the create form when ＋ 定期支出を追加 (header button) is clicked", async () => {
    useDefaultHandlers();

    renderWithDialogs(<WebRecurring onBack={() => {}} />);
    await waitForReady();

    // Use the header button (role=button, name contains 定期支出を追加)
    const add_buttons = screen.getAllByRole("button", { name: /定期支出を追加/ });
    fireEvent.click(add_buttons[0]);

    expect(screen.getByText("定期支出を追加")).toBeInTheDocument();
    // Name input placeholder
    expect(screen.getByPlaceholderText("家賃")).toBeInTheDocument();
  });

  it("opens the create form when the bottom dashed button is clicked", async () => {
    useDefaultHandlers();

    renderWithDialogs(<WebRecurring onBack={() => {}} />);
    await waitForReady();

    const add_buttons = screen.getAllByRole("button", { name: /定期支出を追加/ });
    // Bottom dashed button is the last one
    fireEvent.click(add_buttons[add_buttons.length - 1]);

    expect(screen.getByText("定期支出を追加")).toBeInTheDocument();
  });

  it("calls POST /recurring-expenses and refreshes list on submit", async () => {
    const created_recurring = makeRecurring({ id: 99, name: "サブスク", emoji: "📱" });

    let post_called = false;
    server.use(
      http.get(`${API_BASE}/recurring-expenses`, () => {
        // Return the new item only after POST has been called (simulates refresh)
        if (post_called) {
          return HttpResponse.json(makeRecurringList([created_recurring]));
        }
        return HttpResponse.json(makeRecurringList([]));
      }),
      http.get(`${API_BASE}/recurring-expenses/pending`, () =>
        HttpResponse.json(makePendingList())
      ),
      http.get(`${API_BASE}/expense-categories`, () => HttpResponse.json(makeCategoryList())),
      http.get(`${API_BASE}/category-groups`, () => HttpResponse.json(makeDefaultCategoryGroups())),
      http.post(`${API_BASE}/recurring-expenses`, async () => {
        post_called = true;
        return HttpResponse.json(created_recurring, { status: 201 });
      })
    );

    renderWithDialogs(<WebRecurring onBack={() => {}} />);
    await waitForReady();

    // Open create form
    const add_buttons = screen.getAllByRole("button", { name: /定期支出を追加/ });
    fireEvent.click(add_buttons[0]);

    // Fill required fields
    fireEvent.change(screen.getByPlaceholderText("家賃"), { target: { value: "サブスク" } });
    fireEvent.change(screen.getByPlaceholderText("🏠"), { target: { value: "📱" } });
    fireEvent.change(screen.getByPlaceholderText("25"), { target: { value: "1" } });

    // Select category
    const category_select = screen.getByDisplayValue("選択してください");
    fireEvent.change(category_select, { target: { value: "1" } });

    // Submit
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    // After save, form heading should close and item should appear in the list
    await waitFor(() => {
      const matches = screen.getAllByText("サブスク");
      expect(matches.length).toBeGreaterThan(0);
    });

    // Form heading should no longer be visible
    expect(screen.queryByText("定期支出を追加")).not.toBeInTheDocument();
  });

  it("shows validation error when name is empty", async () => {
    useDefaultHandlers();

    renderWithDialogs(<WebRecurring onBack={() => {}} />);
    await waitForReady();

    const add_buttons = screen.getAllByRole("button", { name: /定期支出を追加/ });
    fireEvent.click(add_buttons[0]);

    // Submit without filling name
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(screen.getByText("名前を入力してください")).toBeInTheDocument();
  });

  it("submits the default emoji when the emoji field is untouched", async () => {
    let posted_body: components["schemas"]["RecurringExpenseRequest"] | null = null;
    server.use(
      http.get(`${API_BASE}/recurring-expenses`, () => HttpResponse.json(makeRecurringList([]))),
      http.get(`${API_BASE}/recurring-expenses/pending`, () =>
        HttpResponse.json(makePendingList())
      ),
      http.get(`${API_BASE}/expense-categories`, () => HttpResponse.json(makeCategoryList())),
      http.get(`${API_BASE}/category-groups`, () => HttpResponse.json(makeDefaultCategoryGroups())),
      http.post(`${API_BASE}/recurring-expenses`, async ({ request }) => {
        posted_body = (await request.json()) as components["schemas"]["RecurringExpenseRequest"];
        return HttpResponse.json(makeRecurring(), { status: 201 });
      })
    );

    renderWithDialogs(<WebRecurring onBack={() => {}} />);
    await waitForReady();

    const add_buttons = screen.getAllByRole("button", { name: /定期支出を追加/ });
    fireEvent.click(add_buttons[0]);

    // Fill only the non-emoji required fields, then submit.
    fireEvent.change(screen.getByPlaceholderText("家賃"), { target: { value: "家賃" } });
    fireEvent.change(screen.getByPlaceholderText("25"), { target: { value: "1" } });
    fireEvent.change(screen.getByDisplayValue("選択してください"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(posted_body).not.toBeNull());
    expect(posted_body).toMatchObject({ emoji: "🏠" });
  });

  it("lets the user pick a different emoji from the list", async () => {
    let posted_body: components["schemas"]["RecurringExpenseRequest"] | null = null;
    server.use(
      http.get(`${API_BASE}/recurring-expenses`, () => HttpResponse.json(makeRecurringList([]))),
      http.get(`${API_BASE}/recurring-expenses/pending`, () =>
        HttpResponse.json(makePendingList())
      ),
      http.get(`${API_BASE}/expense-categories`, () => HttpResponse.json(makeCategoryList())),
      http.get(`${API_BASE}/category-groups`, () => HttpResponse.json(makeDefaultCategoryGroups())),
      http.post(`${API_BASE}/recurring-expenses`, async ({ request }) => {
        posted_body = (await request.json()) as components["schemas"]["RecurringExpenseRequest"];
        return HttpResponse.json(makeRecurring(), { status: 201 });
      })
    );

    renderWithDialogs(<WebRecurring onBack={() => {}} />);
    await waitForReady();

    const add_buttons = screen.getAllByRole("button", { name: /定期支出を追加/ });
    fireEvent.click(add_buttons[0]);

    fireEvent.change(screen.getByPlaceholderText("家賃"), { target: { value: "家賃" } });
    fireEvent.change(screen.getByPlaceholderText("25"), { target: { value: "1" } });
    fireEvent.change(screen.getByDisplayValue("選択してください"), { target: { value: "1" } });
    // Choose a non-default emoji from the picker.
    fireEvent.click(screen.getByRole("button", { name: "📱" }));
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(posted_body).not.toBeNull());
    expect(posted_body).toMatchObject({ emoji: "📱" });
  });

  it("shows validation error when billing_day is out of range", async () => {
    useDefaultHandlers();

    renderWithDialogs(<WebRecurring onBack={() => {}} />);
    await waitForReady();

    const add_buttons = screen.getAllByRole("button", { name: /定期支出を追加/ });
    fireEvent.click(add_buttons[0]);

    fireEvent.change(screen.getByPlaceholderText("家賃"), { target: { value: "家賃" } });
    fireEvent.change(screen.getByPlaceholderText("🏠"), { target: { value: "🏠" } });
    fireEvent.change(screen.getByPlaceholderText("25"), { target: { value: "99" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(screen.getByText("引落日を1〜31で入力してください")).toBeInTheDocument();
  });

  it("closes the form when キャンセル is clicked", async () => {
    useDefaultHandlers();

    renderWithDialogs(<WebRecurring onBack={() => {}} />);
    await waitForReady();

    const add_buttons = screen.getAllByRole("button", { name: /定期支出を追加/ });
    fireEvent.click(add_buttons[0]);
    expect(screen.getByText("定期支出を追加")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));
    expect(screen.queryByText("定期支出を追加")).not.toBeInTheDocument();
  });
});

describe("WebRecurring — pending layout", () => {
  it("lays the 確認待ち cards out in a 2-column grid (not a single squeezed row)", async () => {
    server.use(
      http.get(`${API_BASE}/recurring-expenses`, () => HttpResponse.json(makeRecurringList([]))),
      http.get(`${API_BASE}/recurring-expenses/pending`, () =>
        HttpResponse.json(
          makePendingList([
            makePending({ id: 1, name: "電気代" }),
            makePending({ id: 2, name: "ガス代" }),
            makePending({ id: 3, name: "水道代" }),
            makePending({ id: 4, name: "通信費" }),
          ])
        )
      ),
      http.get(`${API_BASE}/expense-categories`, () => HttpResponse.json(makeCategoryList())),
      http.get(`${API_BASE}/category-groups`, () => HttpResponse.json(makeDefaultCategoryGroups()))
    );

    render(<WebRecurring onBack={() => {}} />);
    await waitForReady();

    const pending_container = await screen.findByTestId("pending-cards");
    expect(pending_container).toHaveStyle({ display: "grid" });
    expect(pending_container).toHaveStyle({ gridTemplateColumns: "1fr 1fr" });
  });
});

describe("WebRecurring — edit form", () => {
  it("opens the edit form pre-filled when ✎ is clicked", async () => {
    const existing_recurring = makeRecurring();

    server.use(
      http.get(`${API_BASE}/recurring-expenses`, () =>
        HttpResponse.json(makeRecurringList([existing_recurring]))
      ),
      http.get(`${API_BASE}/recurring-expenses/pending`, () =>
        HttpResponse.json(makePendingList())
      ),
      http.get(`${API_BASE}/expense-categories`, () => HttpResponse.json(makeCategoryList())),
      http.get(`${API_BASE}/category-groups`, () => HttpResponse.json(makeDefaultCategoryGroups()))
    );

    renderWithDialogs(<WebRecurring onBack={() => {}} />);

    // Wait for item card to render
    await waitFor(() => {
      expect(screen.getByText("家賃")).toBeInTheDocument();
    });

    // Click the edit icon (✎)
    fireEvent.click(screen.getByText("✎"));

    expect(screen.getByText("定期支出を編集")).toBeInTheDocument();

    // Name input should be pre-filled with existing value
    expect(screen.getByDisplayValue("家賃")).toBeInTheDocument();
    // billing_day should be pre-filled
    expect(screen.getByDisplayValue("25")).toBeInTheDocument();
  });

  it("calls PUT /recurring-expenses/:id and refreshes list on submit", async () => {
    const existing_recurring = makeRecurring();
    const updated_recurring = makeRecurring({ name: "更新済み家賃", amount: 90000 });

    let put_called = false;
    server.use(
      http.get(`${API_BASE}/recurring-expenses`, () => {
        if (put_called) return HttpResponse.json(makeRecurringList([updated_recurring]));
        return HttpResponse.json(makeRecurringList([existing_recurring]));
      }),
      http.get(`${API_BASE}/recurring-expenses/pending`, () =>
        HttpResponse.json(makePendingList())
      ),
      http.get(`${API_BASE}/expense-categories`, () => HttpResponse.json(makeCategoryList())),
      http.get(`${API_BASE}/category-groups`, () => HttpResponse.json(makeDefaultCategoryGroups())),
      http.put(`${API_BASE}/recurring-expenses/1`, async () => {
        put_called = true;
        return HttpResponse.json(updated_recurring);
      })
    );

    renderWithDialogs(<WebRecurring onBack={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText("家賃")).toBeInTheDocument();
    });

    // Open edit form
    fireEvent.click(screen.getByText("✎"));

    await waitFor(() => {
      expect(screen.getByText("定期支出を編集")).toBeInTheDocument();
    });

    // Change name via the pre-filled input
    const name_input = screen.getByDisplayValue("家賃");
    fireEvent.change(name_input, { target: { value: "更新済み家賃" } });

    // Submit
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    // After save, updated item name should appear and form should close
    await waitFor(() => {
      expect(screen.getAllByText("更新済み家賃").length).toBeGreaterThan(0);
    });

    expect(screen.queryByText("定期支出を編集")).not.toBeInTheDocument();
  });
});
