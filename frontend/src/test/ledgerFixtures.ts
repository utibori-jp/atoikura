// Ledger data for tests that render screens: rows the MSW /sync/pull handler
// serves, so the app's local database is filled the same way a real sync fills it.
import { http, HttpResponse } from "msw";
import type { PulledRow } from "../sync/wire";
import { TEST_API_BASE } from "./appServices";
import { TEST_LEDGER_ID } from "./handlers";

export const TEST_USER_ID = 1;

export class TestLedgerServer {
  private readonly rows_by_id = new Map<string, PulledRow>();
  private next_seq = 1;

  // Adds or replaces a row; the next pull after it delivers the new version.
  putRow(
    collection: string,
    id: string,
    data: Record<string, unknown>,
    owner_id: number = TEST_USER_ID
  ): void {
    this.rows_by_id.set(id, {
      collection,
      id,
      owner_id,
      seq: this.next_seq++,
      deleted: false,
      data: { created_at: "2026-01-01T00:00:00Z", ...data },
    });
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
