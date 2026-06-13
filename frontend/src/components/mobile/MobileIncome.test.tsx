import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "../../test/server";
import { MobileIncome, MobileIncomeSheet, MobileEditBaseSheet } from "./MobileIncome";
import type { components } from "../../api/types";

const TOKEN_KEY = "atoikura.jwt_token";

beforeEach(() => {
  sessionStorage.setItem(TOKEN_KEY, "test-token");
  // jsdom does not implement window.confirm; stub it to return true by default
  vi.spyOn(window, "confirm").mockReturnValue(true);
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

    render(<MobileIncome onBack={vi.fn()} />);

    // Loading text appears first
    expect(screen.getByText("読み込み中…")).toBeInTheDocument();

    // Then content loads
    await waitFor(() => expect(screen.getByText("基準収入")).toBeInTheDocument());
    expect(screen.queryByText("読み込み中…")).not.toBeInTheDocument();
  });

  it("shows income records grouped by date", async () => {
    setup_income_list_handler([sample_income]);
    setup_base_income_handler(sample_base_income);

    render(<MobileIncome onBack={vi.fn()} />);

    await waitFor(() => expect(screen.getByText("6月給与")).toBeInTheDocument());
    // Income type badge should be visible
    expect(screen.getByText("給与")).toBeInTheDocument();
  });

  it("opens income sheet when ＋ 収入を記録 button is clicked", async () => {
    setup_income_list_handler([]);
    setup_base_income_handler(sample_base_income);

    render(<MobileIncome onBack={vi.fn()} />);

    await waitFor(() => expect(screen.getByText("＋ 収入を記録")).toBeInTheDocument());

    fireEvent.click(screen.getByText("＋ 収入を記録"));

    await waitFor(() => expect(screen.getByText("収入を記録")).toBeInTheDocument());
  });

  it("opens edit sheet when edit button is clicked on an income row", async () => {
    setup_income_list_handler([sample_income]);
    setup_base_income_handler(sample_base_income);

    render(<MobileIncome onBack={vi.fn()} />);

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

    render(<MobileIncome onBack={vi.fn()} />);

    await waitFor(() => expect(screen.getByText("6月給与")).toBeInTheDocument());

    // Click the delete (🗑) button
    const delete_buttons = screen.getAllByRole("button", { name: "🗑" });
    fireEvent.click(delete_buttons[0]);

    expect(window.confirm).toHaveBeenCalledWith("この収入記録を削除しますか？");

    await waitFor(() => expect(screen.queryByText("6月給与")).not.toBeInTheDocument());
  });

  it("does not delete when confirm dialog is cancelled", async () => {
    setup_income_list_handler([sample_income]);
    setup_base_income_handler(sample_base_income);
    vi.spyOn(window, "confirm").mockReturnValue(false);

    render(<MobileIncome onBack={vi.fn()} />);

    await waitFor(() => expect(screen.getByText("6月給与")).toBeInTheDocument());

    const delete_buttons = screen.getAllByRole("button", { name: "🗑" });
    fireEvent.click(delete_buttons[0]);

    // Income record should still be visible
    expect(screen.getByText("6月給与")).toBeInTheDocument();
  });

  it("opens edit-base sheet when 編集 is clicked", async () => {
    setup_income_list_handler([]);
    setup_base_income_handler(sample_base_income);

    render(<MobileIncome onBack={vi.fn()} />);

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
    render(<MobileIncome onBack={on_back} />);

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
