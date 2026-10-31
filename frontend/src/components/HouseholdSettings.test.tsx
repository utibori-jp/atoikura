import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { todayInJst } from "../logic";
import {
  seedHousehold,
  seedPersonalLedger,
  TEST_PARTNER_ID,
  TEST_USER_ID,
  TestLedgerServer,
} from "../test/ledgerFixtures";
import { TEST_API_BASE } from "../test/appServices";
import { renderWithLedger } from "../test/renderWithLedger";
import { server } from "../test/server";
import { HouseholdSettings } from "./HouseholdSettings";

const current_month = todayInJst().slice(0, 7);

function soloLedgerServer() {
  const ledger_server = new TestLedgerServer();
  seedPersonalLedger(ledger_server);
  return ledger_server;
}

function householdLedgerServer(role: "owner" | "member" = "owner") {
  const ledger_server = soloLedgerServer();
  seedHousehold(ledger_server, {
    name: "うちの家計",
    members: [
      { user_id: TEST_USER_ID, display_name: "Dev User", role, allowance: 30000 },
      {
        user_id: TEST_PARTNER_ID,
        display_name: "Partner",
        role: role === "owner" ? "member" : "owner",
        allowance: 20000,
      },
    ],
  });
  return ledger_server;
}

async function renderSettings(
  ledger_server: TestLedgerServer,
  { pending_join_token = null as string | null, onJoinTokenHandled = () => {} } = {}
) {
  return renderWithLedger(
    <HouseholdSettings
      pending_join_token={pending_join_token}
      onJoinTokenHandled={onJoinTokenHandled}
    />,
    ledger_server
  );
}

describe("HouseholdSettings — not in a household", () => {
  it("creates a household and then shows it", async () => {
    const ledger_server = soloLedgerServer();
    await renderSettings(ledger_server);

    fireEvent.change(await screen.findByLabelText("家計の名前"), {
      target: { value: " わが家 " },
    });
    fireEvent.click(screen.getByRole("button", { name: "作成" }));

    expect(await screen.findByText("わが家", undefined, { timeout: 5000 })).toBeInTheDocument();
    expect(ledger_server.recorded_household_commands[0]).toEqual({
      method: "POST",
      path: "/household",
      request_body: { name: "わが家" },
    });
    expect(screen.getByText(/オーナー · 1人/)).toBeInTheDocument();
  });

  it("joins with a code", async () => {
    const ledger_server = soloLedgerServer();
    await renderSettings(ledger_server);

    fireEvent.change(await screen.findByLabelText("招待コード"), {
      target: { value: "abcd2345" },
    });
    fireEvent.click(screen.getByRole("button", { name: "参加" }));

    expect(await screen.findByText(/メンバー · 1人/, undefined, { timeout: 5000 })).toBeVisible();
    expect(ledger_server.recorded_household_commands[0]).toEqual({
      method: "POST",
      path: "/household/join",
      request_body: { code: "abcd2345" },
    });
  });

  it("asks before joining from an invitation link", async () => {
    const ledger_server = soloLedgerServer();
    const onJoinTokenHandled = vi.fn();
    await renderSettings(ledger_server, { pending_join_token: "link-token", onJoinTokenHandled });

    expect(await screen.findByText("招待リンクから家計に参加しますか？")).toBeInTheDocument();
    expect(ledger_server.recorded_household_commands).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "参加する" }));

    await waitFor(() => expect(onJoinTokenHandled).toHaveBeenCalled());
    expect(ledger_server.recorded_household_commands[0]).toEqual({
      method: "POST",
      path: "/household/join",
      request_body: { token: "link-token" },
    });
  });

  it("shows the server's reason when joining fails", async () => {
    const ledger_server = soloLedgerServer();
    await renderSettings(ledger_server);

    fireEvent.change(await screen.findByLabelText("招待コード"), {
      target: { value: "ZZZZZZZZ" },
    });
    // The test server's join attaches unconditionally; reject it here instead.
    server.use(
      http.post(`${TEST_API_BASE}/household/join`, () =>
        HttpResponse.json(
          { code: "NOT_FOUND", message: "招待が見つからないか、有効期限が切れています" },
          { status: 404 }
        )
      )
    );
    fireEvent.click(screen.getByRole("button", { name: "参加" }));

    expect(
      await screen.findByText("招待が見つからないか、有効期限が切れています")
    ).toBeInTheDocument();
  });
});

describe("HouseholdSettings — in a household", () => {
  it("lists the members with their allowances, owner first", async () => {
    await renderSettings(householdLedgerServer("member"));

    expect(await screen.findByText("うちの家計", undefined, { timeout: 5000 })).toBeVisible();
    const member_rows = screen.getAllByRole("listitem");
    expect(member_rows[0]).toHaveAccessibleName("Partner");
    expect(within(member_rows[0]).getByText("オーナー")).toBeInTheDocument();
    expect(within(member_rows[1]).getByText("（自分）")).toBeInTheDocument();
    expect(screen.getByLabelText("Dev Userのお小遣い")).toHaveValue("30000");
    expect(screen.getByLabelText("Partnerのお小遣い")).toHaveValue("20000");
  });

  it("saves an allowance from the current month", async () => {
    const ledger_server = householdLedgerServer();
    await renderSettings(ledger_server);

    const allowance_input = await screen.findByLabelText("Partnerのお小遣い", undefined, {
      timeout: 5000,
    });
    fireEvent.change(allowance_input, { target: { value: "25000" } });
    fireEvent.click(within(screen.getByRole("listitem", { name: "Partner" })).getByText("保存"));

    await waitFor(() =>
      expect(ledger_server.recorded_household_commands).toContainEqual({
        method: "PUT",
        path: "/household/allowances",
        request_body: { member_id: TEST_PARTNER_ID, effective_from: current_month, amount: 25000 },
      })
    );
  });

  it("creates an invitation and shows its code and link", async () => {
    const ledger_server = householdLedgerServer();
    await renderSettings(ledger_server);

    fireEvent.click(await screen.findByRole("button", { name: "招待を作成" }, { timeout: 5000 }));

    const created_invitation = await screen.findByLabelText("作成した招待");
    expect(within(created_invitation).getByTestId("invitation-code")).toHaveTextContent("CODE2221");
    expect(within(created_invitation).getByLabelText("招待リンク")).toHaveValue(
      `${window.location.origin}${window.location.pathname}#join=token-invitation-1`
    );
    // The open invitation is listed and can be revoked.
    fireEvent.click(await screen.findByRole("button", { name: "取り消す" }));
    await waitFor(() =>
      expect(ledger_server.recorded_household_commands).toContainEqual({
        method: "DELETE",
        path: "/household/invitations/invitation-1",
        request_body: null,
      })
    );
    await waitFor(() => expect(screen.queryByLabelText("作成した招待")).not.toBeInTheDocument());
  });

  it("lets the owner remove a member after confirming", async () => {
    const ledger_server = householdLedgerServer();
    await renderSettings(ledger_server);

    fireEvent.click(await screen.findByRole("button", { name: "外す" }, { timeout: 5000 }));
    const remove_buttons = await screen.findAllByRole("button", { name: "外す" });
    expect(remove_buttons.length).toBe(2);
    // The last one is the confirmation dialog's.
    fireEvent.click(remove_buttons[remove_buttons.length - 1]);

    await waitFor(() =>
      expect(ledger_server.recorded_household_commands).toContainEqual({
        method: "DELETE",
        path: `/household/members/${TEST_PARTNER_ID}`,
        request_body: null,
      })
    );
  });

  it("only lets the owner dissolve once alone, and members leave instead", async () => {
    await renderSettings(householdLedgerServer());
    expect(
      await screen.findByRole("button", { name: "家計を解散" }, { timeout: 5000 })
    ).toBeDisabled();
    expect(screen.queryByRole("button", { name: "家計から抜ける" })).not.toBeInTheDocument();
  });

  it("leaves the household after confirming", async () => {
    const ledger_server = householdLedgerServer("member");
    await renderSettings(ledger_server);

    fireEvent.click(
      await screen.findByRole("button", { name: "家計から抜ける" }, { timeout: 5000 })
    );
    fireEvent.click(await screen.findByRole("button", { name: "抜ける" }));

    expect(await screen.findByLabelText("招待コード", undefined, { timeout: 5000 })).toBeVisible();
    expect(ledger_server.recorded_household_commands).toContainEqual({
      method: "POST",
      path: "/household/leave",
      request_body: null,
    });
  });
});
