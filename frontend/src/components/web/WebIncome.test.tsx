import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "../../test/server";
import { WebIncome } from "./WebIncome";
import type { components } from "../../api/types";

const API_BASE = "http://localhost:8080";

// --- fixture helpers ---

function makeIncomeRecord(
  overrides: Partial<components["schemas"]["IncomeRecord"]> = {}
): components["schemas"]["IncomeRecord"] {
  return {
    id: 1,
    name: "6月給与",
    emoji: "🏢",
    amount: 280000,
    transaction_date: "2026-06-25",
    income_type: "salary",
    note: "",
    ...overrides,
  };
}

function makeIncomeList(
  items: components["schemas"]["IncomeRecord"][]
): components["schemas"]["IncomeRecordListResponse"] {
  return { income_records: items };
}

const defaultBaseIncome: components["schemas"]["BaseIncomeSetting"] = {
  amount: 280000,
};

// Override income-records + base-income for each test
function useDefaultHandlers(
  incomeList: components["schemas"]["IncomeRecordListResponse"] = makeIncomeList([])
) {
  server.use(
    http.get(`${API_BASE}/income-records`, () => HttpResponse.json(incomeList)),
    http.get(`${API_BASE}/base-income`, () => HttpResponse.json(defaultBaseIncome))
  );
}

// Helper: wait until the page subtitle is present (always rendered, unique text).
async function waitForReady() {
  await waitFor(() => {
    expect(screen.getByText("基準と余剰を分けて管理します")).toBeInTheDocument();
  });
}

// --- tests ---

describe("WebIncome — create form", () => {
  it("opens the create form when ＋ 収入を記録 is clicked", async () => {
    useDefaultHandlers();

    render(<WebIncome onBack={() => {}} />);
    await waitForReady();

    fireEvent.click(screen.getByRole("button", { name: /収入を記録/ }));

    // Form title "収入を記録" appears inside the inline form
    expect(screen.getByText("収入を記録")).toBeInTheDocument();
    // Name input placeholder
    expect(screen.getByPlaceholderText("6月給与")).toBeInTheDocument();
  });

  it("calls POST /income-records and refreshes list on submit", async () => {
    const created_record = makeIncomeRecord({
      id: 99,
      name: "副業収入",
      emoji: "💻",
      amount: 50000,
    });

    let post_called = false;
    server.use(
      http.get(`${API_BASE}/income-records`, () => {
        // Return the new record only after POST has been called (simulates refresh)
        if (post_called) {
          return HttpResponse.json(makeIncomeList([created_record]));
        }
        return HttpResponse.json(makeIncomeList([]));
      }),
      http.get(`${API_BASE}/base-income`, () => HttpResponse.json(defaultBaseIncome)),
      http.post(`${API_BASE}/income-records`, async () => {
        post_called = true;
        return HttpResponse.json(created_record, { status: 201 });
      })
    );

    render(<WebIncome onBack={() => {}} />);
    await waitForReady();

    // Open create form
    fireEvent.click(screen.getByRole("button", { name: /収入を記録/ }));

    // Fill required fields
    fireEvent.change(screen.getByPlaceholderText("6月給与"), { target: { value: "副業収入" } });
    fireEvent.change(screen.getByPlaceholderText("🏢"), { target: { value: "💻" } });
    fireEvent.change(screen.getByPlaceholderText("280000"), { target: { value: "50000" } });

    // Submit
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    // After save, form heading should close and income record should appear
    await waitFor(() => {
      const matches = screen.getAllByText("副業収入");
      expect(matches.length).toBeGreaterThan(0);
    });

    // Form heading should no longer be visible
    expect(screen.queryByText("収入を記録")).not.toBeInTheDocument();
  });

  it("shows validation error when name is empty", async () => {
    useDefaultHandlers();

    render(<WebIncome onBack={() => {}} />);
    await waitForReady();

    fireEvent.click(screen.getByRole("button", { name: /収入を記録/ }));

    // Submit without filling name
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(screen.getByText("名前を入力してください")).toBeInTheDocument();
  });

  it("shows validation error when emoji is empty", async () => {
    useDefaultHandlers();

    render(<WebIncome onBack={() => {}} />);
    await waitForReady();

    fireEvent.click(screen.getByRole("button", { name: /収入を記録/ }));

    fireEvent.change(screen.getByPlaceholderText("6月給与"), { target: { value: "給与" } });
    // Leave emoji empty and submit
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(screen.getByText("絵文字を入力してください")).toBeInTheDocument();
  });

  it("shows validation error when amount is zero or invalid", async () => {
    useDefaultHandlers();

    render(<WebIncome onBack={() => {}} />);
    await waitForReady();

    fireEvent.click(screen.getByRole("button", { name: /収入を記録/ }));

    fireEvent.change(screen.getByPlaceholderText("6月給与"), { target: { value: "給与" } });
    fireEvent.change(screen.getByPlaceholderText("🏢"), { target: { value: "🏢" } });
    fireEvent.change(screen.getByPlaceholderText("280000"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(screen.getByText("金額を正しく入力してください")).toBeInTheDocument();
  });

  it("closes the form when キャンセル is clicked", async () => {
    useDefaultHandlers();

    render(<WebIncome onBack={() => {}} />);
    await waitForReady();

    fireEvent.click(screen.getByRole("button", { name: /収入を記録/ }));
    expect(screen.getByText("収入を記録")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));
    expect(screen.queryByText("収入を記録")).not.toBeInTheDocument();
  });
});

describe("WebIncome — edit form", () => {
  it("opens the edit form pre-filled when ✎ is clicked", async () => {
    const existing_record = makeIncomeRecord();

    server.use(
      http.get(`${API_BASE}/income-records`, () =>
        HttpResponse.json(makeIncomeList([existing_record]))
      ),
      http.get(`${API_BASE}/base-income`, () => HttpResponse.json(defaultBaseIncome))
    );

    render(<WebIncome onBack={() => {}} />);

    // Wait for record to render
    await waitFor(() => {
      expect(screen.getByText("6月給与")).toBeInTheDocument();
    });

    // Click the edit icon (✎) for the income record
    fireEvent.click(screen.getByText("✎"));

    expect(screen.getByText("収入記録を編集")).toBeInTheDocument();

    // Name input should be pre-filled with existing value
    expect(screen.getByDisplayValue("6月給与")).toBeInTheDocument();
    // Amount should be pre-filled
    expect(screen.getByDisplayValue("280000")).toBeInTheDocument();
  });

  it("calls PUT /income-records/:id and refreshes list on submit", async () => {
    const existing_record = makeIncomeRecord();
    const updated_record = makeIncomeRecord({ name: "7月給与", amount: 300000 });

    let put_called = false;
    server.use(
      http.get(`${API_BASE}/income-records`, () => {
        if (put_called) return HttpResponse.json(makeIncomeList([updated_record]));
        return HttpResponse.json(makeIncomeList([existing_record]));
      }),
      http.get(`${API_BASE}/base-income`, () => HttpResponse.json(defaultBaseIncome)),
      http.put(`${API_BASE}/income-records/1`, async () => {
        put_called = true;
        return HttpResponse.json(updated_record);
      })
    );

    render(<WebIncome onBack={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText("6月給与")).toBeInTheDocument();
    });

    // Open edit form
    fireEvent.click(screen.getByText("✎"));

    await waitFor(() => {
      expect(screen.getByText("収入記録を編集")).toBeInTheDocument();
    });

    // Change name via the pre-filled input
    const name_input = screen.getByDisplayValue("6月給与");
    fireEvent.change(name_input, { target: { value: "7月給与" } });

    // Submit
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    // After save, updated record name should appear and form should close
    await waitFor(() => {
      expect(screen.getAllByText("7月給与").length).toBeGreaterThan(0);
    });

    expect(screen.queryByText("収入記録を編集")).not.toBeInTheDocument();
  });
});

// ── WebIncome — surplus allocation ───────────────────────────────────────────

const sample_savings_goal: components["schemas"]["SavingsGoal"] = {
  id: 10,
  name: "旅行積立",
  emoji: "✈️",
  monthly_amount: 20000,
  target_amount: 250000,
  accumulated_amount: 170000,
  deadline: null,
  memo: "",
  is_posted_this_month: false,
};

describe("WebIncome — surplus allocation", () => {
  function setup_allocation_handlers(
    income_amount: number,
    base_amount: number,
    allocations: components["schemas"]["SurplusAllocation"][] = []
  ) {
    server.use(
      http.get(`${API_BASE}/income-records`, () =>
        HttpResponse.json(makeIncomeList([makeIncomeRecord({ amount: income_amount })]))
      ),
      http.get(`${API_BASE}/base-income`, () => HttpResponse.json({ amount: base_amount })),
      http.get(`${API_BASE}/savings-goals`, () =>
        HttpResponse.json({ savings_goals: [sample_savings_goal] })
      ),
      http.get(`${API_BASE}/surplus-allocations`, () =>
        HttpResponse.json({ surplus_allocations: allocations })
      )
    );
  }

  it("shows 未振分 badge when there is unallocated surplus", async () => {
    setup_allocation_handlers(330000, 280000, []);

    render(<WebIncome onBack={() => {}} />);
    await waitForReady();

    expect(screen.getByText("未振分")).toBeInTheDocument();
  });

  it("hides 未振分 badge when surplus is fully allocated", async () => {
    setup_allocation_handlers(330000, 280000, [
      {
        id: 1,
        year_month: "2026-06",
        amount: 50000,
        destination: "budget",
        savings_goal_id: null,
        created_at: "2026-06-13T10:00:00+09:00",
      },
    ]);

    render(<WebIncome onBack={() => {}} />);
    await waitForReady();

    expect(screen.queryByText("未振分")).not.toBeInTheDocument();
  });

  it("opens allocation form when 振り分ける → is clicked", async () => {
    setup_allocation_handlers(330000, 280000, []);

    render(<WebIncome onBack={() => {}} />);
    await waitForReady();

    fireEvent.click(screen.getByRole("button", { name: "振り分ける →" }));

    expect(screen.getByText("余剰を振り分ける")).toBeInTheDocument();
  });

  it("POSTs with destination:budget when budget is selected", async () => {
    let posted_body: unknown = null;
    let alloc_fetched_after = false;
    server.use(
      http.get(`${API_BASE}/income-records`, () =>
        HttpResponse.json(makeIncomeList([makeIncomeRecord({ amount: 330000 })]))
      ),
      http.get(`${API_BASE}/base-income`, () => HttpResponse.json({ amount: 280000 })),
      http.get(`${API_BASE}/savings-goals`, () =>
        HttpResponse.json({ savings_goals: [sample_savings_goal] })
      ),
      http.get(`${API_BASE}/surplus-allocations`, () => {
        if (alloc_fetched_after) {
          return HttpResponse.json({
            surplus_allocations: [
              {
                id: 1,
                year_month: "2026-06",
                amount: 10000,
                destination: "budget",
                savings_goal_id: null,
                created_at: "2026-06-13T10:00:00+09:00",
              },
            ],
          });
        }
        return HttpResponse.json({ surplus_allocations: [] });
      }),
      http.post(`${API_BASE}/surplus-allocations`, async ({ request }) => {
        posted_body = await request.json();
        alloc_fetched_after = true;
        return HttpResponse.json(
          {
            id: 1,
            year_month: "2026-06",
            amount: 10000,
            destination: "budget",
            savings_goal_id: null,
            created_at: "2026-06-13T10:00:00+09:00",
          },
          { status: 201 }
        );
      })
    );

    render(<WebIncome onBack={() => {}} />);
    await waitForReady();

    fireEvent.click(screen.getByRole("button", { name: "振り分ける →" }));
    expect(screen.getByText("余剰を振り分ける")).toBeInTheDocument();

    // Enter amount
    fireEvent.change(screen.getByPlaceholderText("50000"), { target: { value: "10000" } });

    // Select budget destination
    fireEvent.click(screen.getByRole("button", { name: "今月の予算に追加" }));

    // Submit
    fireEvent.click(screen.getByRole("button", { name: "振り分ける" }));

    await waitFor(() => expect(posted_body).not.toBeNull());
    expect(posted_body).toMatchObject({
      year_month: expect.stringMatching(/^\d{4}-\d{2}$/),
      amount: 10000,
      destination: "budget",
    });

    // Form closes after allocation
    await waitFor(() => expect(screen.queryByText("余剰を振り分ける")).not.toBeInTheDocument());
  });

  it("POSTs with savings_goal_id when savings destination is selected", async () => {
    let posted_body: unknown = null;
    server.use(
      http.get(`${API_BASE}/income-records`, () =>
        HttpResponse.json(makeIncomeList([makeIncomeRecord({ amount: 330000 })]))
      ),
      http.get(`${API_BASE}/base-income`, () => HttpResponse.json({ amount: 280000 })),
      http.get(`${API_BASE}/savings-goals`, () =>
        HttpResponse.json({ savings_goals: [sample_savings_goal] })
      ),
      http.get(`${API_BASE}/surplus-allocations`, () =>
        HttpResponse.json({ surplus_allocations: [] })
      ),
      http.post(`${API_BASE}/surplus-allocations`, async ({ request }) => {
        posted_body = await request.json();
        return HttpResponse.json(
          {
            id: 2,
            year_month: "2026-06",
            amount: 20000,
            destination: "savings",
            savings_goal_id: 10,
            created_at: "2026-06-13T10:00:00+09:00",
          },
          { status: 201 }
        );
      })
    );

    render(<WebIncome onBack={() => {}} />);
    await waitForReady();

    fireEvent.click(screen.getByRole("button", { name: "振り分ける →" }));

    // Set amount
    fireEvent.change(screen.getByPlaceholderText("50000"), { target: { value: "20000" } });

    // savings is default — select the goal from the dropdown
    const goal_select = screen.getByRole("combobox");
    fireEvent.change(goal_select, { target: { value: "10" } });

    // Submit
    fireEvent.click(screen.getByRole("button", { name: "振り分ける" }));

    await waitFor(() => expect(posted_body).not.toBeNull());
    expect(posted_body).toMatchObject({
      year_month: expect.stringMatching(/^\d{4}-\d{2}$/),
      amount: 20000,
      destination: "savings",
      savings_goal_id: 10,
    });
  });
});
