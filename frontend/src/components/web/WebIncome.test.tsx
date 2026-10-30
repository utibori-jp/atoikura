import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { todayInJst } from "../../logic";
import {
  putIncomeRecord,
  putSavingsGoal,
  putSurplusAllocation,
  seedPersonalLedger,
  TestLedgerServer,
} from "../../test/ledgerFixtures";
import { renderWithLedger } from "../../test/renderWithLedger";
import { WebIncome } from "./WebIncome";

const current_month = todayInJst().slice(0, 7);

function incomeLedgerServer({ base_income_amount = 280000 } = {}) {
  const ledger_server = new TestLedgerServer();
  seedPersonalLedger(ledger_server, { base_income_amount });
  return ledger_server;
}

async function renderIncome(ledger_server: TestLedgerServer) {
  const rendered = await renderWithLedger(<WebIncome onBack={() => {}} />, ledger_server);
  // The subtitle is always rendered; wait for the base income so the data has loaded.
  expect(
    await screen.findByText("基準と余剰を分けて管理します", undefined, { timeout: 5000 })
  ).toBeInTheDocument();
  return rendered;
}

describe("WebIncome — create form", () => {
  it("opens the create form when ＋ 収入を記録 is clicked", async () => {
    await renderIncome(incomeLedgerServer());

    fireEvent.click(screen.getByRole("button", { name: /収入を記録/ }));

    expect(screen.getByText("収入を記録")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("6月給与")).toBeInTheDocument();
  });

  it("creates the record with a ledger command and shows it", async () => {
    const ledger_server = incomeLedgerServer();
    await renderIncome(ledger_server);

    fireEvent.click(screen.getByRole("button", { name: /収入を記録/ }));
    fireEvent.change(screen.getByPlaceholderText("6月給与"), { target: { value: "副業収入" } });
    fireEvent.change(screen.getByPlaceholderText("🏢"), { target: { value: "💻" } });
    fireEvent.change(screen.getByPlaceholderText("280000"), { target: { value: "50000" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(screen.queryByText("収入を記録")).not.toBeInTheDocument());
    expect((await screen.findAllByText("副業収入")).length).toBeGreaterThan(0);
    expect(ledger_server.recorded_commands[0]).toMatchObject({
      method: "POST",
      path: "income-records",
      request_body: {
        name: "副業収入",
        emoji: "💻",
        amount: 50000,
        transaction_date: `${current_month}-01`,
        income_type: "salary",
      },
    });
  });

  it("shows validation error when name is empty", async () => {
    await renderIncome(incomeLedgerServer());

    fireEvent.click(screen.getByRole("button", { name: /収入を記録/ }));
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(screen.getByText("名前を入力してください")).toBeInTheDocument();
  });

  it("submits the default emoji when the emoji field is untouched", async () => {
    const ledger_server = incomeLedgerServer();
    await renderIncome(ledger_server);

    fireEvent.click(screen.getByRole("button", { name: /収入を記録/ }));
    fireEvent.change(screen.getByPlaceholderText("6月給与"), { target: { value: "給与" } });
    fireEvent.change(screen.getByPlaceholderText("280000"), { target: { value: "5000" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(ledger_server.recorded_commands).toHaveLength(1));
    expect(ledger_server.recorded_commands[0].request_body).toMatchObject({ emoji: "🏢" });
  });

  it("lets the user pick a different emoji from the list", async () => {
    const ledger_server = incomeLedgerServer();
    await renderIncome(ledger_server);

    fireEvent.click(screen.getByRole("button", { name: /収入を記録/ }));
    fireEvent.change(screen.getByPlaceholderText("6月給与"), { target: { value: "給与" } });
    fireEvent.change(screen.getByPlaceholderText("280000"), { target: { value: "5000" } });
    fireEvent.click(screen.getByRole("button", { name: "💼" }));
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(ledger_server.recorded_commands).toHaveLength(1));
    expect(ledger_server.recorded_commands[0].request_body).toMatchObject({ emoji: "💼" });
  });

  it("shows validation error when amount is zero or invalid", async () => {
    await renderIncome(incomeLedgerServer());

    fireEvent.click(screen.getByRole("button", { name: /収入を記録/ }));
    fireEvent.change(screen.getByPlaceholderText("6月給与"), { target: { value: "給与" } });
    fireEvent.change(screen.getByPlaceholderText("280000"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(screen.getByText("金額を正しく入力してください")).toBeInTheDocument();
  });

  it("closes the form when キャンセル is clicked", async () => {
    await renderIncome(incomeLedgerServer());

    fireEvent.click(screen.getByRole("button", { name: /収入を記録/ }));
    expect(screen.getByText("収入を記録")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));
    expect(screen.queryByText("収入を記録")).not.toBeInTheDocument();
  });
});

describe("WebIncome — edit and delete", () => {
  function ledgerServerWithRecord() {
    const ledger_server = incomeLedgerServer();
    const income_id = putIncomeRecord(ledger_server, {
      transaction_date: `${current_month}-25`,
      amount: 280000,
      name: "6月給与",
    });
    return { ledger_server, income_id };
  }

  it("opens the edit form pre-filled when ✎ is clicked", async () => {
    await renderIncome(ledgerServerWithRecord().ledger_server);

    fireEvent.click(await screen.findByText("✎"));

    expect(screen.getByText("収入記録を編集")).toBeInTheDocument();
    expect(screen.getByDisplayValue("6月給与")).toBeInTheDocument();
    expect(screen.getByDisplayValue("280000")).toBeInTheDocument();
  });

  it("updates the record with a ledger command and shows the new name", async () => {
    const { ledger_server, income_id } = ledgerServerWithRecord();
    await renderIncome(ledger_server);

    fireEvent.click(await screen.findByText("✎"));
    fireEvent.change(screen.getByDisplayValue("6月給与"), { target: { value: "7月給与" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(screen.queryByText("収入記録を編集")).not.toBeInTheDocument());
    expect((await screen.findAllByText("7月給与")).length).toBeGreaterThan(0);
    expect(ledger_server.recorded_commands[0]).toMatchObject({
      method: "PUT",
      path: `income-records/${income_id}`,
    });
  });

  it("deletes the record with a ledger command after confirmation", async () => {
    const { ledger_server, income_id } = ledgerServerWithRecord();
    await renderIncome(ledger_server);

    fireEvent.click(await screen.findByText("🗑"));
    fireEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "削除" })
    );

    await waitFor(() => expect(screen.queryByText("6月給与")).not.toBeInTheDocument());
    expect(ledger_server.recorded_commands).toEqual([
      { method: "DELETE", path: `income-records/${income_id}`, request_body: null },
    ]);
  });

  it("hides the edit actions and explains why while offline", async () => {
    const { app_services } = await renderIncome(ledgerServerWithRecord().ledger_server);
    expect(await screen.findByText("✎")).toBeInTheDocument();

    app_services.sync_environment.setOnline(false);

    expect(
      await screen.findByText("オフラインのため閲覧のみです。接続すると編集できます")
    ).toBeInTheDocument();
    expect(screen.queryByText("✎")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /収入を記録/ })).toBeDisabled();
    expect(screen.getByText("6月給与")).toBeInTheDocument();
  });
});

describe("WebIncome — surplus allocation", () => {
  // Income 330,000 over a base of 280,000 leaves a surplus of 50,000.
  function surplusLedgerServer() {
    const ledger_server = incomeLedgerServer({ base_income_amount: 280000 });
    putIncomeRecord(ledger_server, { transaction_date: `${current_month}-25`, amount: 330000 });
    const goal_id = putSavingsGoal(ledger_server, { name: "旅行積立" });
    return { ledger_server, goal_id };
  }

  it("shows 未振分 badge when there is unallocated surplus", async () => {
    await renderIncome(surplusLedgerServer().ledger_server);

    expect(await screen.findByText("未振分")).toBeInTheDocument();
  });

  it("hides 未振分 badge when surplus is fully allocated", async () => {
    const { ledger_server } = surplusLedgerServer();
    putSurplusAllocation(ledger_server, {
      year_month: current_month,
      amount: 50000,
      destination: "budget",
    });
    await renderIncome(ledger_server);

    expect((await screen.findAllByText(/330,000/)).length).toBeGreaterThan(0);
    expect(screen.queryByText("未振分")).not.toBeInTheDocument();
  });

  it("opens allocation form when 振り分ける → is clicked", async () => {
    await renderIncome(surplusLedgerServer().ledger_server);

    fireEvent.click(await screen.findByRole("button", { name: "振り分ける →" }));

    expect(screen.getByText("余剰を振り分ける")).toBeInTheDocument();
  });

  it("allocates to the budget with a ledger command", async () => {
    const { ledger_server } = surplusLedgerServer();
    await renderIncome(ledger_server);

    fireEvent.click(await screen.findByRole("button", { name: "振り分ける →" }));
    fireEvent.change(screen.getByPlaceholderText("50000"), { target: { value: "10000" } });
    fireEvent.click(screen.getByRole("button", { name: "今月の予算に追加" }));
    fireEvent.click(screen.getByRole("button", { name: "振り分ける" }));

    await waitFor(() => expect(screen.queryByText("余剰を振り分ける")).not.toBeInTheDocument());
    expect(ledger_server.recorded_commands).toEqual([
      {
        method: "POST",
        path: "surplus-allocations",
        request_body: { year_month: current_month, amount: 10000, destination: "budget" },
      },
    ]);
  });

  it("allocates to a savings goal with its id", async () => {
    const { ledger_server, goal_id } = surplusLedgerServer();
    await renderIncome(ledger_server);

    fireEvent.click(await screen.findByRole("button", { name: "振り分ける →" }));
    fireEvent.change(screen.getByPlaceholderText("50000"), { target: { value: "20000" } });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: goal_id } });
    fireEvent.click(screen.getByRole("button", { name: "振り分ける" }));

    await waitFor(() => expect(ledger_server.recorded_commands).toHaveLength(1));
    expect(ledger_server.recorded_commands[0]).toEqual({
      method: "POST",
      path: "surplus-allocations",
      request_body: {
        year_month: current_month,
        amount: 20000,
        destination: "savings",
        savings_goal_id: goal_id,
      },
    });
  });
});

describe("WebIncome — base income", () => {
  it("updates the base income with a ledger command", async () => {
    const ledger_server = incomeLedgerServer({ base_income_amount: 280000 });
    await renderIncome(ledger_server);

    fireEvent.click(await screen.findByRole("button", { name: /編集/ }));
    fireEvent.change(screen.getByDisplayValue("280000"), { target: { value: "300000" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(ledger_server.recorded_commands).toHaveLength(1));
    expect(ledger_server.recorded_commands[0]).toEqual({
      method: "PUT",
      path: "base-income",
      request_body: { amount: 300000 },
    });
  });
});
