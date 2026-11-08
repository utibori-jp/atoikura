import { render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { SessionProvider } from "../session/SessionContext";
import { createSyncClient } from "../sync/index";
import { openMemorySyncDb } from "../sync/testing/memoryDb";
import type { FakeSyncEnvironment } from "../sync/testing/fakeEnvironment";
import { createTestAppServices, TEST_API_BASE } from "../test/appServices";
import { seedPersonalLedger, TEST_USER_ID, TestLedgerServer } from "../test/ledgerFixtures";
import { server } from "../test/server";
import { LedgerDataProvider } from "./LedgerDataProvider";
import { useLedgerData } from "./ledgerData";

function LedgerIdProbe() {
  return <p>ledger {useLedgerData().ledger_id}</p>;
}

async function renderBeforeFirstSync() {
  const app_services = createTestAppServices();
  const sync_environment = app_services.sync_environment as FakeSyncEnvironment;
  sync_environment.online = false;
  const local_db = await openMemorySyncDb("test-device");
  const sync_client = createSyncClient({
    local_db,
    api_base_url: TEST_API_BASE,
    auth_session: app_services.auth_session,
    environment: sync_environment,
  });
  await sync_client.engine.start(TEST_USER_ID);
  await sync_client.engine.syncNow();
  render(
    <SessionProvider
      session={{
        user: { id: TEST_USER_ID, email: "", display_name: null, last_login_at: null },
        local_db,
        sync_client,
      }}
    >
      <LedgerDataProvider>
        <LedgerIdProbe />
      </LedgerDataProvider>
    </SessionProvider>
  );
  return { sync_client, sync_environment };
}

describe("LedgerDataProvider", () => {
  it("waits for the first sync, explaining that it needs a connection, then shows the screens", async () => {
    const ledger_server = new TestLedgerServer();
    seedPersonalLedger(ledger_server);
    server.use(ledger_server.pullHandler());
    const { sync_client, sync_environment } = await renderBeforeFirstSync();

    expect(
      await screen.findByText(/はじめての同期にはインターネット接続が必要です/)
    ).toBeInTheDocument();

    sync_environment.online = true;
    sync_environment.wake();

    expect(await screen.findByText(/^ledger /)).toBeInTheDocument();
    await sync_client.engine.shutdown();
  });

  it("says when the first sync failed", async () => {
    server.use(
      http.get(`${TEST_API_BASE}/sync/pull`, () =>
        HttpResponse.json({ code: "INTERNAL", message: "サーバーエラー" }, { status: 500 })
      )
    );
    const { sync_client, sync_environment } = await renderBeforeFirstSync();
    sync_environment.online = true;

    await sync_client.engine.syncNow();

    expect(await screen.findByText(/データを取得できませんでした/)).toBeInTheDocument();
    await sync_client.engine.shutdown();
  });
});
