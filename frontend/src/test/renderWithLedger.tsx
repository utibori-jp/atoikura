// Renders one screen against a synced in-memory database, for screen tests that
// don't need the whole <App />. The database is filled by a real sync from the
// TestLedgerServer rows.
import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { DialogProvider } from "../components/dialogs";
import { LedgerDataProvider } from "../data/LedgerDataProvider";
import { loadLedgerData } from "../data/ledgerData";
import { SessionProvider } from "../session/SessionContext";
import type { AppSession } from "../session/sessionController";
import { createSyncClient } from "../sync/index";
import { openMemorySyncDb, type MemorySyncDb } from "../sync/testing/memoryDb";
import { createTestAppServices, TEST_API_BASE } from "./appServices";
import { TEST_USER_ID, type TestLedgerServer } from "./ledgerFixtures";
import { server } from "./server";

const running_sessions: AppSession[] = [];

afterEach(async () => {
  for (const app_session of running_sessions.splice(0)) {
    await app_session.sync_client.engine.shutdown();
  }
});

// A signed-in session whose database has synced the server's rows.
export async function openSyncedSession(ledger_server: TestLedgerServer) {
  server.use(ledger_server.pullHandler());
  const app_services = createTestAppServices();
  const local_db: MemorySyncDb = await openMemorySyncDb("test-device");
  const sync_client = createSyncClient({
    local_db,
    api_base_url: TEST_API_BASE,
    auth_session: app_services.auth_session,
    environment: app_services.sync_environment,
  });
  await sync_client.engine.start(TEST_USER_ID);
  await sync_client.engine.syncNow();
  const app_session: AppSession = {
    user: {
      id: TEST_USER_ID,
      email: "dev@atoikura.local",
      display_name: "Dev User",
      last_login_at: null,
    },
    local_db,
    sync_client,
  };
  running_sessions.push(app_session);
  const ledger_data = await loadLedgerData(local_db, sync_client.store, TEST_USER_ID);
  if (!ledger_data) throw new Error("the ledger did not sync");
  return { app_session, local_db, sync_client, ledger_data, app_services };
}

export async function renderWithLedger(
  screen_element: ReactElement,
  ledger_server: TestLedgerServer
) {
  const { app_session, local_db, sync_client } = await openSyncedSession(ledger_server);
  const render_result = render(
    <DialogProvider is_mobile={false}>
      <SessionProvider session={app_session}>
        <LedgerDataProvider>{screen_element}</LedgerDataProvider>
      </SessionProvider>
    </DialogProvider>
  );
  return { ...render_result, local_db, sync_client };
}
