// In-browser stand-in for the sync server of the static demo (#142, #201). It
// answers push, pull and the online-only ledger commands for the single demo
// user, so the demo runs the real local DB, sync engine and screens with no
// backend. State is kept in localStorage: a reload keeps the visitor's changes,
// and a new month starts over from fresh sample data.
import { formatHlc } from "../sync/hlc";
import { OFFLINE_COLLECTIONS, isOfflineCollection } from "../sync/collections";
import { uuidv7 } from "../sync/uuid";
import type { PullPage, PulledRow, PushChange, PushResult } from "../sync/wire";
import { daysInMonth } from "../logic";
import { buildDemoSeedRows, DEMO_LEDGER_ID, DEMO_USER_ID } from "./demoSeed";

export interface DemoStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface DemoServerState {
  version: number;
  seed_year_month: string;
  last_seq: number;
  rows: PulledRow[];
}

export interface DemoCommandResult {
  http_status: number;
  body: PulledRow | { code: string; message: string };
}

const STATE_STORAGE_KEY = "atoikura.demo_ledger_server";
const STATE_VERSION = 1;
const SERVER_HLC_DEVICE = "server";

// The ledger command paths (sync-api.yaml, /ledger/*) and the collections they write.
const COMMAND_COLLECTIONS: Record<string, string> = {
  "category-groups": "category_groups",
  "expense-categories": "expense_categories",
  "income-records": "income_records",
  "recurring-expenses": "recurring_expenses",
  "savings-goals": "savings_goals",
  "surplus-allocations": "surplus_allocations",
};

const NOT_FOUND_MESSAGES: Record<string, string> = {
  category_groups: "大分類が見つかりません",
  expense_categories: "生活区分が見つかりません",
  income_records: "収入が見つかりません",
  recurring_expenses: "定期支出が見つかりません",
  savings_goals: "貯金目標が見つかりません",
};

function commandError(http_status: number, code: string, message: string): DemoCommandResult {
  return { http_status, body: { code, message } };
}

export class DemoLedgerServer {
  private readonly storage: DemoStorage | null;
  private state: DemoServerState;

  constructor(storage: DemoStorage | null, today_jst: string) {
    this.storage = storage;
    const current_month = today_jst.slice(0, 7);
    const stored_state = this.readStoredState();
    if (stored_state?.seed_year_month === current_month) {
      this.state = stored_state;
      return;
    }
    this.state = stored_state ?? {
      version: STATE_VERSION,
      seed_year_month: current_month,
      last_seq: 0,
      rows: [],
    };
    // A new month: retire last month's sample (and the visitor's changes to it)
    // and start from fresh rows; pull delivers both the deletes and the new rows.
    for (const stored_row of this.state.rows) {
      if (!stored_row.deleted && stored_row.collection !== "ledgers") {
        this.replaceRow({ ...stored_row, deleted: true });
      }
    }
    this.state.seed_year_month = current_month;
    for (const seed_row of buildDemoSeedRows(today_jst)) {
      const server_hlc = this.serverHlc();
      this.replaceRow({
        collection: seed_row.collection,
        id: seed_row.id,
        owner_id: DEMO_USER_ID,
        seq: 0,
        deleted: false,
        data: seed_row.data,
        ...(isOfflineCollection(seed_row.collection)
          ? { field_hlc: this.fieldHlcFor(seed_row.collection, server_hlc) }
          : {}),
      });
    }
    this.persist();
  }

  private readStoredState(): DemoServerState | null {
    try {
      const stored_json = this.storage?.getItem(STATE_STORAGE_KEY);
      if (!stored_json) return null;
      const stored_state = JSON.parse(stored_json) as DemoServerState;
      return stored_state.version === STATE_VERSION ? stored_state : null;
    } catch {
      return null;
    }
  }

  private persist(): void {
    try {
      this.storage?.setItem(STATE_STORAGE_KEY, JSON.stringify(this.state));
    } catch {
      // Storage unavailable or full: the demo keeps working until a reload.
    }
  }

  private serverHlc(): string {
    return formatHlc(Date.now(), 0, SERVER_HLC_DEVICE);
  }

  private fieldHlcFor(collection: string, server_hlc: string): Record<string, string> {
    if (!isOfflineCollection(collection)) return {};
    return Object.fromEntries(
      Object.keys(OFFLINE_COLLECTIONS[collection].fields).map((field_name) => [
        field_name,
        server_hlc,
      ])
    );
  }

  // Stores a new version of a row under the next seq and returns it.
  private replaceRow(next_row: PulledRow): PulledRow {
    this.state.last_seq += 1;
    const stored_row: PulledRow = { ...next_row, seq: this.state.last_seq };
    const existing_index = this.state.rows.findIndex(
      (state_row) =>
        state_row.collection === stored_row.collection && state_row.id === stored_row.id
    );
    if (existing_index >= 0) this.state.rows[existing_index] = stored_row;
    else this.state.rows.push(stored_row);
    return stored_row;
  }

  private findRow(collection: string, id: string): PulledRow | undefined {
    return this.state.rows.find(
      (state_row) =>
        state_row.collection === collection && state_row.id === id && !state_row.deleted
    );
  }

  pull(since: number, limit: number): PullPage {
    const new_rows = this.state.rows
      .filter((state_row) => state_row.seq > since)
      .sort((left_row, right_row) => left_row.seq - right_row.seq);
    const page_rows = new_rows.slice(0, limit);
    return {
      ledger_id: DEMO_LEDGER_ID,
      rows: page_rows,
      next_since: page_rows.length > 0 ? page_rows[page_rows.length - 1].seq : since,
      has_more: new_rows.length > limit,
    };
  }

  // Field-level last-writer-wins, as the real server; the demo has one user on
  // one device, so ownership and natural-key merges never come up.
  push(changes: PushChange[]): PushResult[] {
    const push_results = changes.map((push_change) => this.pushChange(push_change));
    this.persist();
    return push_results;
  }

  private pushChange(push_change: PushChange): PushResult {
    if (!isOfflineCollection(push_change.collection)) {
      return {
        id: push_change.id,
        status: "rejected",
        reason: "UNKNOWN_COLLECTION",
        message: "unknown collection",
      };
    }
    const changed_fields = Object.keys(push_change.fields);
    const stored_row = this.state.rows.find(
      (state_row) =>
        state_row.collection === push_change.collection && state_row.id === push_change.id
    );
    if (stored_row?.deleted) {
      return { id: push_change.id, status: "applied", superseded: changed_fields };
    }
    if (push_change.deleted_hlc) {
      if (!stored_row) return { id: push_change.id, status: "applied", superseded: changed_fields };
      const deleted_row = this.replaceRow({ ...stored_row, deleted: true });
      return { id: push_change.id, status: "applied", seq: deleted_row.seq };
    }
    const next_data: Record<string, unknown> = stored_row
      ? { ...stored_row.data }
      : { created_at: new Date().toISOString() };
    const next_field_hlc: Record<string, string> = { ...(stored_row?.field_hlc ?? {}) };
    const superseded: string[] = [];
    for (const field_name of changed_fields) {
      const incoming_field = push_change.fields[field_name];
      if (incoming_field.hlc <= (next_field_hlc[field_name] ?? "")) {
        superseded.push(field_name);
        continue;
      }
      next_data[field_name] = incoming_field.value;
      next_field_hlc[field_name] = incoming_field.hlc;
    }
    if (stored_row && superseded.length === changed_fields.length) {
      return { id: push_change.id, status: "applied", superseded };
    }
    const written_row = this.replaceRow({
      collection: push_change.collection,
      id: push_change.id,
      owner_id: DEMO_USER_ID,
      seq: 0,
      deleted: false,
      data: next_data,
      field_hlc: next_field_hlc,
    });
    return {
      id: push_change.id,
      status: "applied",
      seq: written_row.seq,
      ...(superseded.length > 0 ? { superseded } : {}),
    };
  }

  // Runs a ledger command the way the server does, with the checks a visitor
  // can trigger from the screens; field validation is left to the forms.
  runCommand(
    method: string,
    command_path: string,
    request_body: Record<string, unknown>
  ): DemoCommandResult {
    const command_result = this.writeCommand(method, command_path, request_body);
    this.persist();
    return command_result;
  }

  private writeOnlineRow(
    collection: string,
    id: string,
    data: Record<string, unknown>,
    http_status: number
  ): DemoCommandResult {
    const existing_row = this.findRow(collection, id);
    const written_row = this.replaceRow({
      collection,
      id,
      owner_id: existing_row?.owner_id ?? DEMO_USER_ID,
      seq: 0,
      deleted: false,
      data: { created_at: new Date().toISOString(), ...existing_row?.data, ...data },
    });
    return { http_status, body: written_row };
  }

  private writeCommand(
    method: string,
    command_path: string,
    request_body: Record<string, unknown>
  ): DemoCommandResult {
    if (command_path === "base-income" && method === "PUT") {
      const base_income_row = this.state.rows.find(
        (state_row) =>
          state_row.collection === "base_incomes" &&
          !state_row.deleted &&
          state_row.data.member_id === DEMO_USER_ID
      );
      return this.writeOnlineRow(
        "base_incomes",
        base_income_row?.id ?? uuidv7(),
        { member_id: DEMO_USER_ID, amount: request_body.amount },
        200
      );
    }
    const [path_collection, record_id, action_name] = command_path.split("/");
    if (
      path_collection === "recurring-expenses" &&
      action_name === "confirm" &&
      method === "POST"
    ) {
      return this.confirmRecurring(record_id, request_body);
    }
    if (path_collection === "savings-goals" && action_name === "postings" && method === "POST") {
      if (!this.findRow("savings_goals", record_id)) {
        return commandError(404, "NOT_FOUND", NOT_FOUND_MESSAGES.savings_goals);
      }
      return this.writeOnlineRow(
        "savings_postings",
        uuidv7(),
        {
          goal_id: record_id,
          year_month: request_body.year_month,
          amount: request_body.amount,
          kind: "manual",
        },
        201
      );
    }
    const collection = COMMAND_COLLECTIONS[path_collection];
    if (!collection || action_name !== undefined) {
      return commandError(404, "NOT_FOUND", "見つかりません");
    }
    if (method === "POST" && record_id === undefined) {
      const extra_fields = collection === "income_records" ? { earner_id: DEMO_USER_ID } : {};
      const category_error = this.checkReferences(collection, request_body);
      if (category_error) return category_error;
      return this.writeOnlineRow(collection, uuidv7(), { ...extra_fields, ...request_body }, 201);
    }
    const existing_row = record_id === undefined ? undefined : this.findRow(collection, record_id);
    if (!existing_row) {
      return commandError(404, "NOT_FOUND", NOT_FOUND_MESSAGES[collection] ?? "見つかりません");
    }
    if (method === "PUT") {
      if (collection === "recurring_expenses" && request_body.wallet !== existing_row.data.wallet) {
        return commandError(400, "BAD_REQUEST", "walletは変更できません");
      }
      const category_error = this.checkReferences(collection, request_body);
      if (category_error) return category_error;
      return this.writeOnlineRow(collection, existing_row.id, request_body, 200);
    }
    if (method === "DELETE") {
      if (
        collection === "category_groups" &&
        this.state.rows.some(
          (state_row) =>
            state_row.collection === "expense_categories" &&
            !state_row.deleted &&
            state_row.data.group_id === existing_row.id
        )
      ) {
        return commandError(400, "BAD_REQUEST", "紐づく生活区分が存在するため削除できません");
      }
      return { http_status: 200, body: this.replaceRow({ ...existing_row, deleted: true }) };
    }
    return commandError(404, "NOT_FOUND", "見つかりません");
  }

  private checkReferences(
    collection: string,
    request_body: Record<string, unknown>
  ): DemoCommandResult | null {
    if (
      collection === "expense_categories" &&
      !this.findRow("category_groups", String(request_body.group_id))
    ) {
      return commandError(400, "BAD_REQUEST", "指定した大分類が見つかりません");
    }
    if (
      collection === "recurring_expenses" &&
      !this.findRow("expense_categories", String(request_body.category_id))
    ) {
      return commandError(400, "BAD_REQUEST", "指定されたcategory_idは存在しません");
    }
    return null;
  }

  // Posts a recurring expense for a month as a journal entry on its billing day.
  private confirmRecurring(
    recurring_id: string,
    request_body: Record<string, unknown>
  ): DemoCommandResult {
    const recurring_row = this.findRow("recurring_expenses", recurring_id);
    if (!recurring_row) {
      return commandError(404, "NOT_FOUND", NOT_FOUND_MESSAGES.recurring_expenses);
    }
    const year_month = String(request_body.year_month);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(year_month)) {
      return commandError(400, "BAD_REQUEST", "year_monthはYYYY-MM形式で指定してください");
    }
    const already_posted = this.state.rows.some(
      (state_row) =>
        state_row.collection === "journal_entries" &&
        state_row.data.recurring_expense_id === recurring_id &&
        state_row.data.recurring_year_month === year_month
    );
    if (already_posted) return commandError(409, "CONFLICT", "当月分は既に確定済みです");
    const billing_day = Math.min(Number(recurring_row.data.billing_day), daysInMonth(year_month));
    const written_row = this.replaceRow({
      collection: "journal_entries",
      id: uuidv7(),
      owner_id: DEMO_USER_ID,
      seq: 0,
      deleted: false,
      data: {
        created_at: new Date().toISOString(),
        wallet: recurring_row.data.wallet,
        transaction_date: `${year_month}-${String(billing_day).padStart(2, "0")}`,
        item: recurring_row.data.name,
        amount: request_body.amount,
        is_excluded: false,
        category_id: recurring_row.data.category_id,
        note: null,
        recurring_expense_id: recurring_id,
        recurring_year_month: year_month,
      },
      field_hlc: this.fieldHlcFor("journal_entries", this.serverHlc()),
    });
    return { http_status: 201, body: written_row };
  }
}
