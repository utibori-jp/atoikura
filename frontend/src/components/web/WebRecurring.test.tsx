import { fireEvent, screen, waitFor } from "@testing-library/react";
import { todayInJst } from "../../logic";
import {
  putJournalEntry,
  putRecurringExpense,
  RENT_CATEGORY_ID,
  seedFixedCategory,
  seedPersonalLedger,
  TestLedgerServer,
} from "../../test/ledgerFixtures";
import { renderWithLedger } from "../../test/renderWithLedger";
import { WebRecurring } from "./WebRecurring";

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
  const rendered = await renderWithLedger(<WebRecurring onBack={() => {}} />, ledger_server);
  expect(
    await screen.findByText("毎月の固定・半固定費を管理します", undefined, { timeout: 5000 })
  ).toBeInTheDocument();
  return rendered;
}

function openCreateForm(): void {
  fireEvent.click(screen.getAllByRole("button", { name: /定期支出を追加/ })[0]);
}

async function fillRequiredFields(): Promise<void> {
  await screen.findByRole("option", { name: "家賃" });
  fireEvent.change(screen.getByPlaceholderText("家賃"), { target: { value: "サブスク" } });
  fireEvent.change(screen.getByPlaceholderText("25"), { target: { value: "1" } });
  fireEvent.change(screen.getByDisplayValue("選択してください"), {
    target: { value: RENT_CATEGORY_ID },
  });
}

describe("WebRecurring — category filter (fixed-cost only)", () => {
  it("shows only fixed-cost categories in the recurring picker", async () => {
    await renderRecurring(recurringLedgerServer());

    openCreateForm();

    expect(await screen.findByRole("option", { name: "家賃" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "スーパー" })).not.toBeInTheDocument();
  });
});

describe("WebRecurring — create form", () => {
  it("opens the create form when ＋ 定期支出を追加 (header button) is clicked", async () => {
    await renderRecurring(recurringLedgerServer());

    openCreateForm();

    expect(screen.getByText("定期支出を追加")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("家賃")).toBeInTheDocument();
  });

  it("opens the create form when the bottom dashed button is clicked", async () => {
    await renderRecurring(recurringLedgerServer());

    const add_buttons = screen.getAllByRole("button", { name: /定期支出を追加/ });
    fireEvent.click(add_buttons[add_buttons.length - 1]);

    expect(screen.getByText("定期支出を追加")).toBeInTheDocument();
  });

  it("creates the expense with a ledger command and shows it", async () => {
    const ledger_server = recurringLedgerServer();
    await renderRecurring(ledger_server);

    openCreateForm();
    await fillRequiredFields();
    fireEvent.change(screen.getByPlaceholderText("🏠"), { target: { value: "📱" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(await screen.findByText("サブスク")).toBeInTheDocument();
    expect(ledger_server.recorded_commands[0]).toEqual({
      method: "POST",
      path: "recurring-expenses",
      request_body: {
        name: "サブスク",
        emoji: "📱",
        billing_day: 1,
        amount: null,
        type: "fixed",
        category_id: RENT_CATEGORY_ID,
      },
    });
  });

  it("shows validation error when name is empty", async () => {
    await renderRecurring(recurringLedgerServer());

    openCreateForm();
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(screen.getByText("名前を入力してください")).toBeInTheDocument();
  });

  it("submits the default emoji when the emoji field is untouched", async () => {
    const ledger_server = recurringLedgerServer();
    await renderRecurring(ledger_server);

    openCreateForm();
    await fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(ledger_server.recorded_commands).toHaveLength(1));
    expect(ledger_server.recorded_commands[0].request_body).toMatchObject({ emoji: "🏠" });
  });

  it("lets the user pick a different emoji from the list", async () => {
    const ledger_server = recurringLedgerServer();
    await renderRecurring(ledger_server);

    openCreateForm();
    await fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: "📱" }));
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(ledger_server.recorded_commands).toHaveLength(1));
    expect(ledger_server.recorded_commands[0].request_body).toMatchObject({ emoji: "📱" });
  });

  it("shows validation error when billing_day is out of range", async () => {
    await renderRecurring(recurringLedgerServer());

    openCreateForm();
    fireEvent.change(screen.getByPlaceholderText("家賃"), { target: { value: "家賃" } });
    fireEvent.change(screen.getByPlaceholderText("25"), { target: { value: "99" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(screen.getByText("引落日を1〜31で入力してください")).toBeInTheDocument();
  });

  it("closes the form when キャンセル is clicked", async () => {
    await renderRecurring(recurringLedgerServer());

    openCreateForm();
    expect(screen.getByText("定期支出を追加")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));
    expect(screen.queryByText("定期支出を追加")).not.toBeInTheDocument();
  });
});

describe("WebRecurring — pending", () => {
  it("lays the 確認待ち cards out in a 2-column grid (not a single squeezed row)", async () => {
    await renderRecurring(
      recurringLedgerServer((seeded_server) => {
        for (const pending_name of ["電気代", "ガス代", "水道代", "通信費"]) {
          putRecurringExpense(seeded_server, {
            name: pending_name,
            type: "variable",
            amount: null,
          });
        }
      })
    );

    const pending_container = await screen.findByTestId("pending-cards");
    expect(pending_container).toHaveStyle({ display: "grid" });
    expect(pending_container).toHaveStyle({ gridTemplateColumns: "1fr 1fr" });
  });

  it("lists only variable expenses not yet posted this month", async () => {
    await renderRecurring(
      recurringLedgerServer((seeded_server) => {
        putRecurringExpense(seeded_server, { name: "電気代", type: "variable", amount: null });
        const posted_id = putRecurringExpense(seeded_server, {
          name: "ガス代",
          type: "variable",
          amount: null,
        });
        putJournalEntry(seeded_server, {
          transaction_date: `${current_month}-10`,
          amount: 4000,
          recurring_expense_id: posted_id,
          recurring_year_month: current_month,
        });
      })
    );

    const pending_container = await screen.findByTestId("pending-cards");
    expect(pending_container).toHaveTextContent("電気代");
    expect(pending_container).not.toHaveTextContent("ガス代");
  });

  it("confirms the month's amount with a ledger command and removes the card", async () => {
    let recurring_id = "";
    const ledger_server = recurringLedgerServer((seeded_server) => {
      recurring_id = putRecurringExpense(seeded_server, {
        name: "電気代",
        type: "variable",
        amount: null,
      });
    });
    await renderRecurring(ledger_server);

    await screen.findByTestId("pending-cards");
    fireEvent.change(screen.getByPlaceholderText("0"), { target: { value: "7480" } });
    fireEvent.click(screen.getByRole("button", { name: "金額を確定する" }));

    await waitFor(() => expect(screen.queryByTestId("pending-cards")).not.toBeInTheDocument());
    expect(ledger_server.recorded_commands).toEqual([
      {
        method: "POST",
        path: `recurring-expenses/${recurring_id}/confirm`,
        request_body: { amount: 7480, year_month: current_month },
      },
    ]);
  });

  it("shows the server's reason when the confirm is refused", async () => {
    const ledger_server = recurringLedgerServer((seeded_server) => {
      putRecurringExpense(seeded_server, { name: "電気代", type: "variable", amount: null });
    });
    await renderRecurring(ledger_server);
    ledger_server.rejectNextCommand(409, "already_posted", "今月分はすでに記録されています");

    await screen.findByTestId("pending-cards");
    fireEvent.change(screen.getByPlaceholderText("0"), { target: { value: "7480" } });
    fireEvent.click(screen.getByRole("button", { name: "金額を確定する" }));

    expect(await screen.findByText("今月分はすでに記録されています")).toBeInTheDocument();
  });
});

describe("WebRecurring — edit form", () => {
  it("opens the edit form pre-filled when ✎ is clicked", async () => {
    await renderRecurring(
      recurringLedgerServer((seeded_server) => {
        putRecurringExpense(seeded_server, { name: "マンション", billing_day: 25 });
      })
    );

    fireEvent.click(await screen.findByText("✎"));

    expect(screen.getByText("定期支出を編集")).toBeInTheDocument();
    expect(screen.getByDisplayValue("マンション")).toBeInTheDocument();
    expect(screen.getByDisplayValue("25")).toBeInTheDocument();
  });

  it("updates the expense and shows the new name", async () => {
    let recurring_id = "";
    const ledger_server = recurringLedgerServer((seeded_server) => {
      recurring_id = putRecurringExpense(seeded_server, { name: "マンション", billing_day: 25 });
    });
    await renderRecurring(ledger_server);

    fireEvent.click(await screen.findByText("✎"));
    fireEvent.change(screen.getByDisplayValue("マンション"), { target: { value: "更新済み家賃" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(await screen.findByText("更新済み家賃")).toBeInTheDocument();
    expect(ledger_server.recorded_commands[0]).toMatchObject({
      method: "PUT",
      path: `recurring-expenses/${recurring_id}`,
      request_body: { name: "更新済み家賃", category_id: RENT_CATEGORY_ID },
    });
  });

  it("hides the edit actions while offline", async () => {
    const ledger_server = recurringLedgerServer((seeded_server) => {
      putRecurringExpense(seeded_server, { name: "マンション" });
    });
    const { app_services } = await renderRecurring(ledger_server);
    expect(await screen.findByText("✎")).toBeInTheDocument();

    app_services.sync_environment.setOnline(false);

    expect(
      await screen.findByText("オフラインのため閲覧のみです。接続すると編集できます")
    ).toBeInTheDocument();
    expect(screen.queryByText("✎")).not.toBeInTheDocument();
    for (const add_button of screen.getAllByRole("button", { name: /定期支出を追加/ })) {
      expect(add_button).toBeDisabled();
    }
  });
});
