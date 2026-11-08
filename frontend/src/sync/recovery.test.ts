// @vitest-environment node
import type { LocalDb, RecoverableLocalDb } from "../db/client";
import { pushOutboxAndRecreate } from "./recovery";
import { SyncStore } from "./store";
import { FakeSyncServer } from "./testing/fakeSyncServer";
import { openMemorySyncDb, type MemorySyncDb } from "./testing/memoryDb";

const USER_ID = 7;
const LEDGER_ID = "01920000-0000-7000-8000-000000000001";

const opened_dbs: MemorySyncDb[] = [];

afterEach(() => {
  for (const opened_db of opened_dbs.splice(0)) opened_db.close();
});

async function oldDatabaseWithPendingNotes(note_count: number): Promise<MemorySyncDb> {
  const old_db = await openMemorySyncDb("old-device");
  opened_dbs.push(old_db);
  await old_db.batch([
    { sql: "UPDATE _sync_state SET user_id = ?, ledger_id = ?", bind: [USER_ID, LEDGER_ID] },
  ]);
  const old_store = new SyncStore(old_db);
  for (let note_index = 0; note_index < note_count; note_index++) {
    await old_store.createRecord("daily_notes", {
      date: `2026-10-0${note_index + 1}`,
      note: `note ${note_index}`,
    });
  }
  return old_db;
}

function asRecoverable(old_db: MemorySyncDb, recreate: () => Promise<LocalDb>): RecoverableLocalDb {
  return {
    select: old_db.select,
    batch: old_db.batch,
    recreate,
    close: async () => old_db.close(),
  };
}

describe("pushOutboxAndRecreate", () => {
  it("pushes pending changes before recreating the database", async () => {
    const server = new FakeSyncServer();
    server.setUserLedger(USER_ID, LEDGER_ID);
    const old_db = await oldDatabaseWithPendingNotes(2);
    const recreate = vi.fn(async () => ({ schema_version: 2 }) as LocalDb);

    const { local_db, recovery_report } = await pushOutboxAndRecreate(
      asRecoverable(old_db, recreate),
      server.transportFor(USER_ID)
    );

    expect(local_db.schema_version).toBe(2);
    expect(recovery_report).toEqual({ pushed_change_count: 2, rejected_changes: [] });
    expect(
      server
        .listRecords("daily_notes")
        .map((server_record) => server_record.values.note)
        .sort()
    ).toEqual(["note 0", "note 1"]);
    expect(recreate).toHaveBeenCalledTimes(1);
  });

  it("keeps the old database when the push fails", async () => {
    const server = new FakeSyncServer();
    server.setUserLedger(USER_ID, LEDGER_ID);
    const old_db = await oldDatabaseWithPendingNotes(1);
    const recreate = vi.fn(async () => ({ schema_version: 2 }) as LocalDb);
    const transport = server.transportFor(USER_ID);
    transport.controls.unreachable = true;

    await expect(
      pushOutboxAndRecreate(asRecoverable(old_db, recreate), transport)
    ).rejects.toThrow();

    expect(recreate).not.toHaveBeenCalled();
    expect(await old_db.select("SELECT COUNT(*) AS outbox_count FROM _outbox")).toEqual([
      { outbox_count: 2 },
    ]);
  });

  it("reports rejected changes, which the new database can't hold", async () => {
    const server = new FakeSyncServer();
    server.setUserLedger(USER_ID, LEDGER_ID);
    const old_db = await oldDatabaseWithPendingNotes(0);
    await new SyncStore(old_db).createRecord("daily_notes", {
      date: "2026-10-01",
      note: "x".repeat(501),
    });
    const recreate = vi.fn(async () => ({ schema_version: 2 }) as LocalDb);

    const { recovery_report } = await pushOutboxAndRecreate(
      asRecoverable(old_db, recreate),
      server.transportFor(USER_ID)
    );

    expect(recovery_report.rejected_changes).toMatchObject([
      { collection: "daily_notes", reason: "INVALID" },
    ]);
    expect(recreate).toHaveBeenCalledTimes(1);
  });
});
