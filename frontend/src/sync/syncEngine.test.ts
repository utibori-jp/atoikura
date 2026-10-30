// @vitest-environment node
// End-to-end tests of the sync engine: real SQLite (in-memory WASM) on each
// simulated device, and a fake server with the server's LWW semantics.
import { SyncEngine } from "./engine";
import { OfflineError, SyncClientError, SyncUpdateRequiredError } from "./errors";
import { SyncStore } from "./store";
import { FakeSyncEnvironment } from "./testing/fakeEnvironment";
import { FakeSyncServer } from "./testing/fakeSyncServer";
import { openMemorySyncDb, type MemorySyncDb } from "./testing/memoryDb";
import type { SyncTransport } from "./transport";

const USER_ID = 7;
const OTHER_USER_ID = 8;
const PERSONAL_LEDGER_ID = "01920000-0000-7000-8000-000000000001";
const HOUSEHOLD_LEDGER_ID = "01920000-0000-7000-8000-000000000002";
const CATEGORY_ID = "01920000-0000-7000-8000-0000000000c1";

interface TestDevice {
  db: MemorySyncDb;
  store: SyncStore;
  engine: SyncEngine;
  environment: FakeSyncEnvironment;
  transport: ReturnType<FakeSyncServer["transportFor"]>;
  clock: { now_ms: number };
}

const opened_devices: TestDevice[] = [];

async function createDevice(
  server: FakeSyncServer,
  device_id: string,
  user_id = USER_ID,
  start_ms = Date.UTC(2026, 9, 1)
): Promise<TestDevice> {
  const db = await openMemorySyncDb(device_id);
  const clock = { now_ms: start_ms };
  const store = new SyncStore(db, { now: () => clock.now_ms });
  const environment = new FakeSyncEnvironment();
  const transport = server.transportFor(user_id);
  const engine = new SyncEngine({ store, transport, environment, pull_page_limit: 3 });
  await engine.start(user_id);
  await engine.syncNow();
  const test_device = { db, store, engine, environment, transport, clock };
  opened_devices.push(test_device);
  return test_device;
}

afterEach(() => {
  for (const test_device of opened_devices.splice(0)) {
    test_device.engine.stop();
    test_device.db.close();
  }
});

function newServer(): FakeSyncServer {
  const server = new FakeSyncServer();
  server.setUserLedger(USER_ID, PERSONAL_LEDGER_ID);
  server.setUserLedger(OTHER_USER_ID, PERSONAL_LEDGER_ID);
  server.writeOnlineRow(PERSONAL_LEDGER_ID, USER_ID, "expense_categories", CATEGORY_ID, {
    group_id: "01920000-0000-7000-8000-0000000000g1",
    name: "食費",
    description: null,
  });
  return server;
}

const LUNCH_ENTRY = {
  wallet: "ledger",
  transaction_date: "2026-10-05",
  item: "lunch",
  amount: 1200,
  is_excluded: 0,
  category_id: CATEGORY_ID,
  note: null,
};

async function selectRows(test_device: TestDevice, sql: string, bind: (string | number)[] = []) {
  return test_device.db.select(sql, bind);
}

describe("SyncEngine", () => {
  it("pulls the online-only cache on start", async () => {
    const server = newServer();
    const device = await createDevice(server, "device-a");

    expect(await selectRows(device, "SELECT id, name, ledger_id FROM expense_categories")).toEqual([
      { id: CATEGORY_ID, name: "食費", ledger_id: PERSONAL_LEDGER_ID },
    ]);
    expect(device.engine.getStatus()).toMatchObject({ phase: "idle", pending_count: 0 });
    expect(device.engine.getStatus().last_synced_at).not.toBeNull();
  });

  it("pushes changes made offline once the device is back online", async () => {
    const server = newServer();
    const device = await createDevice(server, "device-a");
    device.environment.online = false;

    const entry_id = await device.store.createRecord("journal_entries", LUNCH_ENTRY);
    await device.engine.syncNow();

    expect(device.engine.getStatus()).toMatchObject({ phase: "offline", pending_count: 1 });
    expect(server.findRecord("journal_entries", entry_id)).toBeUndefined();

    device.environment.online = true;
    device.environment.wake();
    await device.engine.syncNow();

    expect(server.findRecord("journal_entries", entry_id)?.values).toMatchObject({
      amount: 1200,
      is_excluded: false,
      wallet: "ledger",
    });
    expect(device.engine.getStatus()).toMatchObject({ phase: "idle", pending_count: 0 });
    expect(await selectRows(device, "SELECT COUNT(*) AS outbox_count FROM _outbox")).toEqual([
      { outbox_count: 0 },
    ]);
    const [synced_row] = await selectRows(device, "SELECT seq FROM journal_entries WHERE id = ?", [
      entry_id,
    ]);
    expect(synced_row.seq).toBeGreaterThan(0);
  });

  it("schedules a debounced sync after local writes", async () => {
    const server = newServer();
    const device = await createDevice(server, "device-a");
    device.environment.timers.clear();

    await device.store.createRecord("journal_entries", LUNCH_ENTRY);

    expect(device.environment.scheduledDelays()).toEqual([2_000]);
    device.environment.runTimers();
    await device.engine.syncNow();
    expect(server.listRecords("journal_entries")).toHaveLength(1);
  });

  it("merges concurrent edits from two devices of the same user field by field", async () => {
    const server = newServer();
    const device_a = await createDevice(server, "device-a");
    const device_b = await createDevice(server, "device-b");
    const entry_id = await device_a.store.createRecord("journal_entries", LUNCH_ENTRY);
    await device_a.engine.syncNow();
    await device_b.engine.syncNow();

    // Both devices edit offline: different fields, and the same field (item).
    device_a.clock.now_ms += 1_000;
    await device_a.store.updateRecord("journal_entries", entry_id, {
      amount: 1500,
      item: "lunch A",
    });
    device_b.clock.now_ms += 2_000;
    await device_b.store.updateRecord("journal_entries", entry_id, {
      note: "with coffee",
      item: "lunch B",
    });

    await device_a.engine.syncNow();
    await device_b.engine.syncNow();
    await device_a.engine.syncNow();

    const expected_entry = { amount: 1500, note: "with coffee", item: "lunch B" };
    for (const test_device of [device_a, device_b]) {
      const [merged_row] = await selectRows(
        test_device,
        "SELECT amount, note, item FROM journal_entries WHERE id = ?",
        [entry_id]
      );
      expect(merged_row).toEqual(expected_entry);
      expect(test_device.engine.getStatus().pending_count).toBe(0);
    }
    expect(server.findRecord("journal_entries", entry_id)?.values).toMatchObject(expected_entry);
  });

  it("keeps a newer pending local edit when an older remote value is pulled", async () => {
    const server = newServer();
    const device_a = await createDevice(server, "device-a");
    const device_b = await createDevice(server, "device-b");
    const entry_id = await device_a.store.createRecord("journal_entries", LUNCH_ENTRY);
    await device_a.engine.syncNow();
    await device_b.engine.syncNow();

    device_a.clock.now_ms += 1_000;
    await device_a.store.updateRecord("journal_entries", entry_id, { amount: 1300 });
    await device_a.engine.syncNow();
    // Device B edited later but hasn't pushed; it pulls A's older edit first.
    device_b.clock.now_ms += 5_000;
    await device_b.store.updateRecord("journal_entries", entry_id, { amount: 1800 });
    device_b.environment.online = false;
    await device_b.store.applyPullPage(server.pull(USER_ID, 0, 100));

    const [pending_row] = await selectRows(
      device_b,
      "SELECT amount FROM journal_entries WHERE id = ?",
      [entry_id]
    );
    expect(pending_row.amount).toBe(1800);
    expect(
      await selectRows(device_b, "SELECT field, value FROM _shadow WHERE record_id = ?", [entry_id])
    ).toEqual([{ field: "amount", value: "1300" }]);

    device_b.environment.online = true;
    await device_b.engine.syncNow();
    expect(server.findRecord("journal_entries", entry_id)?.values.amount).toBe(1800);
  });

  it("lets a deletion win over concurrent edits", async () => {
    const server = newServer();
    const device_a = await createDevice(server, "device-a");
    const device_b = await createDevice(server, "device-b");
    const entry_id = await device_a.store.createRecord("journal_entries", LUNCH_ENTRY);
    await device_a.engine.syncNow();
    await device_b.engine.syncNow();

    await device_a.store.deleteRecord("journal_entries", entry_id);
    device_b.clock.now_ms += 10_000;
    await device_b.store.updateRecord("journal_entries", entry_id, { amount: 9999 });
    await device_a.engine.syncNow();
    await device_b.engine.syncNow();

    expect(server.findRecord("journal_entries", entry_id)?.deleted).toBe(true);
    const [tombstone_row] = await selectRows(
      device_b,
      "SELECT deleted FROM journal_entries WHERE id = ?",
      [entry_id]
    );
    expect(tombstone_row.deleted).toBe(1);
    expect(device_b.engine.getStatus().pending_count).toBe(0);
  });

  it("removes a rejected new record and tells the user", async () => {
    const server = newServer();
    const device = await createDevice(server, "device-a");

    const entry_id = await device.store.createRecord("journal_entries", {
      ...LUNCH_ENTRY,
      amount: 0,
    });
    await device.engine.syncNow();

    expect(
      await selectRows(device, "SELECT id FROM journal_entries WHERE id = ?", [entry_id])
    ).toEqual([]);
    expect(device.engine.getStatus()).toMatchObject({ pending_count: 0, rejection_count: 1 });
    const [rejection] = await device.store.listRejections();
    expect(rejection).toMatchObject({
      collection: "journal_entries",
      record_id: entry_id,
      reason: "INVALID",
      message: "amountは正の整数である必要があります",
    });

    await device.store.dismissRejections([rejection.rejection_id]);
    expect(await device.store.listRejections()).toEqual([]);
  });

  it("reverts a rejected edit of a synced record to the last confirmed value", async () => {
    const server = newServer();
    const device = await createDevice(server, "device-a");
    const entry_id = await device.store.createRecord("journal_entries", LUNCH_ENTRY);
    await device.engine.syncNow();

    await device.store.updateRecord("journal_entries", entry_id, { amount: -5, item: "fixed" });
    await device.store.updateRecord("journal_entries", entry_id, { amount: -6 });
    await device.engine.syncNow();

    const [reverted_row] = await selectRows(
      device,
      "SELECT amount, item, deleted, field_hlc FROM journal_entries WHERE id = ?",
      [entry_id]
    );
    expect(reverted_row).toMatchObject({ amount: 1200, item: "lunch", deleted: 0 });
    expect(JSON.parse(String(reverted_row.field_hlc)).amount).toBe(
      server.findRecord("journal_entries", entry_id)?.field_hlc.amount
    );
    expect(device.engine.getStatus()).toMatchObject({ pending_count: 0, rejection_count: 1 });
    expect(await selectRows(device, "SELECT COUNT(*) AS shadow_count FROM _shadow")).toEqual([
      { shadow_count: 0 },
    ]);
  });

  it("restores a record whose deletion was rejected", async () => {
    const server = newServer();
    const device_owner = await createDevice(server, "device-owner", USER_ID);
    const entry_id = await device_owner.store.createRecord("journal_entries", LUNCH_ENTRY);
    await device_owner.engine.syncNow();
    // Another member of the same ledger sees the entry but may not delete it.
    const device_member = await createDevice(server, "device-member", OTHER_USER_ID);

    await device_member.store.deleteRecord("journal_entries", entry_id);
    await device_member.engine.syncNow();

    const [restored_row] = await selectRows(
      device_member,
      "SELECT deleted, deleted_at FROM journal_entries WHERE id = ?",
      [entry_id]
    );
    expect(restored_row).toEqual({ deleted: 0, deleted_at: null });
    expect((await device_member.store.listRejections())[0].reason).toBe("FORBIDDEN");
    expect(server.findRecord("journal_entries", entry_id)?.deleted).toBe(false);
  });

  it("resumes an interrupted push without duplicates or lost changes", async () => {
    const server = newServer();
    const device = await createDevice(server, "device-a");
    const entry_id = await device.store.createRecord("journal_entries", LUNCH_ENTRY);
    device.transport.controls.lose_next_push_response = true;

    await device.engine.syncNow();
    expect(device.engine.getStatus()).toMatchObject({ phase: "error", pending_count: 1 });
    expect(device.environment.scheduledDelays()).toEqual([1_500]);

    // The retry sends the same change again; the server sees nothing new.
    device.environment.runTimers();
    await device.engine.syncNow();

    expect(server.listRecords("journal_entries")).toHaveLength(1);
    expect(device.engine.getStatus()).toMatchObject({
      phase: "idle",
      pending_count: 0,
      rejection_count: 0,
    });
    expect(await selectRows(device, "SELECT id, amount FROM journal_entries")).toEqual([
      { id: entry_id, amount: 1200 },
    ]);
  });

  it("keeps an edit made while its push was in flight", async () => {
    const server = newServer();
    const device = await createDevice(server, "device-a");
    const entry_id = await device.store.createRecord("journal_entries", LUNCH_ENTRY);
    await device.engine.syncNow();

    await device.store.updateRecord("journal_entries", entry_id, { amount: 1300 });
    const push_batch = await device.store.buildPushBatch();
    const push_results = server.push(USER_ID, push_batch!.changes);
    device.clock.now_ms += 1;
    await device.store.updateRecord("journal_entries", entry_id, { amount: 1400 });
    await device.store.applyPushResults(push_batch!, push_results);

    expect(await selectRows(device, "SELECT field, value FROM _shadow")).toEqual([
      { field: "amount", value: "1300" },
    ]);
    await device.engine.syncNow();
    expect(server.findRecord("journal_entries", entry_id)?.values.amount).toBe(1400);
    expect(device.engine.getStatus().pending_count).toBe(0);
  });

  it("re-keys a daily note the server merged into an existing one", async () => {
    const server = newServer();
    const device_a = await createDevice(server, "device-a");
    const device_b = await createDevice(server, "device-b");

    const note_a_id = await device_a.store.createRecord("daily_notes", {
      date: "2026-10-05",
      note: "朝: パン",
    });
    const note_b_id = await device_b.store.createRecord("daily_notes", {
      date: "2026-10-05",
      note: "夜: 外食",
    });
    await device_a.engine.syncNow();
    await device_b.engine.syncNow();
    await device_a.engine.syncNow();

    for (const test_device of [device_a, device_b]) {
      expect(
        await selectRows(test_device, "SELECT id, note FROM daily_notes WHERE deleted = 0")
      ).toEqual([{ id: note_a_id, note: "朝: パン\n夜: 外食" }]);
    }
    expect(server.findRecord("daily_notes", note_b_id)).toBeUndefined();

    // Later edits on device B go to the merged record.
    await device_b.store.updateRecord("daily_notes", note_a_id, { note: "まとめ" });
    await device_b.engine.syncNow();
    expect(server.findRecord("daily_notes", note_a_id)?.values.note).toBe("まとめ");
  });

  it("pulls in pages and keeps the cursor in step", async () => {
    const server = newServer();
    for (let entry_index = 0; entry_index < 7; entry_index++) {
      server.writeOnlineRow(
        PERSONAL_LEDGER_ID,
        USER_ID,
        "income_records",
        `0192-income-${entry_index}`,
        {
          earner_id: USER_ID,
          transaction_date: "2026-10-25",
          amount: 1000 + entry_index,
          name: "給与",
          income_type: "salary",
        }
      );
    }
    const device = await createDevice(server, "device-a");

    expect(await selectRows(device, "SELECT COUNT(*) AS income_count FROM income_records")).toEqual(
      [{ income_count: 7 }]
    );
    expect((await device.store.readSyncState()).since).toBe(8);
  });

  it("starts over when the user moves to another ledger", async () => {
    const server = newServer();
    const device = await createDevice(server, "device-a");
    await device.store.createRecord("daily_notes", { date: "2026-10-05", note: "personal" });
    await device.engine.syncNow();

    server.setUserLedger(USER_ID, HOUSEHOLD_LEDGER_ID);
    server.writeOnlineRow(
      HOUSEHOLD_LEDGER_ID,
      OTHER_USER_ID,
      "category_groups",
      "0192-household-group",
      {
        name: "家族",
        statement_type_code: "food",
      }
    );
    await device.engine.syncNow();

    expect(await device.store.readSyncState()).toMatchObject({ ledger_id: HOUSEHOLD_LEDGER_ID });
    expect(
      await selectRows(device, "SELECT COUNT(*) AS category_count FROM expense_categories")
    ).toEqual([{ category_count: 0 }]);
    expect(await selectRows(device, "SELECT id, ledger_id FROM category_groups")).toEqual([
      { id: "0192-household-group", ledger_id: HOUSEHOLD_LEDGER_ID },
    ]);
    expect(await selectRows(device, "SELECT COUNT(*) AS note_count FROM daily_notes")).toEqual([
      { note_count: 0 },
    ]);
  });

  it("wipes another user's data when a different user signs in", async () => {
    const server = newServer();
    const device = await createDevice(server, "device-a");
    await device.store.createRecord("daily_notes", { date: "2026-10-05", note: "mine" });
    device.engine.stop();

    expect(await device.store.bindUser(OTHER_USER_ID)).toBe("reset");
    expect(await selectRows(device, "SELECT COUNT(*) AS note_count FROM daily_notes")).toEqual([
      { note_count: 0 },
    ]);
    expect(await selectRows(device, "SELECT COUNT(*) AS outbox_count FROM _outbox")).toEqual([
      { outbox_count: 0 },
    ]);
    expect(await device.store.readSyncState()).toMatchObject({
      user_id: OTHER_USER_ID,
      ledger_id: null,
      since: 0,
    });
  });

  it("backs off exponentially while the server is unreachable", async () => {
    const server = newServer();
    const device = await createDevice(server, "device-a");
    device.transport.controls.unreachable = true;

    const observed_delays: number[] = [];
    for (let attempt = 0; attempt < 4; attempt++) {
      device.environment.timers.clear();
      await device.engine.syncNow();
      observed_delays.push(...device.environment.scheduledDelays());
    }
    // Jitter is fixed at 0.5: three quarters of 2s, 4s, 8s, 16s.
    expect(observed_delays).toEqual([1_500, 3_000, 6_000, 12_000]);
    expect(device.engine.getStatus().phase).toBe("error");

    device.transport.controls.unreachable = false;
    await device.engine.syncNow();
    expect(device.engine.getStatus()).toMatchObject({ phase: "idle", last_error: null });
    expect(device.environment.scheduledDelays()).toEqual([5 * 60_000]);
  });

  it("stops on a client error and on update required", async () => {
    const server = newServer();
    for (const [thrown_error, expected_phase] of [
      [new SyncClientError(413, "too large"), "error"],
      [new SyncUpdateRequiredError(), "update_required"],
    ] as const) {
      const device = await createDevice(server, `device-${expected_phase}`);
      device.transport.pull = async () => {
        throw thrown_error;
      };
      await device.engine.syncNow();
      expect(device.engine.getStatus()).toMatchObject({ phase: expected_phase });
      expect(device.environment.scheduledDelays()).toEqual([]);
      device.environment.wake();
      await device.engine.syncNow();
      expect(device.engine.getStatus().phase).toBe(expected_phase);
    }
  });
});

describe("SyncEngine.runCommand", () => {
  it("applies the returned row and pulls right away", async () => {
    const server = newServer();
    const device = await createDevice(server, "device-a");
    const transport: SyncTransport = device.transport;
    transport.sendCommand = async () =>
      server.writeOnlineRow(PERSONAL_LEDGER_ID, USER_ID, "savings_goals", "0192-goal", {
        name: "旅行",
        monthly_amount: 10000,
        target_amount: 100000,
      });

    const written_row = await device.engine.runCommand(() =>
      transport.sendCommand("POST", "/ledger/savings-goals")
    );

    expect(written_row.id).toBe("0192-goal");
    expect(await selectRows(device, "SELECT name FROM savings_goals")).toEqual([{ name: "旅行" }]);
    expect((await device.store.readSyncState()).since).toBe(written_row.seq);
  });

  it("reports offline as soon as the browser loses the connection", async () => {
    const server = newServer();
    const device = await createDevice(server, "device-a");
    await device.engine.syncNow();
    expect(device.engine.getStatus().phase).toBe("idle");

    device.environment.setOnline(false);

    await vi.waitFor(() => expect(device.engine.getStatus().phase).toBe("offline"));
  });

  it("refuses online-only edits while offline", async () => {
    const server = newServer();
    const device = await createDevice(server, "device-a");
    device.environment.online = false;
    let command_sent = false;

    await expect(
      device.engine.runCommand(async () => {
        command_sent = true;
        throw new Error("unreachable");
      })
    ).rejects.toBeInstanceOf(OfflineError);
    expect(command_sent).toBe(false);
  });
});
