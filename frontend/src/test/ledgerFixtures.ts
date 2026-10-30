// Ledger data for tests that render screens: rows the MSW /sync/pull handler
// serves, so the app's local database is filled the same way a real sync fills it.
import { http, HttpResponse } from "msw";
import type { PulledRow } from "../sync/wire";
import { TEST_API_BASE } from "./appServices";
import { TEST_LEDGER_ID } from "./handlers";

export const TEST_USER_ID = 1;

export interface RecordedCommand {
  method: string;
  path: string;
  request_body: Record<string, unknown> | null;
}

// The ledger command paths (sync-api.yaml, /ledger/*) and the collections they write.
const COMMAND_COLLECTIONS: Record<string, string> = {
  "category-groups": "category_groups",
  "expense-categories": "expense_categories",
  "income-records": "income_records",
  "recurring-expenses": "recurring_expenses",
  "savings-goals": "savings_goals",
  "surplus-allocations": "surplus_allocations",
};

export class TestLedgerServer {
  private readonly rows_by_id = new Map<string, PulledRow>();
  private next_seq = 1;
  private next_command_row_number = 1;
  readonly recorded_commands: RecordedCommand[] = [];
  private command_rejection: { http_status: number; code: string; message: string } | null = null;

  // Adds or replaces a row; the next pull after it delivers the new version.
  putRow(
    collection: string,
    id: string,
    data: Record<string, unknown>,
    owner_id: number = TEST_USER_ID
  ): PulledRow {
    const pulled_row: PulledRow = {
      collection,
      id,
      owner_id,
      seq: this.next_seq++,
      deleted: false,
      data: { created_at: "2026-01-01T00:00:00Z", ...data },
    };
    this.rows_by_id.set(id, pulled_row);
    return pulled_row;
  }

  // Turns a row into a tombstone; the next pull delivers the delete.
  deleteRow(id: string): PulledRow | undefined {
    const existing_row = this.rows_by_id.get(id);
    if (!existing_row) return undefined;
    const deleted_row: PulledRow = { ...existing_row, seq: this.next_seq++, deleted: true };
    this.rows_by_id.set(id, deleted_row);
    return deleted_row;
  }

  // The current version of a row, for assertions.
  row(id: string): PulledRow | undefined {
    return this.rows_by_id.get(id);
  }

  // The next ledger command fails with this error instead of writing.
  rejectNextCommand(http_status: number, code: string, message: string): void {
    this.command_rejection = { http_status, code, message };
  }

  // A minimal stand-in for the server's ledger commands: it records each request
  // and writes the row the way the server would, without its validation.
  commandHandler() {
    return http.all(`${TEST_API_BASE}/ledger/*`, async ({ request }) => {
      const command_path = new URL(request.url).pathname.replace(/^\/ledger\//, "");
      const request_body =
        request.method === "DELETE" ? null : ((await request.json()) as Record<string, unknown>);
      this.recorded_commands.push({ method: request.method, path: command_path, request_body });
      if (this.command_rejection) {
        const { http_status, code, message } = this.command_rejection;
        this.command_rejection = null;
        return HttpResponse.json({ code, message }, { status: http_status });
      }
      const written_row = this.writeCommandRow(request.method, command_path, request_body ?? {});
      if (!written_row)
        return HttpResponse.json({ code: "not_found", message: "not found" }, { status: 404 });
      return HttpResponse.json(written_row, { status: request.method === "POST" ? 201 : 200 });
    });
  }

  private newCommandRowId(): string {
    return `01920000-0000-7000-8000-9${String(this.next_command_row_number++).padStart(11, "0")}`;
  }

  private writeCommandRow(
    method: string,
    command_path: string,
    request_body: Record<string, unknown>
  ): PulledRow | undefined {
    if (command_path === "base-income") {
      const base_income_row = [...this.rows_by_id.values()].find(
        (pulled_row) =>
          pulled_row.collection === "base_incomes" && pulled_row.data.member_id === TEST_USER_ID
      );
      return this.putRow("base_incomes", base_income_row?.id ?? this.newCommandRowId(), {
        member_id: TEST_USER_ID,
        amount: request_body.amount,
      });
    }
    const [path_collection, record_id, action_name] = command_path.split("/");
    if (action_name === "confirm") {
      const recurring_row = this.rows_by_id.get(record_id);
      if (!recurring_row) return undefined;
      return this.putRow("journal_entries", this.newCommandRowId(), {
        wallet: recurring_row.data.wallet,
        transaction_date: `${request_body.year_month}-01`,
        amount: request_body.amount,
        category_id: recurring_row.data.category_id,
        item: recurring_row.data.name,
        is_excluded: false,
        note: null,
        recurring_expense_id: record_id,
        recurring_year_month: request_body.year_month,
      });
    }
    if (action_name === "postings") {
      return this.putRow("savings_postings", this.newCommandRowId(), {
        goal_id: record_id,
        year_month: request_body.year_month,
        amount: request_body.amount,
        kind: "manual",
      });
    }
    const collection = COMMAND_COLLECTIONS[path_collection];
    if (!collection) return undefined;
    if (method === "POST") {
      const extra_fields = collection === "income_records" ? { earner_id: TEST_USER_ID } : {};
      return this.putRow(collection, this.newCommandRowId(), { ...extra_fields, ...request_body });
    }
    const existing_row = this.rows_by_id.get(record_id);
    if (!existing_row) return undefined;
    if (method === "PUT") {
      return this.putRow(collection, record_id, { ...existing_row.data, ...request_body });
    }
    return this.deleteRow(record_id);
  }

  pullHandler() {
    return http.get(`${TEST_API_BASE}/sync/pull`, ({ request }) => {
      const since_seq = Number(new URL(request.url).searchParams.get("since") ?? "0");
      const new_rows = [...this.rows_by_id.values()]
        .filter((pulled_row) => pulled_row.seq > since_seq)
        .sort((left_row, right_row) => left_row.seq - right_row.seq);
      return HttpResponse.json({
        ledger_id: TEST_LEDGER_ID,
        rows: new_rows,
        next_since: Math.max(since_seq, ...new_rows.map((pulled_row) => pulled_row.seq)),
        has_more: false,
      });
    });
  }
}

export const FOOD_GROUP_ID = "01920000-0000-7000-8000-000000000101";
export const SUPERMARKET_CATEGORY_ID = "01920000-0000-7000-8000-000000000201";
export const BASE_INCOME_ID = "01920000-0000-7000-8000-000000000301";

// A personal ledger with one food category and a base income.
export function seedPersonalLedger(
  ledger_server: TestLedgerServer,
  { base_income_amount = 0 } = {}
): void {
  ledger_server.putRow("ledgers", TEST_LEDGER_ID, { kind: "personal", name: null });
  ledger_server.putRow("category_groups", FOOD_GROUP_ID, {
    name: "食費",
    statement_type_code: "food",
    description: null,
  });
  ledger_server.putRow("expense_categories", SUPERMARKET_CATEGORY_ID, {
    group_id: FOOD_GROUP_ID,
    name: "スーパー",
    category_code: null,
    description: null,
  });
  ledger_server.putRow("base_incomes", BASE_INCOME_ID, {
    member_id: TEST_USER_ID,
    amount: base_income_amount,
  });
}

let next_entry_number = 1;

export function putJournalEntry(
  ledger_server: TestLedgerServer,
  entry_values: {
    transaction_date: string;
    amount: number;
    category_id?: string;
    item?: string;
    recurring_expense_id?: string;
    recurring_year_month?: string;
  },
  owner_id: number = TEST_USER_ID
): string {
  const entry_id = `01920000-0000-7000-8000-${String(next_entry_number++).padStart(12, "0")}`;
  ledger_server.putRow(
    "journal_entries",
    entry_id,
    {
      wallet: "ledger",
      item: null,
      is_excluded: false,
      note: null,
      recurring_expense_id: null,
      recurring_year_month: null,
      category_id: SUPERMARKET_CATEGORY_ID,
      ...entry_values,
    },
    owner_id
  );
  return entry_id;
}

export const FIXED_GROUP_ID = "01920000-0000-7000-8000-000000000102";
export const RENT_CATEGORY_ID = "01920000-0000-7000-8000-000000000202";

// A fixed-cost group and category (the ones recurring expenses can use).
export function seedFixedCategory(ledger_server: TestLedgerServer): void {
  ledger_server.putRow("category_groups", FIXED_GROUP_ID, {
    name: "住居",
    statement_type_code: "fixed",
    description: null,
  });
  ledger_server.putRow("expense_categories", RENT_CATEGORY_ID, {
    group_id: FIXED_GROUP_ID,
    name: "家賃",
    category_code: null,
    description: null,
  });
}

let next_fixture_row_number = 1;

function nextFixtureRowId(): string {
  return `01920000-0000-7000-8000-5${String(next_fixture_row_number++).padStart(11, "0")}`;
}

export function putIncomeRecord(
  ledger_server: TestLedgerServer,
  income_values: { transaction_date: string; amount: number; name?: string; income_type?: string },
  income_id: string = nextFixtureRowId()
): string {
  ledger_server.putRow("income_records", income_id, {
    earner_id: TEST_USER_ID,
    name: "給与",
    income_type: "salary",
    emoji: "🏢",
    note: null,
    ...income_values,
  });
  return income_id;
}

export function putSavingsGoal(
  ledger_server: TestLedgerServer,
  goal_values: {
    name?: string;
    emoji?: string;
    monthly_amount?: number;
    target_amount?: number;
    deadline?: string | null;
    memo?: string;
  } = {},
  goal_id: string = nextFixtureRowId()
): string {
  ledger_server.putRow("savings_goals", goal_id, {
    name: "旅行積立",
    emoji: "✈️",
    monthly_amount: 20000,
    target_amount: 250000,
    deadline: "2027/03",
    memo: "北海道旅行",
    ...goal_values,
  });
  return goal_id;
}

export function putSavingsPosting(
  ledger_server: TestLedgerServer,
  posting_values: { goal_id: string; year_month: string; amount: number }
): string {
  const posting_id = nextFixtureRowId();
  ledger_server.putRow("savings_postings", posting_id, { kind: "auto", ...posting_values });
  return posting_id;
}

export function putSurplusAllocation(
  ledger_server: TestLedgerServer,
  allocation_values: {
    year_month: string;
    amount: number;
    destination: "budget" | "savings";
    savings_goal_id?: string | null;
  }
): string {
  const allocation_id = nextFixtureRowId();
  ledger_server.putRow("surplus_allocations", allocation_id, {
    savings_goal_id: null,
    ...allocation_values,
  });
  return allocation_id;
}

export function putRecurringExpense(
  ledger_server: TestLedgerServer,
  recurring_values: {
    name?: string;
    emoji?: string;
    billing_day?: number;
    amount?: number | null;
    type?: "fixed" | "variable";
    category_id?: string;
  } = {},
  recurring_id: string = nextFixtureRowId()
): string {
  ledger_server.putRow("recurring_expenses", recurring_id, {
    wallet: "ledger",
    name: "家賃",
    emoji: "🏠",
    billing_day: 27,
    amount: 80000,
    type: "fixed",
    category_id: RENT_CATEGORY_ID,
    ...recurring_values,
  });
  return recurring_id;
}
