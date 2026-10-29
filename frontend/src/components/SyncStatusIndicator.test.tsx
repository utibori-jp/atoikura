import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { SessionProvider } from "../session/SessionContext";
import { SessionController, type AppSession } from "../session/sessionController";
import { createTestAppServices } from "../test/appServices";
import { SyncStatusIndicator } from "./SyncStatusIndicator";

async function startTestSession(): Promise<AppSession> {
  const session_controller = new SessionController(createTestAppServices());
  await session_controller.initialize();
  const session_state = session_controller.getState();
  if (session_state.status !== "ready") throw new Error("session did not start");
  await session_state.session.sync_client.engine.syncNow();
  return session_state.session;
}

describe("SyncStatusIndicator", () => {
  it("says the data is synced and offers a manual sync", async () => {
    const app_session = await startTestSession();
    render(
      <SessionProvider session={app_session}>
        <SyncStatusIndicator />
      </SessionProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "同期状態: 同期済み" }));

    const details_dialog = await screen.findByRole("dialog");
    expect(within(details_dialog).getByText("0件")).toBeInTheDocument();
    expect(within(details_dialog).getByRole("button", { name: "今すぐ同期" })).toBeEnabled();
  });

  it("counts changes not sent yet", async () => {
    const app_session = await startTestSession();
    render(
      <SessionProvider session={app_session}>
        <SyncStatusIndicator />
      </SessionProvider>
    );

    await app_session.sync_client.store.createRecord("daily_notes", {
      date: "2026-10-01",
      note: "メモ",
    });

    expect(
      await screen.findByRole("button", { name: "同期状態: 同期済み・未送信 1件" })
    ).toBeInTheDocument();
  });

  it("opens the refused changes on its own and clears them once acknowledged", async () => {
    const app_session = await startTestSession();
    await app_session.sync_client.store.recordRejections([
      {
        collection: "journal_entries",
        record_id: "entry-1",
        reason: "INVALID",
        message: "amountは正の整数である必要があります",
      },
    ]);
    render(
      <SessionProvider session={app_session}>
        <SyncStatusIndicator />
      </SessionProvider>
    );

    await app_session.sync_client.engine.refreshStatus();

    const details_dialog = await screen.findByRole("dialog");
    expect(
      await within(details_dialog).findByText("amountは正の整数である必要があります")
    ).toBeInTheDocument();
    expect(within(details_dialog).getByText("支出")).toBeInTheDocument();

    fireEvent.click(within(details_dialog).getByRole("button", { name: "確認しました" }));

    await waitFor(() =>
      expect(
        within(details_dialog).queryByText("amountは正の整数である必要があります")
      ).not.toBeInTheDocument()
    );
    expect(app_session.sync_client.engine.getStatus().rejection_count).toBe(0);
  });
});
