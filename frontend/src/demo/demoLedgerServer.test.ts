import type { PulledRow } from "../sync/wire";
import { DemoLedgerServer, type DemoStorage } from "./demoLedgerServer";
import { DEMO_LEDGER_ID } from "./demoSeed";

class MemoryStorage implements DemoStorage {
  readonly values = new Map<string, string>();
  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

const TODAY = "2026-10-15";

function pullAll(demo_server: DemoLedgerServer, since = 0): PulledRow[] {
  return demo_server.pull(since, 10_000).rows;
}

function liveRows(demo_server: DemoLedgerServer, collection: string): PulledRow[] {
  return pullAll(demo_server).filter(
    (pulled_row) => pulled_row.collection === collection && !pulled_row.deleted
  );
}

function rowBody(command_body: unknown): PulledRow {
  return command_body as PulledRow;
}

describe("DemoLedgerServer", () => {
  it("serves the sample ledger anchored to the current month", () => {
    const demo_server = new DemoLedgerServer(new MemoryStorage(), TODAY);
    const pull_page = demo_server.pull(0, 10_000);

    expect(pull_page.ledger_id).toBe(DEMO_LEDGER_ID);
    expect(liveRows(demo_server, "category_groups")).toHaveLength(3);
    expect(liveRows(demo_server, "expense_categories").length).toBeGreaterThan(0);
    const entry_dates = liveRows(demo_server, "journal_entries").map((pulled_row) =>
      String(pulled_row.data.transaction_date)
    );
    expect(entry_dates.some((entry_date) => entry_date.startsWith("2026-10"))).toBe(true);
    // Nothing is dated after today in this month.
    expect(entry_dates.filter((entry_date) => entry_date > TODAY)).toEqual([]);
    expect(liveRows(demo_server, "journal_entries")[0].field_hlc?.amount).toMatch(/-server$/);
  });

  it("pages pull results by seq", () => {
    const demo_server = new DemoLedgerServer(new MemoryStorage(), TODAY);
    const first_page = demo_server.pull(0, 5);
    const second_page = demo_server.pull(first_page.next_since, 5);

    expect(first_page.rows).toHaveLength(5);
    expect(first_page.has_more).toBe(true);
    expect(second_page.rows[0].seq).toBeGreaterThan(first_page.rows[4].seq);
  });

  it("applies pushed changes with field-level last-writer-wins", () => {
    const demo_server = new DemoLedgerServer(new MemoryStorage(), TODAY);
    const since = demo_server.pull(0, 10_000).next_since;
    const [created_result] = demo_server.push([
      {
        collection: "daily_notes",
        id: "01920000-0000-7000-8000-0000000000aa",
        fields: {
          date: { value: "2026-10-14", hlc: "1792915200000-0000-device" },
          note: { value: "新しいメモ", hlc: "1792915200000-0000-device" },
        },
      },
    ]);
    const [stale_result] = demo_server.push([
      {
        collection: "daily_notes",
        id: "01920000-0000-7000-8000-0000000000aa",
        fields: { note: { value: "古い編集", hlc: "1792915100000-0000-device" } },
      },
    ]);

    expect(created_result).toMatchObject({ status: "applied" });
    expect(stale_result).toMatchObject({ status: "applied", superseded: ["note"] });
    const [pulled_note] = pullAll(demo_server, since);
    expect(pulled_note.data.note).toBe("新しいメモ");
  });

  it("deletes a pushed tombstone and rejects online-only collections", () => {
    const demo_server = new DemoLedgerServer(new MemoryStorage(), TODAY);
    const seeded_entry = liveRows(demo_server, "journal_entries")[0];
    const push_results = demo_server.push([
      {
        collection: "journal_entries",
        id: seeded_entry.id,
        fields: {},
        deleted_hlc: "9999999999999-0000-device",
      },
      { collection: "savings_goals", id: "x", fields: {} },
    ]);

    expect(push_results[0].status).toBe("applied");
    expect(push_results[1]).toMatchObject({ status: "rejected", reason: "UNKNOWN_COLLECTION" });
    expect(liveRows(demo_server, "journal_entries").map((row) => row.id)).not.toContain(
      seeded_entry.id
    );
  });

  it("creates, updates and deletes rows through ledger commands", () => {
    const demo_server = new DemoLedgerServer(new MemoryStorage(), TODAY);
    const created = demo_server.runCommand("POST", "savings-goals", {
      name: "車",
      emoji: "🚗",
      monthly_amount: 10000,
      target_amount: 500000,
      deadline: null,
      memo: "",
    });
    const goal_id = rowBody(created.body).id;
    const updated = demo_server.runCommand("PUT", `savings-goals/${goal_id}`, {
      name: "新車",
      emoji: "🚗",
      monthly_amount: 15000,
      target_amount: 500000,
      deadline: null,
      memo: "",
    });
    const deleted = demo_server.runCommand("DELETE", `savings-goals/${goal_id}`, {});

    expect(created.http_status).toBe(201);
    expect(rowBody(updated.body).data).toMatchObject({ name: "新車", monthly_amount: 15000 });
    expect(rowBody(deleted.body).deleted).toBe(true);
    expect(demo_server.runCommand("DELETE", `savings-goals/${goal_id}`, {}).http_status).toBe(404);
  });

  it("posts a recurring expense once per month on its billing day", () => {
    const demo_server = new DemoLedgerServer(new MemoryStorage(), TODAY);
    const electricity = liveRows(demo_server, "recurring_expenses").find(
      (pulled_row) => pulled_row.data.name === "電気代"
    )!;
    const confirmed = demo_server.runCommand(
      "POST",
      `recurring-expenses/${electricity.id}/confirm`,
      {
        amount: 9100,
        year_month: "2026-10",
      }
    );
    const confirmed_again = demo_server.runCommand(
      "POST",
      `recurring-expenses/${electricity.id}/confirm`,
      { amount: 9100, year_month: "2026-10" }
    );

    expect(confirmed.http_status).toBe(201);
    expect(rowBody(confirmed.body)).toMatchObject({
      collection: "journal_entries",
      data: { transaction_date: "2026-10-18", amount: 9100, recurring_year_month: "2026-10" },
    });
    expect(confirmed_again.http_status).toBe(409);
  });

  it("refuses to delete a category group that still has categories", () => {
    const demo_server = new DemoLedgerServer(new MemoryStorage(), TODAY);
    const [food_group] = liveRows(demo_server, "category_groups");

    const delete_result = demo_server.runCommand("DELETE", `category-groups/${food_group.id}`, {});

    expect(delete_result.http_status).toBe(400);
  });

  it("keeps changes across reloads within the month", () => {
    const demo_storage = new MemoryStorage();
    const first_visit = new DemoLedgerServer(demo_storage, TODAY);
    first_visit.runCommand("PUT", "base-income", { amount: 400000 });

    const reloaded = new DemoLedgerServer(demo_storage, "2026-10-20");

    expect(liveRows(reloaded, "base_incomes")[0].data.amount).toBe(400000);
    expect(reloaded.pull(0, 10_000).next_since).toBe(first_visit.pull(0, 10_000).next_since);
  });

  it("starts a new month from fresh sample data and retires the old rows", () => {
    const demo_storage = new MemoryStorage();
    const october_visit = new DemoLedgerServer(demo_storage, TODAY);
    const october_cursor = october_visit.pull(0, 10_000).next_since;
    const created = october_visit.runCommand("POST", "savings-goals", {
      name: "車",
      emoji: "🚗",
      monthly_amount: 10000,
      target_amount: 500000,
      deadline: null,
      memo: "",
    });

    const november_visit = new DemoLedgerServer(demo_storage, "2026-11-02");
    const delivered_rows = pullAll(november_visit, october_cursor);

    expect(
      delivered_rows.find((pulled_row) => pulled_row.id === rowBody(created.body).id)?.deleted
    ).toBe(true);
    const entry_dates = liveRows(november_visit, "journal_entries").map((pulled_row) =>
      String(pulled_row.data.transaction_date)
    );
    expect(entry_dates.some((entry_date) => entry_date.startsWith("2026-11"))).toBe(true);
  });
});
