import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { http, HttpResponse } from "msw";
import { server } from "../../test/server";
import {
  MobileIncome,
  MobileIncomeSheet,
  MobileEditBaseSheet,
  MobileAllocateSheet,
} from "./MobileIncome";
import { DialogProvider } from "../dialogs";
import type { components } from "../../api/types";

// MobileIncome consumes the confirm dialog via context (#166), so its renders
// must be wrapped in a DialogProvider.
function renderIncome(ui: ReactElement) {
  return render(<DialogProvider>{ui}</DialogProvider>);
}

const TOKEN_KEY = "atoikura.jwt_token";

beforeEach(() => {
  sessionStorage.setItem(TOKEN_KEY, "test-token");
});

afterEach(() => {
  sessionStorage.removeItem(TOKEN_KEY);
  vi.restoreAllMocks();
});

// ── Helpers ──────────────────────────────────────────────────────────────────

const sample_income: components["schemas"]["IncomeRecord"] = {
  id: 1,
  transaction_date: "2026-06-10",
  amount: 280000,
  name: "6月給与",
  income_type: "salary",
  emoji: "🏢",
  note: "",
};

const sample_base_income: components["schemas"]["BaseIncomeSetting"] = {
  amount: 280000,
};

function setup_income_list_handler(records: components["schemas"]["IncomeRecord"][]) {
  server.use(
    http.get("http://localhost:8080/income-records", () =>
      HttpResponse.json({ income_records: records })
    )
  );
}

function setup_base_income_handler(base: components["schemas"]["BaseIncomeSetting"]) {
  server.use(http.get("http://localhost:8080/base-income", () => HttpResponse.json(base)));
}

// ── MobileIncome main screen ─────────────────────────────────────────────────

describe("MobileIncome", () => {
  it("renders the loading state initially then shows content", async () => {
    setup_income_list_handler([]);
    setup_base_income_handler(sample_base_income);

    renderIncome(<MobileIncome onBack={vi.fn()} />);

    // Loading text appears first
    expect(screen.getByText("読み込み中…")).toBeInTheDocument();

    // Then content loads
    await waitFor(() => expect(screen.getByText("基準収入")).toBeInTheDocument());
    expect(screen.queryByText("読み込み中…")).not.toBeInTheDocument();
  });

  it("shows income records grouped by date", async () => {
    setup_income_list_handler([sample_income]);
    setup_base_income_handler(sample_base_income);

    renderIncome(<MobileIncome onBack={vi.fn()} />);

    await waitFor(() => expect(screen.getByText("6月給与")).toBeInTheDocument());
    // Income type badge should be visible
    expect(screen.getByText("給与")).toBeInTheDocument();
  });

  it("opens income sheet when ＋ 収入を記録 button is clicked", async () => {
    setup_income_list_handler([]);
    setup_base_income_handler(sample_base_income);

    renderIncome(<MobileIncome onBack={vi.fn()} />);

    await waitFor(() => expect(screen.getByText("＋ 収入を記録")).toBeInTheDocument());

    fireEvent.click(screen.getByText("＋ 収入を記録"));

    await waitFor(() => expect(screen.getByText("収入を記録")).toBeInTheDocument());
  });

  it("opens edit sheet when edit button is clicked on an income row", async () => {
    setup_income_list_handler([sample_income]);
    setup_base_income_handler(sample_base_income);

    renderIncome(<MobileIncome onBack={vi.fn()} />);

    await waitFor(() => expect(screen.getByText("6月給与")).toBeInTheDocument());

    // Click the edit (✎) button on the income row
    const edit_buttons = screen.getAllByRole("button", { name: "✎" });
    fireEvent.click(edit_buttons[0]);

    await waitFor(() => expect(screen.getByText("収入を編集")).toBeInTheDocument());
  });

  it("deletes income record with confirm dialog", async () => {
    setup_income_list_handler([sample_income]);
    setup_base_income_handler(sample_base_income);

    // After delete, return empty list
    let delete_called = false;
    server.use(
      http.delete("http://localhost:8080/income-records/:id", () => {
        delete_called = true;
        return new HttpResponse(null, { status: 204 });
      }),
      http.get("http://localhost:8080/income-records", () => {
        if (delete_called) return HttpResponse.json({ income_records: [] });
        return HttpResponse.json({ income_records: [sample_income] });
      })
    );

    renderIncome(<MobileIncome onBack={vi.fn()} />);

    await waitFor(() => expect(screen.getByText("6月給与")).toBeInTheDocument());

    // The 🗑 trigger opens the in-app confirm Modal (#166); confirm inside it.
    const delete_buttons = screen.getAllByRole("button", { name: "🗑" });
    fireEvent.click(delete_buttons[0]);

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("この収入記録を削除しますか？")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "削除" }));

    await waitFor(() => expect(screen.queryByText("6月給与")).not.toBeInTheDocument());
  });

  it("does not delete when confirm dialog is cancelled", async () => {
    setup_income_list_handler([sample_income]);
    setup_base_income_handler(sample_base_income);

    renderIncome(<MobileIncome onBack={vi.fn()} />);

    await waitFor(() => expect(screen.getByText("6月給与")).toBeInTheDocument());

    const delete_buttons = screen.getAllByRole("button", { name: "🗑" });
    fireEvent.click(delete_buttons[0]);

    // Cancel the confirm Modal.
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "キャンセル" }));

    // Income record should still be visible
    expect(screen.getByText("6月給与")).toBeInTheDocument();
  });

  it("opens edit-base sheet when 編集 is clicked", async () => {
    setup_income_list_handler([]);
    setup_base_income_handler(sample_base_income);

    renderIncome(<MobileIncome onBack={vi.fn()} />);

    await waitFor(() => expect(screen.getByText("基準収入")).toBeInTheDocument());

    // The 編集 button inside the hero card
    const edit_base_buttons = screen
      .getAllByRole("button")
      .filter((btn) => btn.textContent?.includes("編集"));
    fireEvent.click(edit_base_buttons[0]);

    await waitFor(() => expect(screen.getByText("基準収入を編集")).toBeInTheDocument());
  });

  it("calls onBack when back button is clicked", async () => {
    setup_income_list_handler([]);
    setup_base_income_handler(sample_base_income);

    const on_back = vi.fn();
    renderIncome(<MobileIncome onBack={on_back} />);

    fireEvent.click(screen.getByText("‹ 予算"));

    expect(on_back).toHaveBeenCalledOnce();
  });
});

// ── MobileIncomeSheet ────────────────────────────────────────────────────────

describe("MobileIncomeSheet — create mode", () => {
  const blank_form = {
    editing_id: null as null,
    name: "",
    emoji: "🏢",
    amount_yen: "",
    transaction_date: "2026-06-01",
    income_type: "salary" as const,
    note: "",
  };

  it("renders create title", () => {
    render(<MobileIncomeSheet initial_form={blank_form} onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(screen.getByText("収入を記録")).toBeInTheDocument();
  });

  it("shows validation error when name is missing", async () => {
    render(<MobileIncomeSheet initial_form={blank_form} onClose={vi.fn()} onSaved={vi.fn()} />);

    fireEvent.click(screen.getByText("＋ 記録する"));

    await waitFor(() => expect(screen.getByText("収入名を入力してください")).toBeInTheDocument());
  });

  it("shows validation error when amount is invalid", async () => {
    const form_with_name = { ...blank_form, name: "テスト" };
    render(<MobileIncomeSheet initial_form={form_with_name} onClose={vi.fn()} onSaved={vi.fn()} />);

    fireEvent.click(screen.getByText("＋ 記録する"));

    await waitFor(() =>
      expect(screen.getByText("金額を正しく入力してください")).toBeInTheDocument()
    );
  });

  it("calls createIncomeRecord and onSaved on valid submit", async () => {
    const on_saved = vi.fn();
    const on_close = vi.fn();

    server.use(
      http.post("http://localhost:8080/income-records", () =>
        HttpResponse.json(sample_income, { status: 201 })
      )
    );

    const valid_form = {
      ...blank_form,
      name: "テスト収入",
      amount_yen: "100000",
    };

    render(<MobileIncomeSheet initial_form={valid_form} onClose={on_close} onSaved={on_saved} />);

    fireEvent.click(screen.getByText("＋ 記録する"));

    await waitFor(() => expect(on_saved).toHaveBeenCalledOnce());
    expect(on_close).toHaveBeenCalledOnce();
  });

  it("closes when ✕ is clicked", () => {
    const on_close = vi.fn();
    render(<MobileIncomeSheet initial_form={blank_form} onClose={on_close} onSaved={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "✕" }));

    expect(on_close).toHaveBeenCalledOnce();
  });
});

describe("MobileIncomeSheet — edit mode", () => {
  const edit_form = {
    editing_id: 1,
    name: "6月給与",
    emoji: "🏢",
    amount_yen: "280000",
    transaction_date: "2026-06-10",
    income_type: "salary" as const,
    note: "",
  };

  it("renders edit title when editing_id is set", () => {
    render(<MobileIncomeSheet initial_form={edit_form} onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(screen.getByText("収入を編集")).toBeInTheDocument();
  });

  it("shows 更新する button label in edit mode", () => {
    render(<MobileIncomeSheet initial_form={edit_form} onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(screen.getByText("更新する")).toBeInTheDocument();
  });

  it("calls updateIncomeRecord and onSaved on valid submit", async () => {
    const on_saved = vi.fn();
    const on_close = vi.fn();

    server.use(
      http.put("http://localhost:8080/income-records/:id", () => HttpResponse.json(sample_income))
    );

    render(<MobileIncomeSheet initial_form={edit_form} onClose={on_close} onSaved={on_saved} />);

    fireEvent.click(screen.getByText("更新する"));

    await waitFor(() => expect(on_saved).toHaveBeenCalledOnce());
    expect(on_close).toHaveBeenCalledOnce();
  });
});

// ── MobileEditBaseSheet ───────────────────────────────────────────────────────

describe("MobileEditBaseSheet", () => {
  it("renders with current base amount", () => {
    render(<MobileEditBaseSheet base_amount={280000} onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(screen.getByText("基準収入を編集")).toBeInTheDocument();
    // The amount is pre-filled in the input
    const input = screen.getByRole("spinbutton");
    expect((input as HTMLInputElement).value).toBe("280000");
  });

  it("calls updateBaseIncome and onSaved on save", async () => {
    const on_saved = vi.fn();
    const on_close = vi.fn();

    server.use(
      http.put("http://localhost:8080/base-income", () => HttpResponse.json({ amount: 300000 }))
    );

    render(<MobileEditBaseSheet base_amount={280000} onClose={on_close} onSaved={on_saved} />);

    const input = screen.getByRole("spinbutton");
    fireEvent.change(input, { target: { value: "300000" } });

    fireEvent.click(screen.getByText("保存する"));

    await waitFor(() => expect(on_saved).toHaveBeenCalledWith(300000));
    expect(on_close).toHaveBeenCalledOnce();
  });

  it("shows validation error for invalid amount", async () => {
    render(<MobileEditBaseSheet base_amount={280000} onClose={vi.fn()} onSaved={vi.fn()} />);

    const input = screen.getByRole("spinbutton");
    fireEvent.change(input, { target: { value: "0" } });

    fireEvent.click(screen.getByText("保存する"));

    await waitFor(() =>
      expect(screen.getByText("金額を正しく入力してください")).toBeInTheDocument()
    );
  });

  it("updates draft when a preset button is clicked", () => {
    render(<MobileEditBaseSheet base_amount={280000} onClose={vi.fn()} onSaved={vi.fn()} />);

    // Click the 3ヶ月平均 preset (value 291000)
    fireEvent.click(screen.getByText("3ヶ月平均"));

    const input = screen.getByRole("spinbutton");
    expect((input as HTMLInputElement).value).toBe("291000");
  });

  it("closes when ✕ is clicked", () => {
    const on_close = vi.fn();
    render(<MobileEditBaseSheet base_amount={280000} onClose={on_close} onSaved={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "✕" }));

    expect(on_close).toHaveBeenCalledOnce();
  });
});

// ── MobileIncome — surplus allocation badge and sheet ───────────────────────

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

describe("MobileIncome — surplus allocation", () => {
  function setup_income_handlers(
    surplus_amount: number,
    allocations: components["schemas"]["SurplusAllocation"][] = []
  ) {
    // base_income = 280000, income = 280000 + surplus_amount
    const income_total = 280000 + surplus_amount;
    server.use(
      http.get("http://localhost:8080/income-records", () =>
        HttpResponse.json({
          income_records: [
            {
              ...sample_income,
              amount: income_total,
            },
          ],
        })
      ),
      http.get("http://localhost:8080/base-income", () => HttpResponse.json({ amount: 280000 })),
      http.get("http://localhost:8080/savings-goals", () =>
        HttpResponse.json({ savings_goals: [sample_savings_goal] })
      ),
      http.get("http://localhost:8080/surplus-allocations", () =>
        HttpResponse.json({ surplus_allocations: allocations })
      )
    );
  }

  it("shows 未振分 badge when there is unallocated surplus", async () => {
    setup_income_handlers(50000, []);

    renderIncome(<MobileIncome onBack={vi.fn()} />);

    await waitFor(() => expect(screen.getByText("未振分")).toBeInTheDocument());
  });

  it("hides 未振分 badge when surplus is fully allocated", async () => {
    setup_income_handlers(50000, [
      {
        id: 1,
        year_month: "2026-06",
        amount: 50000,
        destination: "budget",
        savings_goal_id: null,
        created_at: "2026-06-13T10:00:00+09:00",
      },
    ]);

    renderIncome(<MobileIncome onBack={vi.fn()} />);

    await waitFor(() => expect(screen.getByText("基準収入")).toBeInTheDocument());
    expect(screen.queryByText("未振分")).not.toBeInTheDocument();
  });

  it("opens allocate sheet when 振り分ける → is clicked", async () => {
    setup_income_handlers(50000, []);

    renderIncome(<MobileIncome onBack={vi.fn()} />);

    await waitFor(() => expect(screen.getByText("振り分ける →")).toBeInTheDocument());

    fireEvent.click(screen.getByText("振り分ける →"));

    await waitFor(() => expect(screen.getByText("余剰を振り分ける")).toBeInTheDocument());
  });

  it("re-fetches allocations after allocation and updates badge", async () => {
    let alloc_posted = false;
    server.use(
      http.get("http://localhost:8080/income-records", () =>
        HttpResponse.json({
          income_records: [{ ...sample_income, amount: 330000 }],
        })
      ),
      http.get("http://localhost:8080/base-income", () => HttpResponse.json({ amount: 280000 })),
      http.get("http://localhost:8080/savings-goals", () =>
        HttpResponse.json({ savings_goals: [sample_savings_goal] })
      ),
      http.get("http://localhost:8080/surplus-allocations", () => {
        if (alloc_posted) {
          return HttpResponse.json({
            surplus_allocations: [
              {
                id: 1,
                year_month: "2026-06",
                amount: 50000,
                destination: "budget",
                savings_goal_id: null,
                created_at: "2026-06-13T10:00:00+09:00",
              },
            ],
          });
        }
        return HttpResponse.json({ surplus_allocations: [] });
      }),
      http.post("http://localhost:8080/surplus-allocations", async () => {
        alloc_posted = true;
        return HttpResponse.json(
          {
            id: 1,
            year_month: "2026-06",
            amount: 50000,
            destination: "budget",
            savings_goal_id: null,
            created_at: "2026-06-13T10:00:00+09:00",
          },
          { status: 201 }
        );
      })
    );

    renderIncome(<MobileIncome onBack={vi.fn()} />);

    await waitFor(() => expect(screen.getByText("未振分")).toBeInTheDocument());

    // Open allocate sheet
    fireEvent.click(screen.getByText("振り分ける →"));
    await waitFor(() => expect(screen.getByText("余剰を振り分ける")).toBeInTheDocument());

    // Set amount
    const amount_input = screen.getByPlaceholderText("振り分け額");
    fireEvent.change(amount_input, { target: { value: "50000" } });

    // Switch to budget destination
    fireEvent.click(screen.getByRole("button", { name: /今月の予算に追加/ }));

    // Submit
    fireEvent.click(screen.getByText("＋ 振り分ける"));

    // Badge should disappear after allocation
    await waitFor(() => expect(screen.queryByText("未振分")).not.toBeInTheDocument());
  });
});

// ── MobileAllocateSheet — unit tests ────────────────────────────────────────

describe("MobileAllocateSheet", () => {
  const default_goals = [sample_savings_goal];

  it("renders with unallocated amount displayed", () => {
    render(
      <MobileAllocateSheet
        onClose={vi.fn()}
        unallocated={50000}
        active_ym="2026-06"
        savings_goals={default_goals}
        onAllocated={vi.fn()}
      />
    );

    expect(screen.getByText("余剰を振り分ける")).toBeInTheDocument();
    expect(screen.getByText(/余剰 ¥50,000/)).toBeInTheDocument();
  });

  it("POSTs with destination:budget when budget is selected", async () => {
    let posted_body: unknown = null;
    server.use(
      http.post("http://localhost:8080/surplus-allocations", async ({ request }) => {
        posted_body = await request.json();
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
      }),
      http.get("http://localhost:8080/savings-goals", () =>
        HttpResponse.json({ savings_goals: default_goals })
      ),
      http.get("http://localhost:8080/surplus-allocations", () =>
        HttpResponse.json({ surplus_allocations: [] })
      )
    );

    const on_allocated = vi.fn();
    const on_close = vi.fn();
    render(
      <MobileAllocateSheet
        onClose={on_close}
        unallocated={50000}
        active_ym="2026-06"
        savings_goals={default_goals}
        onAllocated={on_allocated}
      />
    );

    // Enter amount
    const amount_input = screen.getByPlaceholderText("振り分け額");
    fireEvent.change(amount_input, { target: { value: "10000" } });

    // Select budget destination (button contains emoji + label + sub-label)
    fireEvent.click(screen.getByRole("button", { name: /今月の予算に追加/ }));

    // Submit
    fireEvent.click(screen.getByText("＋ 振り分ける"));

    await waitFor(() => expect(on_allocated).toHaveBeenCalledOnce());
    expect(on_close).toHaveBeenCalledOnce();
    expect(posted_body).toMatchObject({
      year_month: "2026-06",
      amount: 10000,
      destination: "budget",
    });
  });

  it("POSTs with savings_goal_id when savings destination is selected", async () => {
    let posted_body: unknown = null;
    server.use(
      http.post("http://localhost:8080/surplus-allocations", async ({ request }) => {
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
      }),
      http.get("http://localhost:8080/savings-goals", () =>
        HttpResponse.json({ savings_goals: default_goals })
      ),
      http.get("http://localhost:8080/surplus-allocations", () =>
        HttpResponse.json({ surplus_allocations: [] })
      )
    );

    const on_allocated = vi.fn();
    render(
      <MobileAllocateSheet
        onClose={vi.fn()}
        unallocated={50000}
        active_ym="2026-06"
        savings_goals={default_goals}
        onAllocated={on_allocated}
      />
    );

    // savings destination is selected by default; goal is auto-selected
    const amount_input = screen.getByPlaceholderText("振り分け額");
    fireEvent.change(amount_input, { target: { value: "20000" } });

    fireEvent.click(screen.getByText("＋ 振り分ける"));

    await waitFor(() => expect(on_allocated).toHaveBeenCalledOnce());
    expect(posted_body).toMatchObject({
      year_month: "2026-06",
      amount: 20000,
      destination: "savings",
      savings_goal_id: 10,
    });
  });
});
