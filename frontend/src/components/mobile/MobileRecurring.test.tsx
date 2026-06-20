import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "../../test/server";
import { MobileRecurring } from "./MobileRecurring";
import type { components } from "../../api/types";

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

function makePendingItem(
  overrides: Partial<components["schemas"]["PendingRecurring"]> = {}
): components["schemas"]["PendingRecurring"] {
  return {
    id: 10,
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
        category_name: "家賃",
        category_code: "rent",
        group_id: 1,
        group_name: "固定費",
        description: null,
      },
    ],
  };
}

// Category groups where group id=1 is treated as fixed-cost, so that makeCategoryList()
// categories (group_id=1) pass the fixed-cost filter in MobileRecurring.
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

// Override recurring + pending + expense-categories for a test suite
function useDefaultHandlers(
  recurringList: components["schemas"]["RecurringExpenseListResponse"] = makeRecurringList([]),
  pendingList: components["schemas"]["PendingRecurringListResponse"] = makePendingList()
) {
  server.use(
    http.get(`${API_BASE}/recurring-expenses`, () => HttpResponse.json(recurringList)),
    http.get(`${API_BASE}/recurring-expenses/pending`, () => HttpResponse.json(pendingList)),
    http.get(`${API_BASE}/expense-categories`, () => HttpResponse.json(makeCategoryList())),
    http.get(`${API_BASE}/category-groups`, () => HttpResponse.json(makeDefaultCategoryGroups()))
  );
}

// Wait until the subtitle is rendered (after loading completes)
async function waitForReady() {
  await waitFor(() => {
    expect(screen.getByText("毎月の固定・半固定費を管理")).toBeInTheDocument();
  });
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

describe("MobileRecurring — category filter (fixed-cost only)", () => {
  it("shows only fixed-cost categories in the recurring picker", async () => {
    server.use(
      http.get(`${API_BASE}/recurring-expenses`, () => HttpResponse.json(makeRecurringList([]))),
      http.get(`${API_BASE}/recurring-expenses/pending`, () =>
        HttpResponse.json(makePendingList())
      ),
      http.get(`${API_BASE}/expense-categories`, () => HttpResponse.json(makeMixedCategories())),
      http.get(`${API_BASE}/category-groups`, () => HttpResponse.json(makeFixedOnlyGroups()))
    );

    render(<MobileRecurring onBack={() => {}} />);
    await waitForReady();

    // Open the bottom sheet to reveal the category select
    fireEvent.click(screen.getByRole("button", { name: /定期支出を追加/ }));

    // Fixed-cost category should be present
    expect(screen.getByRole("option", { name: "家賃" })).toBeInTheDocument();

    // Variable category must NOT be present
    expect(screen.queryByRole("option", { name: "スーパー" })).not.toBeInTheDocument();
  });
});

describe("MobileRecurring — create form", () => {
  it("opens the bottom-sheet when ＋ 定期支出を追加 is clicked", async () => {
    useDefaultHandlers();

    render(<MobileRecurring onBack={() => {}} />);
    await waitForReady();

    fireEvent.click(screen.getByRole("button", { name: /定期支出を追加/ }));

    expect(screen.getByText("定期支出を追加")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("家賃")).toBeInTheDocument();
  });

  it("calls POST /recurring-expenses and refreshes list on submit", async () => {
    const created_recurring = makeRecurring({ id: 99, name: "サブスク", emoji: "📱" });
    let post_called = false;

    server.use(
      http.get(`${API_BASE}/recurring-expenses`, () => {
        if (post_called) return HttpResponse.json(makeRecurringList([created_recurring]));
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

    render(<MobileRecurring onBack={() => {}} />);
    await waitForReady();

    // Open create sheet
    fireEvent.click(screen.getByRole("button", { name: /定期支出を追加/ }));

    // Fill required fields
    fireEvent.change(screen.getByPlaceholderText("家賃"), { target: { value: "サブスク" } });
    fireEvent.change(screen.getByPlaceholderText("🏠"), { target: { value: "📱" } });
    fireEvent.change(screen.getByPlaceholderText("25"), { target: { value: "1" } });

    // Select category
    const category_select = screen.getByDisplayValue("選択してください");
    fireEvent.change(category_select, { target: { value: "1" } });

    // Submit
    fireEvent.click(screen.getByRole("button", { name: "保存する" }));

    // After save, the new item should appear and the sheet should close
    await waitFor(() => {
      expect(screen.getAllByText("サブスク").length).toBeGreaterThan(0);
    });

    // Sheet heading should no longer be visible
    expect(screen.queryByText("定期支出を追加")).not.toBeInTheDocument();
  });

  it("shows validation error when name is empty", async () => {
    useDefaultHandlers();

    render(<MobileRecurring onBack={() => {}} />);
    await waitForReady();

    fireEvent.click(screen.getByRole("button", { name: /定期支出を追加/ }));

    // Submit without filling any field
    fireEvent.click(screen.getByRole("button", { name: "保存する" }));

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

    render(<MobileRecurring onBack={() => {}} />);
    await waitForReady();

    fireEvent.click(screen.getByRole("button", { name: /定期支出を追加/ }));

    // Fill only the non-emoji required fields, then submit.
    fireEvent.change(screen.getByPlaceholderText("家賃"), { target: { value: "家賃" } });
    fireEvent.change(screen.getByPlaceholderText("25"), { target: { value: "1" } });
    fireEvent.change(screen.getByDisplayValue("選択してください"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "保存する" }));

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

    render(<MobileRecurring onBack={() => {}} />);
    await waitForReady();

    fireEvent.click(screen.getByRole("button", { name: /定期支出を追加/ }));

    fireEvent.change(screen.getByPlaceholderText("家賃"), { target: { value: "家賃" } });
    fireEvent.change(screen.getByPlaceholderText("25"), { target: { value: "1" } });
    fireEvent.change(screen.getByDisplayValue("選択してください"), { target: { value: "1" } });
    // Choose a non-default emoji from the picker.
    fireEvent.click(screen.getByRole("button", { name: "📱" }));
    fireEvent.click(screen.getByRole("button", { name: "保存する" }));

    await waitFor(() => expect(posted_body).not.toBeNull());
    expect(posted_body).toMatchObject({ emoji: "📱" });
  });

  it("shows validation error when billing_day is out of range", async () => {
    useDefaultHandlers();

    render(<MobileRecurring onBack={() => {}} />);
    await waitForReady();

    fireEvent.click(screen.getByRole("button", { name: /定期支出を追加/ }));
    fireEvent.change(screen.getByPlaceholderText("家賃"), { target: { value: "家賃" } });
    fireEvent.change(screen.getByPlaceholderText("🏠"), { target: { value: "🏠" } });
    fireEvent.change(screen.getByPlaceholderText("25"), { target: { value: "99" } });

    fireEvent.click(screen.getByRole("button", { name: "保存する" }));

    expect(screen.getByText("引落日を1〜31で入力してください")).toBeInTheDocument();
  });

  it("closes the sheet when ✕ is clicked", async () => {
    useDefaultHandlers();

    render(<MobileRecurring onBack={() => {}} />);
    await waitForReady();

    fireEvent.click(screen.getByRole("button", { name: /定期支出を追加/ }));
    expect(screen.getByText("定期支出を追加")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "✕" }));
    expect(screen.queryByText("定期支出を追加")).not.toBeInTheDocument();
  });
});

describe("MobileRecurring — edit form", () => {
  it("opens the edit sheet pre-filled when ✎ is clicked", async () => {
    const existing_recurring = makeRecurring();

    useDefaultHandlers(makeRecurringList([existing_recurring]));

    render(<MobileRecurring onBack={() => {}} />);

    // Wait for the item to render
    await waitFor(() => {
      expect(screen.getByText("家賃")).toBeInTheDocument();
    });

    // Click edit icon
    fireEvent.click(screen.getByRole("button", { name: "編集" }));

    expect(screen.getByText("定期支出を編集")).toBeInTheDocument();

    // Name input should be pre-filled (placeholder="家賃", type=text with value 家賃)
    const name_input = screen.getByPlaceholderText("家賃");
    expect((name_input as HTMLInputElement).value).toBe("家賃");
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

    render(<MobileRecurring onBack={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText("家賃")).toBeInTheDocument();
    });

    // Open edit sheet
    fireEvent.click(screen.getByRole("button", { name: "編集" }));

    await waitFor(() => {
      expect(screen.getByText("定期支出を編集")).toBeInTheDocument();
    });

    // Change name (use the text input placeholder to uniquely target the name field)
    const name_input = screen.getByPlaceholderText("家賃");
    fireEvent.change(name_input, { target: { value: "更新済み家賃" } });

    // Submit
    fireEvent.click(screen.getByRole("button", { name: "保存する" }));

    // After save, updated item should appear and sheet should close
    await waitFor(() => {
      expect(screen.getAllByText("更新済み家賃").length).toBeGreaterThan(0);
    });

    expect(screen.queryByText("定期支出を編集")).not.toBeInTheDocument();
  });
});

describe("MobileRecurring — delete", () => {
  it("calls DELETE /recurring-expenses/:id and removes item from list after confirm", async () => {
    const existing_recurring = makeRecurring();
    let delete_called = false;

    server.use(
      http.get(`${API_BASE}/recurring-expenses`, () =>
        HttpResponse.json(makeRecurringList([existing_recurring]))
      ),
      http.get(`${API_BASE}/recurring-expenses/pending`, () =>
        HttpResponse.json(makePendingList())
      ),
      http.get(`${API_BASE}/expense-categories`, () => HttpResponse.json(makeCategoryList())),
      http.get(`${API_BASE}/category-groups`, () => HttpResponse.json(makeDefaultCategoryGroups())),
      http.delete(`${API_BASE}/recurring-expenses/1`, () => {
        delete_called = true;
        return new HttpResponse(null, { status: 204 });
      })
    );

    // Mock window.confirm to return true
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<MobileRecurring onBack={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText("家賃")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "削除" }));

    await waitFor(() => {
      expect(delete_called).toBe(true);
    });

    // Item should be removed from DOM
    expect(screen.queryByText("家賃")).not.toBeInTheDocument();

    vi.restoreAllMocks();
  });

  it("does NOT delete when window.confirm is cancelled", async () => {
    const existing_recurring = makeRecurring();
    let delete_called = false;

    server.use(
      http.get(`${API_BASE}/recurring-expenses`, () =>
        HttpResponse.json(makeRecurringList([existing_recurring]))
      ),
      http.get(`${API_BASE}/recurring-expenses/pending`, () =>
        HttpResponse.json(makePendingList())
      ),
      http.get(`${API_BASE}/expense-categories`, () => HttpResponse.json(makeCategoryList())),
      http.get(`${API_BASE}/category-groups`, () => HttpResponse.json(makeDefaultCategoryGroups())),
      http.delete(`${API_BASE}/recurring-expenses/1`, () => {
        delete_called = true;
        return new HttpResponse(null, { status: 204 });
      })
    );

    vi.spyOn(window, "confirm").mockReturnValue(false);

    render(<MobileRecurring onBack={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText("家賃")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "削除" }));

    // Give time for any async operation
    await new Promise((r) => setTimeout(r, 50));

    expect(delete_called).toBe(false);
    expect(screen.getByText("家賃")).toBeInTheDocument();

    vi.restoreAllMocks();
  });
});

describe("MobileRecurring — confirm pending", () => {
  it("shows pending items with amount input and 金額を確定 button", async () => {
    const pending_item = makePendingItem();

    useDefaultHandlers(makeRecurringList([]), makePendingList([pending_item]));

    render(<MobileRecurring onBack={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText("電気代")).toBeInTheDocument();
    });

    expect(screen.getByText("💬 確認待ち")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "金額を確定" })).toBeInTheDocument();
  });

  it("calls POST /recurring-expenses/:id/confirm and removes item from pending list", async () => {
    const pending_item = makePendingItem();
    let confirm_called = false;
    let confirm_body: Record<string, unknown> | null = null;

    server.use(
      http.get(`${API_BASE}/recurring-expenses`, () => HttpResponse.json(makeRecurringList([]))),
      http.get(`${API_BASE}/recurring-expenses/pending`, () => {
        if (confirm_called) return HttpResponse.json(makePendingList([]));
        return HttpResponse.json(makePendingList([pending_item]));
      }),
      http.get(`${API_BASE}/expense-categories`, () => HttpResponse.json(makeCategoryList())),
      http.get(`${API_BASE}/category-groups`, () => HttpResponse.json(makeDefaultCategoryGroups())),
      http.post(`${API_BASE}/recurring-expenses/10/confirm`, async ({ request }) => {
        confirm_called = true;
        confirm_body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(
          {
            id: 200,
            transaction_date: "2026-06-10",
            item: "電気代",
            amount: 6800,
            category_id: 1,
            category_name: "家賃",
            group_id: 1,
            group_name: "固定費",
            is_excluded: false,
            note: null,
            created_at: "2026-06-10T00:00:00Z",
          },
          { status: 201 }
        );
      })
    );

    render(<MobileRecurring onBack={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText("電気代")).toBeInTheDocument();
    });

    // Enter confirm amount
    const amount_input = screen.getByPlaceholderText("7480");
    fireEvent.change(amount_input, { target: { value: "6800" } });

    // Click confirm button
    fireEvent.click(screen.getByRole("button", { name: "金額を確定" }));

    await waitFor(() => {
      expect(confirm_called).toBe(true);
    });

    // Verify the request body includes amount and year_month
    expect(confirm_body).toMatchObject({ amount: 6800 });
    expect(typeof confirm_body?.year_month).toBe("string");

    // Pending item should be removed after refresh
    await waitFor(() => {
      expect(screen.queryByText("電気代")).not.toBeInTheDocument();
    });
  });

  it("does not call confirm when amount input is empty", async () => {
    const pending_item = makePendingItem();
    let confirm_called = false;

    server.use(
      http.get(`${API_BASE}/recurring-expenses`, () => HttpResponse.json(makeRecurringList([]))),
      http.get(`${API_BASE}/recurring-expenses/pending`, () =>
        HttpResponse.json(makePendingList([pending_item]))
      ),
      http.get(`${API_BASE}/expense-categories`, () => HttpResponse.json(makeCategoryList())),
      http.get(`${API_BASE}/category-groups`, () => HttpResponse.json(makeDefaultCategoryGroups())),
      http.post(`${API_BASE}/recurring-expenses/10/confirm`, () => {
        confirm_called = true;
        return HttpResponse.json({}, { status: 201 });
      })
    );

    render(<MobileRecurring onBack={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText("電気代")).toBeInTheDocument();
    });

    // Click confirm without entering an amount
    fireEvent.click(screen.getByRole("button", { name: "金額を確定" }));

    await new Promise((r) => setTimeout(r, 50));

    expect(confirm_called).toBe(false);
    // Pending item still shown
    expect(screen.getByText("電気代")).toBeInTheDocument();
  });
});
