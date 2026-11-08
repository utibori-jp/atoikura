import { fireEvent, screen, waitFor } from "@testing-library/react";
import { todayInJst } from "../../logic";
import {
  putSavingsGoal,
  putSavingsPosting,
  seedPersonalLedger,
  TestLedgerServer,
} from "../../test/ledgerFixtures";
import { renderWithLedger } from "../../test/renderWithLedger";
import { WebSavings } from "./WebSavings";

const current_month = todayInJst().slice(0, 7);

function ledgerServerWithGoals(add_goals: (ledger_server: TestLedgerServer) => void = () => {}) {
  const ledger_server = new TestLedgerServer();
  seedPersonalLedger(ledger_server);
  add_goals(ledger_server);
  return ledger_server;
}

// The page subtitle is always rendered once the ledger has loaded.
async function waitForReady() {
  expect(
    await screen.findByText("目的別に積み立てて、着実に前進", undefined, { timeout: 5000 })
  ).toBeInTheDocument();
}

async function renderSavings(ledger_server: TestLedgerServer) {
  const rendered = await renderWithLedger(<WebSavings onBack={() => {}} />, ledger_server);
  await waitForReady();
  return rendered;
}

describe("WebSavings — goals from the local database", () => {
  it("shows the accumulated amount from postings and the monthly posting state", async () => {
    const ledger_server = ledgerServerWithGoals((seeded_server) => {
      const goal_id = putSavingsGoal(seeded_server, { name: "旅行積立" });
      putSavingsPosting(seeded_server, { goal_id, year_month: "2026-01", amount: 170000 });
    });
    await renderSavings(ledger_server);

    expect((await screen.findAllByText("旅行積立")).length).toBeGreaterThan(0);
    expect(screen.getByText("今月分を記録する")).toBeInTheDocument();
    expect(screen.getAllByText(/170,000/).length).toBeGreaterThan(0);
  });

  it("records this month's savings with a ledger command", async () => {
    let goal_id = "";
    const ledger_server = ledgerServerWithGoals((seeded_server) => {
      goal_id = putSavingsGoal(seeded_server, { monthly_amount: 20000 });
    });
    await renderSavings(ledger_server);

    fireEvent.click(await screen.findByRole("button", { name: "今月分を記録する" }));

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "今月分を記録する" })).not.toBeInTheDocument()
    );
    expect(ledger_server.recorded_commands).toEqual([
      {
        method: "POST",
        path: `savings-goals/${goal_id}/postings`,
        request_body: { amount: 20000, year_month: current_month },
      },
    ]);
  });
});

describe("WebSavings — create form", () => {
  it("opens the create form when ＋ 貯金目標を追加 is clicked", async () => {
    await renderSavings(ledgerServerWithGoals());

    fireEvent.click(screen.getByRole("button", { name: /貯金目標を追加/ }));

    expect(screen.getByText("貯金目標を追加")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("旅行積立")).toBeInTheDocument();
  });

  it("creates the goal with a ledger command and shows it", async () => {
    const ledger_server = ledgerServerWithGoals();
    await renderSavings(ledger_server);

    fireEvent.click(screen.getByRole("button", { name: /貯金目標を追加/ }));
    fireEvent.change(screen.getByPlaceholderText("旅行積立"), { target: { value: "新目標" } });
    fireEvent.change(screen.getByPlaceholderText("📷"), { target: { value: "🎯" } });
    fireEvent.change(screen.getByPlaceholderText("20000"), { target: { value: "5000" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(screen.queryByText("貯金目標を追加")).not.toBeInTheDocument());
    expect((await screen.findAllByText("新目標")).length).toBeGreaterThan(0);
    expect(ledger_server.recorded_commands[0]).toMatchObject({
      method: "POST",
      path: "savings-goals",
      request_body: { name: "新目標", emoji: "🎯", monthly_amount: 5000 },
    });
  });

  it("submits the default emoji when the emoji field is untouched", async () => {
    const ledger_server = ledgerServerWithGoals();
    await renderSavings(ledger_server);

    fireEvent.click(screen.getByRole("button", { name: /貯金目標を追加/ }));
    fireEvent.change(screen.getByPlaceholderText("旅行積立"), { target: { value: "新目標" } });
    fireEvent.change(screen.getByPlaceholderText("20000"), { target: { value: "5000" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(ledger_server.recorded_commands).toHaveLength(1));
    expect(ledger_server.recorded_commands[0].request_body).toMatchObject({ emoji: "📷" });
  });

  it("lets the user pick a different emoji from the list", async () => {
    const ledger_server = ledgerServerWithGoals();
    await renderSavings(ledger_server);

    fireEvent.click(screen.getByRole("button", { name: /貯金目標を追加/ }));
    fireEvent.change(screen.getByPlaceholderText("旅行積立"), { target: { value: "新目標" } });
    fireEvent.change(screen.getByPlaceholderText("20000"), { target: { value: "5000" } });
    fireEvent.click(screen.getByRole("button", { name: "🎁" }));
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(ledger_server.recorded_commands).toHaveLength(1));
    expect(ledger_server.recorded_commands[0].request_body).toMatchObject({ emoji: "🎁" });
  });

  it("shows the server's reason and keeps the form open when the command is rejected", async () => {
    const ledger_server = ledgerServerWithGoals();
    await renderSavings(ledger_server);
    ledger_server.rejectNextCommand(409, "duplicate", "同じ名前の目標があります");

    fireEvent.click(screen.getByRole("button", { name: /貯金目標を追加/ }));
    fireEvent.change(screen.getByPlaceholderText("旅行積立"), { target: { value: "新目標" } });
    fireEvent.change(screen.getByPlaceholderText("20000"), { target: { value: "5000" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(await screen.findByText("同じ名前の目標があります")).toBeInTheDocument();
    expect(screen.getByText("貯金目標を追加")).toBeInTheDocument();
  });

  it("shows validation error when name is empty", async () => {
    await renderSavings(ledgerServerWithGoals());

    fireEvent.click(screen.getByRole("button", { name: /貯金目標を追加/ }));
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(screen.getByText("名前を入力してください")).toBeInTheDocument();
  });

  it("closes the form when キャンセル is clicked", async () => {
    await renderSavings(ledgerServerWithGoals());

    fireEvent.click(screen.getByRole("button", { name: /貯金目標を追加/ }));
    expect(screen.getByText("貯金目標を追加")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));
    expect(screen.queryByText("貯金目標を追加")).not.toBeInTheDocument();
  });
});

describe("WebSavings — edit form", () => {
  it("opens the edit form pre-filled when ✎ is clicked", async () => {
    await renderSavings(ledgerServerWithGoals((seeded_server) => putSavingsGoal(seeded_server)));

    fireEvent.click(await screen.findByText("✎"));

    expect(screen.getByText("貯金目標を編集")).toBeInTheDocument();
    expect(screen.getByDisplayValue("旅行積立")).toBeInTheDocument();
  });

  it("updates the goal with a ledger command and shows the new name", async () => {
    let goal_id = "";
    const ledger_server = ledgerServerWithGoals((seeded_server) => {
      goal_id = putSavingsGoal(seeded_server);
    });
    await renderSavings(ledger_server);

    fireEvent.click(await screen.findByText("✎"));
    fireEvent.change(screen.getByDisplayValue("旅行積立"), { target: { value: "更新済み目標" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(screen.queryByText("貯金目標を編集")).not.toBeInTheDocument());
    expect((await screen.findAllByText("更新済み目標")).length).toBeGreaterThan(0);
    expect(ledger_server.recorded_commands[0]).toMatchObject({
      method: "PUT",
      path: `savings-goals/${goal_id}`,
    });
  });
});

describe("WebSavings — offline", () => {
  it("keeps showing the goals but disables editing while offline", async () => {
    const ledger_server = ledgerServerWithGoals((seeded_server) => putSavingsGoal(seeded_server));
    const { app_services } = await renderSavings(ledger_server);
    expect((await screen.findAllByText("旅行積立")).length).toBeGreaterThan(0);

    app_services.sync_environment.setOnline(false);

    expect(
      await screen.findByText("オフラインのため閲覧のみです。接続すると編集できます")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /貯金目標を追加/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "今月分を記録する" })).toBeDisabled();
    expect(screen.queryByText("✎")).not.toBeInTheDocument();
    expect(screen.getAllByText("旅行積立").length).toBeGreaterThan(0);
  });
});
