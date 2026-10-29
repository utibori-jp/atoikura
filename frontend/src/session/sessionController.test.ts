import { http, HttpResponse } from "msw";
import { AuthError } from "../api/client";
import { LocalDbBusyError, LocalDbInitError, type RecoverableLocalDb } from "../db/client";
import { openMemorySyncDb } from "../sync/testing/memoryDb";
import { SyncStore } from "../sync/store";
import { createTestAppServices, TEST_API_BASE } from "../test/appServices";
import { TEST_LEDGER_ID } from "../test/handlers";
import { server } from "../test/server";
import { SessionController, type SessionState } from "./sessionController";

async function waitForStatus(
  session_controller: SessionController,
  expected_status: SessionState["status"]
): Promise<SessionState> {
  await vi.waitFor(() => expect(session_controller.getState().status).toBe(expected_status));
  return session_controller.getState();
}

describe("SessionController", () => {
  it("shows the login screen when there is no stored session", async () => {
    const session_controller = new SessionController(createTestAppServices({ signed_in: false }));

    await session_controller.initialize();

    expect(session_controller.getState()).toEqual({ status: "anonymous", notice: null });
  });

  it("resumes a stored session: opens the database, binds the user and syncs", async () => {
    const app_services = createTestAppServices();
    const session_controller = new SessionController(app_services);

    await session_controller.initialize();

    const session_state = await waitForStatus(session_controller, "ready");
    if (session_state.status !== "ready") throw new Error("not ready");
    expect(session_state.session.user).toMatchObject({ id: 1, email: "dev@atoikura.local" });
    await session_state.session.sync_client.engine.syncNow();
    expect(await session_state.session.sync_client.store.readSyncState()).toMatchObject({
      user_id: 1,
      ledger_id: TEST_LEDGER_ID,
    });
    expect(app_services.profile_storage.getItem("atoikura.user_profile")).toContain("Dev User");
  });

  it("starts offline with the last profile seen on this device", async () => {
    const app_services = createTestAppServices();
    app_services.profile_storage.setItem(
      "atoikura.user_profile",
      JSON.stringify({
        id: 1,
        email: "dev@atoikura.local",
        display_name: "前回の名前",
        last_login_at: null,
      })
    );
    server.use(http.get(`${TEST_API_BASE}/users/me`, () => HttpResponse.error()));
    const session_controller = new SessionController(app_services);

    await session_controller.initialize();

    const session_state = await waitForStatus(session_controller, "ready");
    expect(session_state.status === "ready" && session_state.session.user.display_name).toBe(
      "前回の名前"
    );
  });

  it("reports wrong credentials as AuthError and stays signed out", async () => {
    server.use(
      http.post(`${TEST_API_BASE}/auth/token`, () =>
        HttpResponse.json({ code: "UNAUTHORIZED", message: "認証情報が不正です" }, { status: 401 })
      )
    );
    const session_controller = new SessionController(createTestAppServices({ signed_in: false }));
    await session_controller.initialize();

    await expect(session_controller.login("dev@atoikura.local", "wrong")).rejects.toBeInstanceOf(
      AuthError
    );
    expect(session_controller.getState().status).toBe("anonymous");
  });

  it("logs in, then logs out and forgets the session", async () => {
    const app_services = createTestAppServices({ signed_in: false });
    const session_controller = new SessionController(app_services);
    await session_controller.initialize();

    await session_controller.login("dev@atoikura.local", "password123");
    expect(session_controller.getState().status).toBe("ready");

    await session_controller.logout();
    expect(session_controller.getState()).toEqual({ status: "anonymous", notice: null });
    expect(app_services.auth_session.hasSession()).toBe(false);
    expect(app_services.profile_storage.getItem("atoikura.user_profile")).toBeNull();
  });

  it("signs out with a notice when the session can't be refreshed", async () => {
    server.use(
      http.post(`${TEST_API_BASE}/auth/refresh`, () =>
        HttpResponse.json(
          { code: "UNAUTHORIZED", message: "再度ログインしてください" },
          { status: 401 }
        )
      )
    );
    const app_services = createTestAppServices();
    app_services.profile_storage.setItem(
      "atoikura.user_profile",
      JSON.stringify({
        id: 1,
        email: "dev@atoikura.local",
        display_name: null,
        last_login_at: null,
      })
    );
    const session_controller = new SessionController(app_services);

    await session_controller.initialize();

    const session_state = await waitForStatus(session_controller, "anonymous");
    expect(session_state).toMatchObject({ notice: expect.stringContaining("再度ログイン") });
  });

  it("explains when another tab holds the database", async () => {
    const app_services = createTestAppServices();
    app_services.openDb = async () => {
      throw new LocalDbBusyError();
    };
    const session_controller = new SessionController(app_services);

    await session_controller.initialize();

    expect(session_controller.getState()).toMatchObject({
      status: "unavailable",
      message: expect.stringContaining("別のタブ"),
    });
  });

  it("pushes pending changes, recreates a database that can't be migrated, and keeps rejections", async () => {
    const old_db = await openMemorySyncDb("old-device");
    await old_db.batch([
      { sql: "UPDATE _sync_state SET user_id = 1, ledger_id = ?", bind: [TEST_LEDGER_ID] },
    ]);
    const note_id = await new SyncStore(old_db).createRecord("daily_notes", {
      date: "2026-10-01",
      note: "未送信",
    });
    const pushed_change_ids: string[] = [];
    server.use(
      http.post(`${TEST_API_BASE}/sync/push`, async ({ request }) => {
        const push_body = (await request.json()) as { changes: { id: string }[] };
        pushed_change_ids.push(...push_body.changes.map((push_change) => push_change.id));
        return HttpResponse.json({
          results: push_body.changes.map((push_change) => ({
            id: push_change.id,
            status: "rejected",
            reason: "INVALID",
            message: "noteは500文字以内で入力してください",
          })),
        });
      })
    );
    const recoverable_db: RecoverableLocalDb = {
      select: old_db.select,
      batch: old_db.batch,
      recreate: () => openMemorySyncDb("new-device"),
      close: old_db.close,
    };
    const app_services = createTestAppServices();
    app_services.openDb = async () => {
      throw new LocalDbInitError("MIGRATION_FAILED", "broken", recoverable_db);
    };
    const session_controller = new SessionController(app_services);

    await session_controller.initialize();

    const session_state = await waitForStatus(session_controller, "ready");
    if (session_state.status !== "ready") throw new Error("not ready");
    expect(pushed_change_ids).toEqual([note_id]);
    expect(await session_state.session.sync_client.store.listRejections()).toMatchObject([
      { collection: "daily_notes", record_id: note_id, reason: "INVALID" },
    ]);
    expect(session_state.session.sync_client.engine.getStatus().rejection_count).toBe(1);
  });
});
