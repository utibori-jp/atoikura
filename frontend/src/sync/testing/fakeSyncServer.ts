// Test double of the sync server: push and pull with the same LWW semantics as
// backend/internal/syncrules (tombstones win, field-level HLC comparison,
// natural-key merge of notes), plus just enough validation and ownership checks
// to exercise rejections. One instance is shared by every simulated device.
import { OFFLINE_COLLECTIONS, isOfflineCollection } from "../collections";
import { SyncNetworkError } from "../errors";
import type { SyncTransport } from "../transport";
import type { PullPage, PulledRow, PushChange, PushResult } from "../wire";

interface ServerRecord {
  collection: string;
  id: string;
  ledger_id: string;
  owner_id: number;
  seq: number;
  deleted: boolean;
  values: Record<string, unknown>;
  field_hlc: Record<string, string>;
}

const NATURAL_KEYS: Record<string, string[]> = {
  daily_notes: ["date"],
  monthly_review_notes: ["year_month", "category_id"],
};

export interface FakeTransportControls {
  // The next push is applied on the server, but its response is lost.
  lose_next_push_response: boolean;
  // Every request fails as if the network were down.
  unreachable: boolean;
  push_request_count: number;
}

export class FakeSyncServer {
  private last_seq = 0;
  private readonly records = new Map<string, ServerRecord>();
  private readonly ledger_by_user = new Map<number, string>();

  setUserLedger(user_id: number, ledger_id: string): void {
    this.ledger_by_user.set(user_id, ledger_id);
  }

  private nextSeq(): number {
    this.last_seq += 1;
    return this.last_seq;
  }

  private ledgerOf(user_id: number): string {
    const ledger_id = this.ledger_by_user.get(user_id);
    if (!ledger_id) throw new Error(`user ${user_id} has no ledger`);
    return ledger_id;
  }

  // Writes an online-only row as a ledger command would.
  writeOnlineRow(
    ledger_id: string,
    owner_id: number,
    collection: string,
    id: string,
    values: Record<string, unknown>,
    deleted = false
  ): PulledRow {
    const server_record: ServerRecord = {
      collection,
      id,
      ledger_id,
      owner_id,
      seq: this.nextSeq(),
      deleted,
      values,
      field_hlc: {},
    };
    this.records.set(`${collection}/${id}`, server_record);
    return this.toPulledRow(server_record);
  }

  findRecord(collection: string, id: string): ServerRecord | undefined {
    return this.records.get(`${collection}/${id}`);
  }

  listRecords(collection: string): ServerRecord[] {
    return [...this.records.values()].filter(
      (server_record) => server_record.collection === collection
    );
  }

  push(user_id: number, changes: PushChange[]): PushResult[] {
    const ledger_id = this.ledgerOf(user_id);
    return changes.map((push_change) => this.pushChange(user_id, ledger_id, push_change));
  }

  private pushChange(user_id: number, ledger_id: string, push_change: PushChange): PushResult {
    const reject = (reason: string, message: string): PushResult => ({
      id: push_change.id,
      status: "rejected",
      reason,
      message,
    });
    if (!isOfflineCollection(push_change.collection)) {
      return reject("UNKNOWN_COLLECTION", "unknown collection");
    }
    const collection_spec = OFFLINE_COLLECTIONS[push_change.collection];
    const changed_fields = Object.keys(push_change.fields).sort();
    if (changed_fields.some((field_name) => !Object.hasOwn(collection_spec.fields, field_name))) {
      return reject("UNKNOWN_FIELD", "unknown field");
    }
    const stored_record = this.records.get(`${push_change.collection}/${push_change.id}`);
    if (
      stored_record &&
      (stored_record.ledger_id !== ledger_id || stored_record.owner_id !== user_id)
    ) {
      return reject("FORBIDDEN", "このデータは変更できません");
    }

    if (!stored_record) {
      if (push_change.deleted_hlc)
        return { id: push_change.id, status: "applied", superseded: changed_fields };
      const candidate_values: Record<string, unknown> = {};
      const candidate_hlc: Record<string, string> = {};
      for (const field_name of changed_fields) {
        candidate_values[field_name] = push_change.fields[field_name].value;
        candidate_hlc[field_name] = push_change.fields[field_name].hlc;
      }
      const invalid_message = this.validate(push_change.collection, candidate_values);
      if (invalid_message) return reject("INVALID", invalid_message);

      const natural_key = NATURAL_KEYS[push_change.collection];
      if (natural_key) {
        const duplicate_record = [...this.records.values()].find(
          (server_record) =>
            server_record.collection === push_change.collection &&
            !server_record.deleted &&
            server_record.ledger_id === ledger_id &&
            server_record.owner_id === user_id &&
            natural_key.every(
              (key_field) => server_record.values[key_field] === candidate_values[key_field]
            )
        );
        if (duplicate_record) {
          const existing_text = String(duplicate_record.values.note ?? "");
          const incoming_text = String(candidate_values.note ?? "");
          if (incoming_text !== "" && incoming_text !== existing_text) {
            duplicate_record.values.note =
              existing_text === "" ? incoming_text : `${existing_text}\n${incoming_text}`;
            if (candidate_hlc.note > (duplicate_record.field_hlc.note ?? "")) {
              duplicate_record.field_hlc.note = candidate_hlc.note;
            }
            duplicate_record.seq = this.nextSeq();
          }
          return {
            id: push_change.id,
            status: "applied",
            merged_into: duplicate_record.id,
            seq: duplicate_record.seq,
          };
        }
      }
      const created_record: ServerRecord = {
        collection: push_change.collection,
        id: push_change.id,
        ledger_id,
        owner_id: user_id,
        seq: this.nextSeq(),
        deleted: false,
        values: candidate_values,
        field_hlc: candidate_hlc,
      };
      this.records.set(`${push_change.collection}/${push_change.id}`, created_record);
      return { id: push_change.id, status: "applied", seq: created_record.seq };
    }

    for (const field_name of changed_fields) {
      if (
        (collection_spec.immutable as string[]).includes(field_name) &&
        push_change.fields[field_name].value !== stored_record.values[field_name]
      ) {
        return reject("IMMUTABLE", `${field_name}は変更できません`);
      }
    }
    if (stored_record.deleted)
      return { id: push_change.id, status: "applied", superseded: changed_fields };
    if (push_change.deleted_hlc) {
      stored_record.deleted = true;
      stored_record.seq = this.nextSeq();
      return {
        id: push_change.id,
        status: "applied",
        superseded: changed_fields,
        seq: stored_record.seq,
      };
    }
    const candidate_values = { ...stored_record.values };
    const candidate_hlc = { ...stored_record.field_hlc };
    const superseded: string[] = [];
    for (const field_name of changed_fields) {
      const incoming_field = push_change.fields[field_name];
      if (incoming_field.hlc <= (stored_record.field_hlc[field_name] ?? "")) {
        superseded.push(field_name);
        continue;
      }
      candidate_values[field_name] = incoming_field.value;
      candidate_hlc[field_name] = incoming_field.hlc;
    }
    if (superseded.length === changed_fields.length) {
      return { id: push_change.id, status: "applied", superseded };
    }
    const invalid_message = this.validate(push_change.collection, candidate_values);
    if (invalid_message) return reject("INVALID", invalid_message);
    stored_record.values = candidate_values;
    stored_record.field_hlc = candidate_hlc;
    stored_record.seq = this.nextSeq();
    return {
      id: push_change.id,
      status: "applied",
      seq: stored_record.seq,
      ...(superseded.length > 0 ? { superseded } : {}),
    };
  }

  private validate(collection: string, candidate_values: Record<string, unknown>): string | null {
    if (collection === "journal_entries") {
      const amount = candidate_values.amount;
      if (typeof amount !== "number" || !Number.isInteger(amount) || amount < 1) {
        return "amountは正の整数である必要があります";
      }
      if (typeof candidate_values.is_excluded !== "boolean") return "is_excludedは必須です";
    }
    if (typeof candidate_values.note === "string" && candidate_values.note.length > 500) {
      return "noteは500文字以内で入力してください";
    }
    return null;
  }

  private isVisible(user_id: number, server_record: ServerRecord): boolean {
    if (server_record.ledger_id !== this.ledgerOf(user_id)) return false;
    if (server_record.collection === "journal_entries") {
      return server_record.values.wallet === "ledger" || server_record.owner_id === user_id;
    }
    if (
      server_record.collection === "daily_notes" ||
      server_record.collection === "monthly_review_notes"
    ) {
      return server_record.owner_id === user_id;
    }
    return true;
  }

  private toPulledRow(server_record: ServerRecord): PulledRow {
    const pulled_row: PulledRow = {
      collection: server_record.collection,
      id: server_record.id,
      owner_id: server_record.owner_id,
      seq: server_record.seq,
      deleted: server_record.deleted,
      data: { ...server_record.values, created_at: "2026-10-01T00:00:00Z" },
    };
    if (isOfflineCollection(server_record.collection))
      pulled_row.field_hlc = { ...server_record.field_hlc };
    return pulled_row;
  }

  pull(user_id: number, since: number, limit: number): PullPage {
    const visible_rows = [...this.records.values()]
      .filter(
        (server_record) => server_record.seq > since && this.isVisible(user_id, server_record)
      )
      .sort((left_record, right_record) => left_record.seq - right_record.seq);
    const page_records = visible_rows.slice(0, limit);
    return {
      ledger_id: this.ledgerOf(user_id),
      rows: page_records.map((server_record) => this.toPulledRow(server_record)),
      next_since: page_records.length > 0 ? page_records[page_records.length - 1].seq : since,
      has_more: visible_rows.length > limit,
    };
  }

  // A transport for one device of user_id, with failure injection.
  transportFor(user_id: number): SyncTransport & { controls: FakeTransportControls } {
    const controls: FakeTransportControls = {
      lose_next_push_response: false,
      unreachable: false,
      push_request_count: 0,
    };
    const requireReachable = () => {
      if (controls.unreachable) throw new SyncNetworkError("サーバーに接続できません");
    };
    return {
      controls,
      push: async (changes) => {
        requireReachable();
        controls.push_request_count += 1;
        // Round-trip through JSON like the real API.
        const push_results = this.push(
          user_id,
          JSON.parse(JSON.stringify(changes)) as PushChange[]
        );
        if (controls.lose_next_push_response) {
          controls.lose_next_push_response = false;
          throw new SyncNetworkError("接続が切断されました");
        }
        return push_results;
      },
      pull: async (since, limit) => {
        requireReachable();
        return JSON.parse(JSON.stringify(this.pull(user_id, since, limit))) as PullPage;
      },
      sendCommand: async () => {
        requireReachable();
        throw new Error("use writeOnlineRow in tests");
      },
    };
  }
}
