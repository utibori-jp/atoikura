import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import {
  FOOD_GROUP_ID,
  seedPersonalLedger,
  SUPERMARKET_CATEGORY_ID,
  TestLedgerServer,
} from "../../test/ledgerFixtures";
import { renderWithLedger } from "../../test/renderWithLedger";
import { WebMaster } from "./WebMaster";

function seededLedgerServer() {
  const ledger_server = new TestLedgerServer();
  seedPersonalLedger(ledger_server);
  return ledger_server;
}

async function renderMaster(ledger_server: TestLedgerServer = seededLedgerServer()) {
  const rendered = await renderWithLedger(<WebMaster />, ledger_server);
  // Wait for the loaded group count, not just the static "大分類（" label.
  expect(
    await screen.findByText("大分類（1件）", undefined, { timeout: 5000 })
  ).toBeInTheDocument();
  return rendered;
}

function perGroupAddButton(): HTMLElement {
  const per_group_add = screen
    .getAllByRole("button")
    .find((button_element) => button_element.textContent?.trim() === "＋ 追加");
  if (!per_group_add) throw new Error("no per-group ＋ 追加 button");
  return per_group_add;
}

describe("WebMaster — forms as modals (#130)", () => {
  it("no longer renders the redundant top-right ＋ 生活区分を追加 button", async () => {
    await renderMaster();

    fireEvent.click(screen.getByRole("button", { name: "生活区分" }));

    expect(screen.queryByRole("button", { name: /生活区分を追加/ })).not.toBeInTheDocument();
    expect(perGroupAddButton()).toBeInTheDocument();
  });

  it("opens the 大分類 create form as a dialog from ＋ 大分類を追加", async () => {
    await renderMaster();

    fireEvent.click(screen.getByRole("button", { name: /大分類を追加/ }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("大分類を追加")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("opens the 生活区分 create form as a dialog from a per-group ＋ 追加", async () => {
    await renderMaster();

    fireEvent.click(screen.getByRole("button", { name: "生活区分" }));
    fireEvent.click(perGroupAddButton());

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("生活区分を追加")).toBeInTheDocument();
  });
});

describe("WebMaster — ledger commands", () => {
  it("creates a group with the statement type code for the chosen type", async () => {
    const ledger_server = seededLedgerServer();
    await renderMaster(ledger_server);

    fireEvent.click(screen.getByRole("button", { name: /大分類を追加/ }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByPlaceholderText("食費"), { target: { value: "住居" } });
    fireEvent.change(within(dialog).getByRole("combobox"), { target: { value: "3" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "保存" }));

    expect(await screen.findByText("大分類（2件）")).toBeInTheDocument();
    expect(ledger_server.recorded_commands).toEqual([
      {
        method: "POST",
        path: "category-groups",
        request_body: { name: "住居", statement_type_code: "fixed", description: null },
      },
    ]);
  });

  it("adds a category to the group without a category code", async () => {
    const ledger_server = seededLedgerServer();
    await renderMaster(ledger_server);

    fireEvent.click(screen.getByRole("button", { name: "生活区分" }));
    fireEvent.click(perGroupAddButton());
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).queryByText("コード")).not.toBeInTheDocument();
    fireEvent.change(within(dialog).getByPlaceholderText("外食"), { target: { value: "外食" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "保存" }));

    expect(await screen.findByText("外食")).toBeInTheDocument();
    expect(ledger_server.recorded_commands).toEqual([
      {
        method: "POST",
        path: "expense-categories",
        request_body: { group_id: FOOD_GROUP_ID, name: "外食", description: null },
      },
    ]);
  });

  it("shows the server's reason when a delete is refused", async () => {
    const ledger_server = seededLedgerServer();
    await renderMaster(ledger_server);
    ledger_server.rejectNextCommand(409, "in_use", "使用中の生活区分は削除できません");

    fireEvent.click(screen.getByRole("button", { name: "生活区分" }));
    fireEvent.click(await screen.findByText("🗑"));
    fireEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "削除" })
    );

    expect(await screen.findByText("使用中の生活区分は削除できません")).toBeInTheDocument();
    expect(ledger_server.recorded_commands).toEqual([
      {
        method: "DELETE",
        path: `expense-categories/${SUPERMARKET_CATEGORY_ID}`,
        request_body: null,
      },
    ]);
  });

  it("disables editing while offline", async () => {
    const { app_services } = await renderMaster();

    app_services.sync_environment.setOnline(false);

    expect(
      await screen.findByText("オフラインのため閲覧のみです。接続すると編集できます")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /大分類を追加/ })).toBeDisabled();
  });
});
