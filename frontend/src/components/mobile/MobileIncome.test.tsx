import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { ReactElement } from "react";
import type { SavingsGoalView } from "../../data/ledgerApi";
import { todayInJst } from "../../logic";
import {
  putIncomeRecord,
  putSavingsGoal,
  putSurplusAllocation,
  seedPersonalLedger,
  TestLedgerServer,
} from "../../test/ledgerFixtures";
import { renderWithLedger } from "../../test/renderWithLedger";
import {
  MobileAllocateSheet,
  MobileEditBaseSheet,
  MobileIncome,
  MobileIncomeSheet,
} from "./MobileIncome";

const current_month = todayInJst().slice(0, 7);

afterEach(() => {
  vi.restoreAllMocks();
});

function incomeLedgerServer(add_rows: (ledger_server: TestLedgerServer) => void = () => {}) {
  const ledger_server = new TestLedgerServer();
  seedPersonalLedger(ledger_server, { base_income_amount: 280000 });
  add_rows(ledger_server);
  return ledger_server;
}

function putJuneSalary(ledger_server: TestLedgerServer, amount = 280000): string {
  return putIncomeRecord(ledger_server, {
    transaction_date: `${current_month}-10`,
    amount,
    name: "6月給与",
    income_type: "salary",
  });
}

async function renderIncome(ledger_server: TestLedgerServer, on_back = vi.fn()) {
  const rendered = await renderWithLedger(<MobileIncome onBack={on_back} />, ledger_server);
  expect(await screen.findByText("基準収入", undefined, { timeout: 5000 })).toBeInTheDocument();
  return rendered;
}

// The sheets read the ledger through the data hooks, so they render inside it too.
async function renderSheet(sheet_element: ReactElement, sheet_title: string) {
  const ledger_server = incomeLedgerServer();
  const rendered = await renderWithLedger(sheet_element, ledger_server);
  expect(await screen.findByText(sheet_title, undefined, { timeout: 5000 })).toBeInTheDocument();
  return { ...rendered, ledger_server };
}

// ── MobileIncome main screen ─────────────────────────────────────────────────

describe("MobileIncome", () => {
  it("shows the base income once the ledger has loaded", async () => {
    await renderIncome(incomeLedgerServer());

    expect(screen.queryByText("読み込み中…")).not.toBeInTheDocument();
  });

  it("shows income records grouped by date", async () => {
    await renderIncome(incomeLedgerServer(putJuneSalary));

    expect(await screen.findByText("6月給与")).toBeInTheDocument();
    expect(screen.getByText("給与")).toBeInTheDocument();
  });

  it("opens income sheet when ＋ 収入を記録 button is clicked", async () => {
    await renderIncome(incomeLedgerServer());

    fireEvent.click(screen.getByText("＋ 収入を記録"));

    expect(await screen.findByText("収入を記録")).toBeInTheDocument();
  });

  it("opens edit sheet when edit button is clicked on an income row", async () => {
    await renderIncome(incomeLedgerServer(putJuneSalary));

    fireEvent.click((await screen.findAllByRole("button", { name: "✎" }))[0]);

    expect(await screen.findByText("収入を編集")).toBeInTheDocument();
  });

  it("deletes income record with confirm dialog", async () => {
    let income_id = "";
    const ledger_server = incomeLedgerServer((seeded_server) => {
      income_id = putJuneSalary(seeded_server);
    });
    await renderIncome(ledger_server);

    fireEvent.click((await screen.findAllByRole("button", { name: "🗑" }))[0]);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("この収入記録を削除しますか？")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "削除" }));

    await waitFor(() => expect(screen.queryByText("6月給与")).not.toBeInTheDocument());
    expect(ledger_server.recorded_commands).toEqual([
      { method: "DELETE", path: `income-records/${income_id}`, request_body: null },
    ]);
  });

  it("does not delete when confirm dialog is cancelled", async () => {
    const ledger_server = incomeLedgerServer(putJuneSalary);
    await renderIncome(ledger_server);

    fireEvent.click((await screen.findAllByRole("button", { name: "🗑" }))[0]);
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "キャンセル" }));

    expect(screen.getByText("6月給与")).toBeInTheDocument();
    expect(ledger_server.recorded_commands).toEqual([]);
  });

  it("opens edit-base sheet when 編集 is clicked", async () => {
    await renderIncome(incomeLedgerServer());

    const edit_base_buttons = screen
      .getAllByRole("button")
      .filter((button_element) => button_element.textContent?.includes("編集"));
    fireEvent.click(edit_base_buttons[0]);

    expect(await screen.findByText("基準収入を編集")).toBeInTheDocument();
  });

  it("calls onBack when back button is clicked", async () => {
    const on_back = vi.fn();
    await renderIncome(incomeLedgerServer(), on_back);

    fireEvent.click(screen.getByText("‹ 予算"));

    expect(on_back).toHaveBeenCalledOnce();
  });

  it("disables the edit actions while offline", async () => {
    const { app_services } = await renderIncome(incomeLedgerServer(putJuneSalary));
    expect(await screen.findByText("6月給与")).toBeInTheDocument();

    app_services.sync_environment.setOnline(false);

    expect(
      await screen.findByText("オフラインのため閲覧のみです。接続すると編集できます")
    ).toBeInTheDocument();
    expect(screen.getByText("＋ 収入を記録")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "✎" })).not.toBeInTheDocument();
    expect(screen.getByText("6月給与")).toBeInTheDocument();
  });
});

// ── MobileIncomeSheet ────────────────────────────────────────────────────────

describe("MobileIncomeSheet — create mode", () => {
  const blank_form = {
    editing_id: null,
    name: "",
    emoji: "🏢",
    amount_yen: "",
    transaction_date: "2026-06-01",
    income_type: "salary" as const,
    note: "",
  };

  it("shows validation error when name is missing", async () => {
    await renderSheet(
      <MobileIncomeSheet initial_form={blank_form} onClose={vi.fn()} onSaved={vi.fn()} />,
      "収入を記録"
    );

    fireEvent.click(screen.getByText("＋ 記録する"));

    expect(await screen.findByText("収入名を入力してください")).toBeInTheDocument();
  });

  it("shows validation error when amount is invalid", async () => {
    await renderSheet(
      <MobileIncomeSheet
        initial_form={{ ...blank_form, name: "テスト" }}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
      "収入を記録"
    );

    fireEvent.click(screen.getByText("＋ 記録する"));

    expect(await screen.findByText("金額を正しく入力してください")).toBeInTheDocument();
  });

  it("creates the record with a ledger command, then calls onSaved and onClose", async () => {
    const on_saved = vi.fn();
    const on_close = vi.fn();
    const { ledger_server } = await renderSheet(
      <MobileIncomeSheet
        initial_form={{ ...blank_form, name: "テスト収入", amount_yen: "100000" }}
        onClose={on_close}
        onSaved={on_saved}
      />,
      "収入を記録"
    );

    fireEvent.click(screen.getByText("＋ 記録する"));

    await waitFor(() => expect(on_saved).toHaveBeenCalledOnce());
    expect(on_close).toHaveBeenCalledOnce();
    expect(ledger_server.recorded_commands[0]).toMatchObject({
      method: "POST",
      path: "income-records",
      request_body: { name: "テスト収入", amount: 100000, transaction_date: "2026-06-01" },
    });
  });

  it("closes when ✕ is clicked", async () => {
    const on_close = vi.fn();
    await renderSheet(
      <MobileIncomeSheet initial_form={blank_form} onClose={on_close} onSaved={vi.fn()} />,
      "収入を記録"
    );

    fireEvent.click(screen.getByRole("button", { name: "✕" }));

    expect(on_close).toHaveBeenCalledOnce();
  });
});

describe("MobileIncomeSheet — edit mode", () => {
  const edit_form = {
    editing_id: "01920000-0000-7000-8000-000000000999",
    name: "6月給与",
    emoji: "🏢",
    amount_yen: "280000",
    transaction_date: "2026-06-10",
    income_type: "salary" as const,
    note: "",
  };

  it("renders the edit title and 更新する button", async () => {
    await renderSheet(
      <MobileIncomeSheet initial_form={edit_form} onClose={vi.fn()} onSaved={vi.fn()} />,
      "収入を編集"
    );

    expect(screen.getByText("更新する")).toBeInTheDocument();
  });

  it("shows the server's reason when the update is refused", async () => {
    const on_saved = vi.fn();
    await renderSheet(
      <MobileIncomeSheet initial_form={edit_form} onClose={vi.fn()} onSaved={on_saved} />,
      "収入を編集"
    );

    // The test server has no such record, so the update is refused with 404.
    fireEvent.click(screen.getByText("更新する"));

    expect(await screen.findByText("not found")).toBeInTheDocument();
    expect(on_saved).not.toHaveBeenCalled();
  });
});

// ── MobileEditBaseSheet ───────────────────────────────────────────────────────

describe("MobileEditBaseSheet", () => {
  it("renders with current base amount", async () => {
    await renderSheet(
      <MobileEditBaseSheet base_amount={280000} onClose={vi.fn()} onSaved={vi.fn()} />,
      "基準収入を編集"
    );

    expect((screen.getByRole("spinbutton") as HTMLInputElement).value).toBe("280000");
  });

  it("updates the base income with a ledger command and calls onSaved", async () => {
    const on_saved = vi.fn();
    const on_close = vi.fn();
    const { ledger_server } = await renderSheet(
      <MobileEditBaseSheet base_amount={280000} onClose={on_close} onSaved={on_saved} />,
      "基準収入を編集"
    );

    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "300000" } });
    fireEvent.click(screen.getByText("保存する"));

    await waitFor(() => expect(on_saved).toHaveBeenCalledWith(300000));
    expect(on_close).toHaveBeenCalledOnce();
    expect(ledger_server.recorded_commands).toEqual([
      { method: "PUT", path: "base-income", request_body: { amount: 300000 } },
    ]);
  });

  it("shows validation error for invalid amount", async () => {
    await renderSheet(
      <MobileEditBaseSheet base_amount={280000} onClose={vi.fn()} onSaved={vi.fn()} />,
      "基準収入を編集"
    );

    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "0" } });
    fireEvent.click(screen.getByText("保存する"));

    expect(await screen.findByText("金額を正しく入力してください")).toBeInTheDocument();
  });

  it("updates draft when a preset button is clicked", async () => {
    await renderSheet(
      <MobileEditBaseSheet base_amount={280000} onClose={vi.fn()} onSaved={vi.fn()} />,
      "基準収入を編集"
    );

    // The 3ヶ月平均 preset (value 291000).
    fireEvent.click(screen.getByText("3ヶ月平均"));

    expect((screen.getByRole("spinbutton") as HTMLInputElement).value).toBe("291000");
  });

  it("closes when ✕ is clicked", async () => {
    const on_close = vi.fn();
    await renderSheet(
      <MobileEditBaseSheet base_amount={280000} onClose={on_close} onSaved={vi.fn()} />,
      "基準収入を編集"
    );

    fireEvent.click(screen.getByRole("button", { name: "✕" }));

    expect(on_close).toHaveBeenCalledOnce();
  });
});

// ── MobileIncome — surplus allocation badge and sheet ───────────────────────

describe("MobileIncome — surplus allocation", () => {
  // Income 330,000 over a base of 280,000 leaves a surplus of 50,000.
  function surplusLedgerServer(add_rows: (ledger_server: TestLedgerServer) => void = () => {}) {
    return incomeLedgerServer((seeded_server) => {
      putJuneSalary(seeded_server, 330000);
      putSavingsGoal(seeded_server, { name: "旅行積立" });
      add_rows(seeded_server);
    });
  }

  it("shows 未振分 badge when there is unallocated surplus", async () => {
    await renderIncome(surplusLedgerServer());

    expect(await screen.findByText("未振分")).toBeInTheDocument();
  });

  it("hides 未振分 badge when surplus is fully allocated", async () => {
    await renderIncome(
      surplusLedgerServer((seeded_server) =>
        putSurplusAllocation(seeded_server, {
          year_month: current_month,
          amount: 50000,
          destination: "budget",
        })
      )
    );

    expect(await screen.findByText("6月給与")).toBeInTheDocument();
    expect(screen.queryByText("未振分")).not.toBeInTheDocument();
  });

  it("opens allocate sheet when 振り分ける → is clicked", async () => {
    await renderIncome(surplusLedgerServer());

    fireEvent.click(await screen.findByText("振り分ける →"));

    expect(await screen.findByText("余剰を振り分ける")).toBeInTheDocument();
  });

  it("hides the badge once the surplus has been allocated", async () => {
    const ledger_server = surplusLedgerServer();
    await renderIncome(ledger_server);
    expect(await screen.findByText("未振分")).toBeInTheDocument();

    fireEvent.click(screen.getByText("振り分ける →"));
    fireEvent.change(await screen.findByPlaceholderText("振り分け額"), {
      target: { value: "50000" },
    });
    fireEvent.click(screen.getByRole("button", { name: /今月の予算に追加/ }));
    fireEvent.click(screen.getByText("＋ 振り分ける"));

    await waitFor(() => expect(screen.queryByText("未振分")).not.toBeInTheDocument());
    expect(ledger_server.recorded_commands).toEqual([
      {
        method: "POST",
        path: "surplus-allocations",
        request_body: { year_month: current_month, amount: 50000, destination: "budget" },
      },
    ]);
  });
});

// ── MobileAllocateSheet ──────────────────────────────────────────────────────

describe("MobileAllocateSheet", () => {
  const travel_goal: SavingsGoalView = {
    id: "01920000-0000-7000-8000-000000000910",
    name: "旅行積立",
    emoji: "✈️",
    monthly_amount: 20000,
    target_amount: 250000,
    accumulated_amount: 170000,
    deadline: null,
    memo: "",
    is_posted_this_month: false,
  };

  function allocateSheet(on_allocated = vi.fn(), on_close = vi.fn()) {
    return (
      <MobileAllocateSheet
        onClose={on_close}
        unallocated={50000}
        active_ym="2026-06"
        savings_goals={[travel_goal]}
        onAllocated={on_allocated}
      />
    );
  }

  it("renders with unallocated amount displayed", async () => {
    await renderSheet(allocateSheet(), "余剰を振り分ける");

    expect(screen.getByText(/余剰 ¥50,000/)).toBeInTheDocument();
  });

  it("allocates to the budget with a ledger command", async () => {
    const on_allocated = vi.fn();
    const on_close = vi.fn();
    const { ledger_server } = await renderSheet(
      allocateSheet(on_allocated, on_close),
      "余剰を振り分ける"
    );

    fireEvent.change(screen.getByPlaceholderText("振り分け額"), { target: { value: "10000" } });
    fireEvent.click(screen.getByRole("button", { name: /今月の予算に追加/ }));
    fireEvent.click(screen.getByText("＋ 振り分ける"));

    await waitFor(() => expect(on_allocated).toHaveBeenCalledOnce());
    expect(on_close).toHaveBeenCalledOnce();
    expect(ledger_server.recorded_commands[0].request_body).toEqual({
      year_month: "2026-06",
      amount: 10000,
      destination: "budget",
    });
  });

  it("allocates to the first savings goal by default", async () => {
    const on_allocated = vi.fn();
    const { ledger_server } = await renderSheet(allocateSheet(on_allocated), "余剰を振り分ける");

    fireEvent.change(screen.getByPlaceholderText("振り分け額"), { target: { value: "20000" } });
    fireEvent.click(screen.getByText("＋ 振り分ける"));

    await waitFor(() => expect(on_allocated).toHaveBeenCalledOnce());
    expect(ledger_server.recorded_commands[0].request_body).toEqual({
      year_month: "2026-06",
      amount: 20000,
      destination: "savings",
      savings_goal_id: travel_goal.id,
    });
  });
});
