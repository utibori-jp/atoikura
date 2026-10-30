import {
  putJournalEntry,
  seedPersonalLedger,
  SUPERMARKET_CATEGORY_ID,
  TestLedgerServer,
} from "../test/ledgerFixtures";
import { openSyncedSession } from "../test/renderWithLedger";
import {
  createJournalEntry,
  deleteJournalEntry,
  listCategoryGroups,
  listExpenseCategories,
  listJournalDays,
  updateJournalEntry,
  type JournalEntryFields,
} from "./journal";

const OTHER_MEMBER_ID = 2;
const DELETED_CATEGORY_ID = "01920000-0000-7000-8000-000000000299";
const RECURRING_EXPENSE_ID = "01920000-0000-7000-8000-000000000401";

function entryFields(field_overrides: Partial<JournalEntryFields> = {}): JournalEntryFields {
  return {
    transaction_date: "2026-10-05",
    amount: 1200,
    category_id: SUPERMARKET_CATEGORY_ID,
    is_excluded: false,
    item: "パン",
    note: null,
    ...field_overrides,
  };
}

async function openLedger() {
  const ledger_server = new TestLedgerServer();
  seedPersonalLedger(ledger_server);
  return { ledger_server, ...(await openSyncedSession(ledger_server)) };
}

async function listOutboxFields(local_db: { select: (sql: string) => Promise<unknown[]> }) {
  return local_db.select("SELECT record_id, field FROM _outbox ORDER BY field");
}

describe("journal data", () => {
  it("lists the month's entries by day, newest first, with their category names", async () => {
    const ledger_server = new TestLedgerServer();
    seedPersonalLedger(ledger_server);
    const older_entry_id = putJournalEntry(ledger_server, {
      transaction_date: "2026-10-01",
      amount: 500,
    });
    const newer_entry_id = putJournalEntry(ledger_server, {
      transaction_date: "2026-10-03",
      amount: 800,
      recurring_expense_id: RECURRING_EXPENSE_ID,
    });
    putJournalEntry(ledger_server, { transaction_date: "2026-09-30", amount: 900 });
    const { ledger_data } = await openSyncedSession(ledger_server);

    const journal_days = await listJournalDays(ledger_data, "2026-10");

    expect(journal_days.map((journal_day) => journal_day.date)).toEqual([
      "2026-10-03",
      "2026-10-01",
    ]);
    expect(journal_days[0].journal_entries[0]).toMatchObject({
      id: newer_entry_id,
      amount: 800,
      category_name: "スーパー",
      group_name: "食費",
      statement_type_code: "food",
      is_recurring: true,
      can_edit: true,
    });
    expect(journal_days[1].journal_entries[0]).toMatchObject({
      id: older_entry_id,
      is_recurring: false,
    });
  });

  it("lets only the author edit an entry, except shared recurring postings", async () => {
    const ledger_server = new TestLedgerServer();
    seedPersonalLedger(ledger_server);
    putJournalEntry(
      ledger_server,
      { transaction_date: "2026-10-01", amount: 500 },
      OTHER_MEMBER_ID
    );
    putJournalEntry(
      ledger_server,
      { transaction_date: "2026-10-02", amount: 700, recurring_expense_id: RECURRING_EXPENSE_ID },
      OTHER_MEMBER_ID
    );
    const { ledger_data } = await openSyncedSession(ledger_server);

    const journal_days = await listJournalDays(ledger_data, "2026-10");

    expect(
      journal_days.map((journal_day) => [journal_day.date, journal_day.journal_entries[0].can_edit])
    ).toEqual([
      ["2026-10-02", true],
      ["2026-10-01", false],
    ]);
  });

  it("lists active category groups and categories from the synced cache", async () => {
    const { ledger_data } = await openLedger();

    expect(await listCategoryGroups(ledger_data)).toEqual([
      {
        id: expect.any(String),
        group_name: "食費",
        statement_type: { id: 1, type_code: "food", statement_type_name: "食費" },
        description: null,
      },
    ]);
    expect(await listExpenseCategories(ledger_data)).toMatchObject([
      { id: SUPERMARKET_CATEGORY_ID, category_name: "スーパー", group_name: "食費" },
    ]);
  });

  it("stores a new entry in the ledger wallet and queues it for push", async () => {
    const { ledger_data, local_db } = await openLedger();

    const entry_id = await createJournalEntry(ledger_data, entryFields());

    expect(
      await local_db.select(
        "SELECT wallet, transaction_date, amount, is_excluded, item, owner_id FROM journal_entries WHERE id = ?",
        [entry_id]
      )
    ).toEqual([
      {
        wallet: "ledger",
        transaction_date: "2026-10-05",
        amount: 1200,
        is_excluded: 0,
        item: "パン",
        owner_id: 1,
      },
    ]);
    expect(await ledger_data.store.countPendingRecords()).toBe(1);
  });

  it("refuses an entry the server would reject, before storing anything", async () => {
    const { ledger_data } = await openLedger();

    await expect(createJournalEntry(ledger_data, entryFields({ amount: 0 }))).rejects.toThrow(
      "amountは正の整数である必要があります"
    );
    await expect(
      createJournalEntry(ledger_data, entryFields({ category_id: DELETED_CATEGORY_ID }))
    ).rejects.toThrow("指定されたcategory_idは存在しません");
    await expect(
      createJournalEntry(ledger_data, entryFields({ item: "あ".repeat(101) }))
    ).rejects.toThrow("itemは100文字以内で入力してください");
    expect(await ledger_data.store.countPendingRecords()).toBe(0);
  });

  it("queues only the fields an edit changed", async () => {
    const ledger_server = new TestLedgerServer();
    seedPersonalLedger(ledger_server);
    const entry_id = putJournalEntry(ledger_server, {
      transaction_date: "2026-10-05",
      amount: 1200,
      item: "パン",
    });
    const { ledger_data, local_db } = await openSyncedSession(ledger_server);

    await updateJournalEntry(ledger_data, entry_id, entryFields({ amount: 1500 }));

    expect(await listOutboxFields(local_db)).toEqual([{ record_id: entry_id, field: "amount" }]);
  });

  it("deletes an entry as a tombstone that is pushed", async () => {
    const { ledger_data, local_db } = await openLedger();
    const entry_id = await createJournalEntry(ledger_data, entryFields());

    await deleteJournalEntry(ledger_data, entry_id);

    expect(await listJournalDays(ledger_data, "2026-10")).toEqual([]);
    expect(
      await local_db.select("SELECT deleted FROM journal_entries WHERE id = ?", [entry_id])
    ).toEqual([{ deleted: 1 }]);
  });
});
