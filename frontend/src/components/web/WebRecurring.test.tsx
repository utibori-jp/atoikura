import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "../../test/server";
import { WebRecurring } from "./WebRecurring";
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

// Override recurring + pending + expense-categories for each test suite
function useDefaultHandlers(
  recurringList: components["schemas"]["RecurringExpenseListResponse"] = makeRecurringList([])
) {
  server.use(
    http.get(`${API_BASE}/recurring-expenses`, () => HttpResponse.json(recurringList)),
    http.get(`${API_BASE}/recurring-expenses/pending`, () => HttpResponse.json(makePendingList())),
    http.get(`${API_BASE}/expense-categories`, () => HttpResponse.json(makeCategoryList()))
  );
}

// --- tests ---

describe("WebRecurring — create form", () => {
  it("opens the create form when ＋ 定期支出を追加 (header button) is clicked", async () => {
    useDefaultHandlers();

    render(<WebRecurring onBack={() => {}} />);
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

    render(<WebRecurring onBack={() => {}} />);
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
      http.post(`${API_BASE}/recurring-expenses`, async () => {
        post_called = true;
        return HttpResponse.json(created_recurring, { status: 201 });
      })
    );

    render(<WebRecurring onBack={() => {}} />);
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

    render(<WebRecurring onBack={() => {}} />);
    await waitForReady();

    const add_buttons = screen.getAllByRole("button", { name: /定期支出を追加/ });
    fireEvent.click(add_buttons[0]);

    // Submit without filling name
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(screen.getByText("名前を入力してください")).toBeInTheDocument();
  });

  it("shows validation error when emoji is empty", async () => {
    useDefaultHandlers();

    render(<WebRecurring onBack={() => {}} />);
    await waitForReady();

    const add_buttons = screen.getAllByRole("button", { name: /定期支出を追加/ });
    fireEvent.click(add_buttons[0]);

    fireEvent.change(screen.getByPlaceholderText("家賃"), { target: { value: "家賃" } });
    // Leave emoji empty and submit
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(screen.getByText("絵文字を入力してください")).toBeInTheDocument();
  });

  it("shows validation error when billing_day is out of range", async () => {
    useDefaultHandlers();

    render(<WebRecurring onBack={() => {}} />);
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

    render(<WebRecurring onBack={() => {}} />);
    await waitForReady();

    const add_buttons = screen.getAllByRole("button", { name: /定期支出を追加/ });
    fireEvent.click(add_buttons[0]);
    expect(screen.getByText("定期支出を追加")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));
    expect(screen.queryByText("定期支出を追加")).not.toBeInTheDocument();
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
      http.get(`${API_BASE}/expense-categories`, () => HttpResponse.json(makeCategoryList()))
    );

    render(<WebRecurring onBack={() => {}} />);

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
      http.put(`${API_BASE}/recurring-expenses/1`, async () => {
        put_called = true;
        return HttpResponse.json(updated_recurring);
      })
    );

    render(<WebRecurring onBack={() => {}} />);

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
