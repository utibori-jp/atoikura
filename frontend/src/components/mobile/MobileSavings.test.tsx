import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { todayInJst } from "../../logic";
import {
  putSavingsGoal,
  putSavingsPosting,
  seedPersonalLedger,
  TestLedgerServer,
} from "../../test/ledgerFixtures";
import { renderWithLedger } from "../../test/renderWithLedger";
import { MobileSavings } from "./MobileSavings";

const current_month = todayInJst().slice(0, 7);

function ledgerServerWithGoals(add_goals: (ledger_server: TestLedgerServer) => void = () => {}) {
  const ledger_server = new TestLedgerServer();
  seedPersonalLedger(ledger_server);
  add_goals(ledger_server);
  return ledger_server;
}

async function renderSavings(ledger_server: TestLedgerServer) {
  const rendered = await renderWithLedger(<MobileSavings onBack={() => {}} />, ledger_server);
  // The subtitle is always rendered once the ledger has loaded.
  expect(
    await screen.findByText("目的別に積み上げる", undefined, { timeout: 5000 })
  ).toBeInTheDocument();
  return rendered;
}

describe("MobileSavings — create form", () => {
  it("opens the create sheet when ＋ 貯金目標を追加 is clicked", async () => {
    await renderSavings(ledgerServerWithGoals());

    fireEvent.click(screen.getByRole("button", { name: /貯金目標を追加/ }));

    expect(screen.getByText("貯金目標を追加")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("例：新しいカメラ")).toBeInTheDocument();
  });

  it("creates the goal with a ledger command and shows it", async () => {
    const ledger_server = ledgerServerWithGoals();
    await renderSavings(ledger_server);

    fireEvent.click(screen.getByRole("button", { name: /貯金目標を追加/ }));
    fireEvent.change(screen.getByPlaceholderText("例：新しいカメラ"), {
      target: { value: "新目標" },
    });
    fireEvent.change(screen.getByPlaceholderText("20000"), { target: { value: "5000" } });
    fireEvent.click(screen.getByRole("button", { name: "保存する" }));

    await waitFor(() => expect(screen.queryByText("貯金目標を追加")).not.toBeInTheDocument());
    expect(await screen.findByText("新目標")).toBeInTheDocument();
    expect(ledger_server.recorded_commands[0]).toMatchObject({
      method: "POST",
      path: "savings-goals",
      request_body: { name: "新目標", monthly_amount: 5000 },
    });
  });

  it("shows validation error when name is empty", async () => {
    await renderSavings(ledgerServerWithGoals());

    fireEvent.click(screen.getByRole("button", { name: /貯金目標を追加/ }));
    fireEvent.click(screen.getByRole("button", { name: "保存する" }));

    expect(screen.getByText("名前を入力してください")).toBeInTheDocument();
  });

  it("closes the sheet when ✕ is clicked", async () => {
    await renderSavings(ledgerServerWithGoals());

    fireEvent.click(screen.getByRole("button", { name: /貯金目標を追加/ }));
    expect(screen.getByText("貯金目標を追加")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "✕" }));
    expect(screen.queryByText("貯金目標を追加")).not.toBeInTheDocument();
  });
});

describe("MobileSavings — edit form", () => {
  it("opens the edit sheet pre-filled when 編集 is clicked", async () => {
    await renderSavings(ledgerServerWithGoals((seeded_server) => putSavingsGoal(seeded_server)));

    fireEvent.click(await screen.findByRole("button", { name: "編集" }));

    expect(screen.getByText("貯金目標を編集")).toBeInTheDocument();
    expect(screen.getByDisplayValue("旅行積立")).toBeInTheDocument();
  });

  it("updates the goal with a ledger command and shows the new name", async () => {
    let goal_id = "";
    const ledger_server = ledgerServerWithGoals((seeded_server) => {
      goal_id = putSavingsGoal(seeded_server);
    });
    await renderSavings(ledger_server);

    fireEvent.click(await screen.findByRole("button", { name: "編集" }));
    fireEvent.change(screen.getByDisplayValue("旅行積立"), { target: { value: "更新済み目標" } });
    fireEvent.click(screen.getByRole("button", { name: "保存する" }));

    await waitFor(() => expect(screen.queryByText("貯金目標を編集")).not.toBeInTheDocument());
    expect(await screen.findByText("更新済み目標")).toBeInTheDocument();
    expect(ledger_server.recorded_commands[0]).toMatchObject({
      method: "PUT",
      path: `savings-goals/${goal_id}`,
    });
  });
});

describe("MobileSavings — delete", () => {
  it("deletes the goal with a ledger command after confirmation", async () => {
    let goal_id = "";
    const ledger_server = ledgerServerWithGoals((seeded_server) => {
      goal_id = putSavingsGoal(seeded_server);
    });
    await renderSavings(ledger_server);

    // The 🗑 trigger opens the in-app confirm Modal (#166); confirm inside it.
    fireEvent.click(await screen.findByRole("button", { name: "削除" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "削除" }));

    await waitFor(() => expect(screen.queryByText("旅行積立")).not.toBeInTheDocument());
    expect(ledger_server.recorded_commands).toEqual([
      { method: "DELETE", path: `savings-goals/${goal_id}`, request_body: null },
    ]);
  });

  it("keeps the goal and shows the reason when the server refuses the delete", async () => {
    const ledger_server = ledgerServerWithGoals((seeded_server) => putSavingsGoal(seeded_server));
    await renderSavings(ledger_server);
    ledger_server.rejectNextCommand(409, "in_use", "この目標は使用中のため削除できません");

    fireEvent.click(await screen.findByRole("button", { name: "削除" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "削除" }));

    expect(await screen.findByText("この目標は使用中のため削除できません")).toBeInTheDocument();
    expect(screen.getByText("旅行積立")).toBeInTheDocument();
  });

  it("does not delete when confirmation is cancelled", async () => {
    const ledger_server = ledgerServerWithGoals((seeded_server) => putSavingsGoal(seeded_server));
    await renderSavings(ledger_server);

    fireEvent.click(await screen.findByRole("button", { name: "削除" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "キャンセル" }));

    expect(ledger_server.recorded_commands).toEqual([]);
    expect(screen.getByText("旅行積立")).toBeInTheDocument();
  });
});

describe("MobileSavings — post-monthly", () => {
  it("records this month's savings and then shows ✅ 今月済", async () => {
    let goal_id = "";
    const ledger_server = ledgerServerWithGoals((seeded_server) => {
      goal_id = putSavingsGoal(seeded_server);
    });
    await renderSavings(ledger_server);

    fireEvent.click(await screen.findByRole("button", { name: "今月分を記録する" }));

    expect(await screen.findByText("✅ 今月済")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "今月分を記録する" })).not.toBeInTheDocument();
    expect(ledger_server.recorded_commands).toEqual([
      {
        method: "POST",
        path: `savings-goals/${goal_id}/postings`,
        request_body: { amount: 20000, year_month: current_month },
      },
    ]);
  });

  it("does not show 今月分を記録する when already posted", async () => {
    await renderSavings(
      ledgerServerWithGoals((seeded_server) => {
        const goal_id = putSavingsGoal(seeded_server);
        putSavingsPosting(seeded_server, { goal_id, year_month: current_month, amount: 20000 });
      })
    );

    expect(await screen.findByText("✅ 今月済")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "今月分を記録する" })).not.toBeInTheDocument();
  });
});

describe("MobileSavings — offline", () => {
  it("disables the edit buttons while offline", async () => {
    const ledger_server = ledgerServerWithGoals((seeded_server) => putSavingsGoal(seeded_server));
    const { app_services } = await renderSavings(ledger_server);
    expect(await screen.findByText("旅行積立")).toBeInTheDocument();

    app_services.sync_environment.setOnline(false);

    expect(
      await screen.findByText("オフラインのため閲覧のみです。接続すると編集できます")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /貯金目標を追加/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "編集" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "削除" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "今月分を記録する" })).toBeDisabled();
  });
});
