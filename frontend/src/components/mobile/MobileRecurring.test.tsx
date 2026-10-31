import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { todayInJst } from "../../logic";
import {
  putRecurringExpense,
  RENT_CATEGORY_ID,
  seedFixedCategory,
  seedPersonalLedger,
  TestLedgerServer,
} from "../../test/ledgerFixtures";
import { renderWithLedger } from "../../test/renderWithLedger";
import { MobileRecurring } from "./MobileRecurring";

const current_month = todayInJst().slice(0, 7);

// A food group (variable) and a fixed-cost group, so the picker filter is visible.
function recurringLedgerServer(add_rows: (ledger_server: TestLedgerServer) => void = () => {}) {
  const ledger_server = new TestLedgerServer();
  seedPersonalLedger(ledger_server);
  seedFixedCategory(ledger_server);
  add_rows(ledger_server);
  return ledger_server;
}

async function renderRecurring(ledger_server: TestLedgerServer) {
  const rendered = await renderWithLedger(<MobileRecurring onBack={() => {}} />, ledger_server);
  expect(
    await screen.findByText("毎月の固定・半固定費を管理", undefined, { timeout: 5000 })
  ).toBeInTheDocument();
  return rendered;
}

async function fillRequiredFields(): Promise<void> {
  await screen.findByRole("option", { name: "家賃" });
  fireEvent.change(screen.getByPlaceholderText("家賃"), { target: { value: "サブスク" } });
  fireEvent.change(screen.getByPlaceholderText("25"), { target: { value: "1" } });
  fireEvent.change(screen.getByDisplayValue("選択してください"), {
    target: { value: RENT_CATEGORY_ID },
  });
}

describe("MobileRecurring — category filter (fixed-cost only)", () => {
  it("shows only fixed-cost categories in the recurring picker", async () => {
    await renderRecurring(recurringLedgerServer());

    fireEvent.click(screen.getByRole("button", { name: /定期支出を追加/ }));

    expect(await screen.findByRole("option", { name: "家賃" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "スーパー" })).not.toBeInTheDocument();
  });
});

describe("MobileRecurring — create form", () => {
  it("opens the bottom-sheet when ＋ 定期支出を追加 is clicked", async () => {
    await renderRecurring(recurringLedgerServer());

    fireEvent.click(screen.getByRole("button", { name: /定期支出を追加/ }));

    expect(screen.getByText("定期支出を追加")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("家賃")).toBeInTheDocument();
  });

  it("creates the expense with a ledger command and shows it", async () => {
    const ledger_server = recurringLedgerServer();
    await renderRecurring(ledger_server);

    fireEvent.click(screen.getByRole("button", { name: /定期支出を追加/ }));
    await fillRequiredFields();
    fireEvent.change(screen.getByPlaceholderText("🏠"), { target: { value: "📱" } });
    fireEvent.click(screen.getByRole("button", { name: "保存する" }));

    await waitFor(() => expect(screen.queryByText("定期支出を追加")).not.toBeInTheDocument());
    expect((await screen.findAllByText("サブスク")).length).toBeGreaterThan(0);
    expect(ledger_server.recorded_commands[0]).toMatchObject({
      method: "POST",
      path: "recurring-expenses",
      request_body: {
        name: "サブスク",
        emoji: "📱",
        category_id: RENT_CATEGORY_ID,
      },
    });
  });

  it("shows validation error when name is empty", async () => {
    await renderRecurring(recurringLedgerServer());

    fireEvent.click(screen.getByRole("button", { name: /定期支出を追加/ }));
    fireEvent.click(screen.getByRole("button", { name: "保存する" }));

    expect(screen.getByText("名前を入力してください")).toBeInTheDocument();
  });

  it("submits the default emoji when the emoji field is untouched", async () => {
    const ledger_server = recurringLedgerServer();
    await renderRecurring(ledger_server);

    fireEvent.click(screen.getByRole("button", { name: /定期支出を追加/ }));
    await fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: "保存する" }));

    await waitFor(() => expect(ledger_server.recorded_commands).toHaveLength(1));
    expect(ledger_server.recorded_commands[0].request_body).toMatchObject({ emoji: "🏠" });
  });

  it("lets the user pick a different emoji from the list", async () => {
    const ledger_server = recurringLedgerServer();
    await renderRecurring(ledger_server);

    fireEvent.click(screen.getByRole("button", { name: /定期支出を追加/ }));
    await fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: "📱" }));
    fireEvent.click(screen.getByRole("button", { name: "保存する" }));

    await waitFor(() => expect(ledger_server.recorded_commands).toHaveLength(1));
    expect(ledger_server.recorded_commands[0].request_body).toMatchObject({ emoji: "📱" });
  });

  it("shows validation error when billing_day is out of range", async () => {
    await renderRecurring(recurringLedgerServer());

    fireEvent.click(screen.getByRole("button", { name: /定期支出を追加/ }));
    fireEvent.change(screen.getByPlaceholderText("家賃"), { target: { value: "家賃" } });
    fireEvent.change(screen.getByPlaceholderText("25"), { target: { value: "99" } });
    fireEvent.click(screen.getByRole("button", { name: "保存する" }));

    expect(screen.getByText("引落日を1〜31で入力してください")).toBeInTheDocument();
  });

  it("closes the sheet when ✕ is clicked", async () => {
    await renderRecurring(recurringLedgerServer());

    fireEvent.click(screen.getByRole("button", { name: /定期支出を追加/ }));
    expect(screen.getByText("定期支出を追加")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "✕" }));
    expect(screen.queryByText("定期支出を追加")).not.toBeInTheDocument();
  });
});

describe("MobileRecurring — edit form", () => {
  it("opens the edit sheet pre-filled when ✎ is clicked", async () => {
    await renderRecurring(
      recurringLedgerServer((seeded_server) => {
        putRecurringExpense(seeded_server, { name: "マンション", billing_day: 25 });
      })
    );

    fireEvent.click(await screen.findByRole("button", { name: "編集" }));

    expect(screen.getByText("定期支出を編集")).toBeInTheDocument();
    expect((screen.getByPlaceholderText("家賃") as HTMLInputElement).value).toBe("マンション");
    expect(screen.getByDisplayValue("25")).toBeInTheDocument();
  });

  it("updates the expense with a ledger command and shows the new name", async () => {
    let recurring_id = "";
    const ledger_server = recurringLedgerServer((seeded_server) => {
      recurring_id = putRecurringExpense(seeded_server, { name: "マンション" });
    });
    await renderRecurring(ledger_server);

    fireEvent.click(await screen.findByRole("button", { name: "編集" }));
    fireEvent.change(screen.getByPlaceholderText("家賃"), { target: { value: "更新済み家賃" } });
    fireEvent.click(screen.getByRole("button", { name: "保存する" }));

    await waitFor(() => expect(screen.queryByText("定期支出を編集")).not.toBeInTheDocument());
    expect((await screen.findAllByText("更新済み家賃")).length).toBeGreaterThan(0);
    expect(ledger_server.recorded_commands[0]).toMatchObject({
      method: "PUT",
      path: `recurring-expenses/${recurring_id}`,
    });
  });
});

describe("MobileRecurring — delete", () => {
  it("deletes the expense with a ledger command after confirmation", async () => {
    let recurring_id = "";
    const ledger_server = recurringLedgerServer((seeded_server) => {
      recurring_id = putRecurringExpense(seeded_server, { name: "マンション" });
    });
    await renderRecurring(ledger_server);

    fireEvent.click(await screen.findByRole("button", { name: "削除" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "削除" }));

    await waitFor(() => expect(screen.queryByText("マンション")).not.toBeInTheDocument());
    expect(ledger_server.recorded_commands).toEqual([
      { method: "DELETE", path: `recurring-expenses/${recurring_id}`, request_body: null },
    ]);
  });

  it("does NOT delete when the confirm Modal is cancelled", async () => {
    const ledger_server = recurringLedgerServer((seeded_server) => {
      putRecurringExpense(seeded_server, { name: "マンション" });
    });
    await renderRecurring(ledger_server);

    fireEvent.click(await screen.findByRole("button", { name: "削除" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "キャンセル" }));

    expect(ledger_server.recorded_commands).toEqual([]);
    expect(screen.getByText("マンション")).toBeInTheDocument();
  });
});

describe("MobileRecurring — confirm pending", () => {
  function pendingLedgerServer() {
    let recurring_id = "";
    const ledger_server = recurringLedgerServer((seeded_server) => {
      recurring_id = putRecurringExpense(seeded_server, {
        name: "電気代",
        type: "variable",
        amount: 7480,
      });
    });
    return { ledger_server, recurring_id: () => recurring_id };
  }

  it("shows pending items with amount input and 金額を確定 button", async () => {
    await renderRecurring(pendingLedgerServer().ledger_server);

    expect((await screen.findAllByText("電気代")).length).toBeGreaterThan(0);
    expect(screen.getByText("💬 確認待ち")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "金額を確定" })).toBeInTheDocument();
  });

  it("confirms the amount with a ledger command and removes the pending item", async () => {
    const { ledger_server, recurring_id } = pendingLedgerServer();
    await renderRecurring(ledger_server);

    fireEvent.change(await screen.findByPlaceholderText("7480"), { target: { value: "6800" } });
    fireEvent.click(screen.getByRole("button", { name: "金額を確定" }));

    await waitFor(() => expect(screen.queryByText("💬 確認待ち")).not.toBeInTheDocument());
    expect(ledger_server.recorded_commands).toEqual([
      {
        method: "POST",
        path: `recurring-expenses/${recurring_id()}/confirm`,
        request_body: { amount: 6800, year_month: current_month },
      },
    ]);
  });

  it("does not call confirm when amount input is empty", async () => {
    const { ledger_server } = pendingLedgerServer();
    await renderRecurring(ledger_server);

    fireEvent.click(await screen.findByRole("button", { name: "金額を確定" }));

    expect(ledger_server.recorded_commands).toEqual([]);
    expect(screen.getByText("💬 確認待ち")).toBeInTheDocument();
  });

  it("disables confirming and editing while offline", async () => {
    const { app_services } = await renderRecurring(pendingLedgerServer().ledger_server);
    expect(await screen.findByRole("button", { name: "金額を確定" })).toBeEnabled();

    app_services.sync_environment.setOnline(false);

    expect(
      await screen.findByText("オフラインのため閲覧のみです。接続すると編集できます")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "金額を確定" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "編集" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /定期支出を追加/ })).toBeDisabled();
  });
});
