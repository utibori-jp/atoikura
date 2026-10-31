import {
  FOOD_GROUP_ID,
  putJournalEntry,
  seedPersonalLedger,
  TestLedgerServer,
} from "../test/ledgerFixtures";
import { openSyncedSession } from "../test/renderWithLedger";
import { loadDailyCumulative, loadMonthlyBreakdownItems } from "./spending";

const FIXED_GROUP_ID = "01920000-0000-7000-8000-000000000102";
const RENT_CATEGORY_ID = "01920000-0000-7000-8000-000000000203";

function seedLedgerWithSpending(ledger_server: TestLedgerServer): void {
  seedPersonalLedger(ledger_server, { base_income_amount: 300000 });
  ledger_server.putRow("category_groups", FIXED_GROUP_ID, {
    name: "住まい",
    statement_type_code: "fixed",
    description: null,
  });
  ledger_server.putRow("expense_categories", RENT_CATEGORY_ID, {
    group_id: FIXED_GROUP_ID,
    name: "家賃",
    category_code: null,
    description: null,
  });
  ledger_server.putRow("recurring_expenses", "01920000-0000-7000-8000-000000000401", {
    name: "家賃",
    emoji: null,
    billing_day: 25,
    amount: 80000,
    type: "fixed",
    category_id: RENT_CATEGORY_ID,
  });
  putJournalEntry(ledger_server, { transaction_date: "2026-10-01", amount: 1000 });
  putJournalEntry(ledger_server, { transaction_date: "2026-10-03", amount: 2000 });
  putJournalEntry(ledger_server, {
    transaction_date: "2026-10-25",
    amount: 80000,
    category_id: RENT_CATEGORY_ID,
  });
}

describe("spending aggregations", () => {
  it("computes the home chart from local data: budget, daily pace and forecast", async () => {
    const ledger_server = new TestLedgerServer();
    seedLedgerWithSpending(ledger_server);
    const { ledger_data } = await openSyncedSession(ledger_server);

    const daily_cumulative = await loadDailyCumulative(ledger_data, "2026-10", "2026-10-04");

    // 300,000 income − 80,000 fixed recurring
    expect(daily_cumulative.variable_budget).toBe(220000);
    expect(daily_cumulative.daily_budget).toBe(Math.floor(220000 / 31));
    expect(daily_cumulative.days).toHaveLength(31);
    // Fixed spending isn't variable spending.
    expect(daily_cumulative.days[3]).toEqual({
      date: "2026-10-04",
      food: 3000,
      other: 0,
      total: 3000,
      is_actual: true,
    });
    expect(daily_cumulative.days[4].is_actual).toBe(false);
  });

  it("totals the month per category, ordered by statement type", async () => {
    const ledger_server = new TestLedgerServer();
    seedLedgerWithSpending(ledger_server);
    const { ledger_data } = await openSyncedSession(ledger_server);

    const breakdown_items = await loadMonthlyBreakdownItems(ledger_data, "2026-10");

    expect(breakdown_items).toEqual([
      {
        category_id: expect.any(String),
        category_name: "スーパー",
        group_id: FOOD_GROUP_ID,
        group_name: "食費",
        statement_type_order: 1,
        statement_type_name: "食費",
        total: 3000,
      },
      {
        category_id: RENT_CATEGORY_ID,
        category_name: "家賃",
        group_id: FIXED_GROUP_ID,
        group_name: "住まい",
        statement_type_order: 3,
        statement_type_name: "固定費",
        total: 80000,
      },
    ]);
  });
});
