import { todayInJst } from "../logic";
import { CommandRejectedError } from "../sync/errors";
import {
  FOOD_GROUP_ID,
  putIncomeRecord,
  putJournalEntry,
  putRecurringExpense,
  putSavingsGoal,
  putSavingsPosting,
  putSurplusAllocation,
  RENT_CATEGORY_ID,
  seedFixedCategory,
  seedPersonalLedger,
  TestLedgerServer,
} from "../test/ledgerFixtures";
import { openSyncedSession } from "../test/renderWithLedger";
import { commandErrorMessage, createLedgerApi } from "./ledgerApi";

const current_month = todayInJst().slice(0, 7);
const OTHER_MEMBER_ID = 2;

async function openLedgerApi(add_rows: (ledger_server: TestLedgerServer) => void = () => {}) {
  const ledger_server = new TestLedgerServer();
  seedPersonalLedger(ledger_server, { base_income_amount: 300000 });
  seedFixedCategory(ledger_server);
  add_rows(ledger_server);
  const { ledger_data, sync_client, local_db } = await openSyncedSession(ledger_server);
  return {
    ledger_server,
    local_db,
    ledger_api: createLedgerApi(ledger_data, sync_client.ledger_commands),
  };
}

describe("ledger api — reads", () => {
  it("maps the ledger summary to the legacy budget summary shape", async () => {
    const { ledger_api } = await openLedgerApi((ledger_server) => {
      putRecurringExpense(ledger_server, { amount: 80000, type: "fixed" });
      putSavingsGoal(ledger_server, { monthly_amount: 20000 });
      putIncomeRecord(ledger_server, { transaction_date: `${current_month}-25`, amount: 320000 });
      putJournalEntry(ledger_server, { transaction_date: `${current_month}-01`, amount: 5000 });
    });

    const budget_summary = await ledger_api.getBudgetSummary(current_month);

    expect(budget_summary).toMatchObject({
      income_total: 320000,
      base_income: 300000,
      recurring_total: 80000,
      savings_total: 20000,
      variable_budget: 200000,
    });
    expect(budget_summary.history.at(-1)).toEqual({
      year_month: current_month,
      budget: 200000,
      actual: 5000,
    });
  });

  it("returns only the signed-in member's base income", async () => {
    const { ledger_api } = await openLedgerApi((ledger_server) => {
      ledger_server.putRow(
        "base_incomes",
        "01920000-0000-7000-8000-000000000302",
        { member_id: OTHER_MEMBER_ID, amount: 99999 },
        OTHER_MEMBER_ID
      );
    });

    expect(await ledger_api.getBaseIncome()).toEqual({ amount: 300000 });
  });

  it("lists the month's income records newest first, without deleted ones", async () => {
    const { ledger_api } = await openLedgerApi((ledger_server) => {
      putIncomeRecord(ledger_server, {
        transaction_date: `${current_month}-10`,
        amount: 1,
        name: "古い",
      });
      putIncomeRecord(ledger_server, {
        transaction_date: `${current_month}-20`,
        amount: 2,
        name: "新しい",
      });
      const deleted_id = putIncomeRecord(ledger_server, {
        transaction_date: `${current_month}-15`,
        amount: 3,
        name: "削除済み",
      });
      ledger_server.deleteRow(deleted_id);
      putIncomeRecord(ledger_server, { transaction_date: "2001-01-01", amount: 4, name: "別の月" });
    });

    const { income_records } = await ledger_api.listIncomeRecords(current_month);

    expect(income_records.map((income_record) => income_record.name)).toEqual(["新しい", "古い"]);
    expect(income_records[0]).toMatchObject({ emoji: "🏢", note: "", income_type: "salary" });
  });

  it("adds postings and savings allocations to a goal's accumulated amount", async () => {
    let goal_id = "";
    const { ledger_api } = await openLedgerApi((ledger_server) => {
      goal_id = putSavingsGoal(ledger_server, { name: "旅行" });
      putSavingsPosting(ledger_server, { goal_id, year_month: "2026-01", amount: 20000 });
      putSavingsPosting(ledger_server, { goal_id, year_month: current_month, amount: 20000 });
      const deleted_posting_id = putSavingsPosting(ledger_server, {
        goal_id,
        year_month: "2026-02",
        amount: 99999,
      });
      ledger_server.deleteRow(deleted_posting_id);
      putSurplusAllocation(ledger_server, {
        year_month: "2026-01",
        amount: 5000,
        destination: "savings",
        savings_goal_id: goal_id,
      });
      putSurplusAllocation(ledger_server, {
        year_month: "2026-01",
        amount: 7000,
        destination: "budget",
      });
    });

    const { savings_goals } = await ledger_api.listSavingsGoals();

    expect(savings_goals).toEqual([
      expect.objectContaining({
        id: goal_id,
        accumulated_amount: 45000,
        is_posted_this_month: true,
      }),
    ]);
  });

  it("lists variable recurring expenses not posted this month, counting deleted postings as posted", async () => {
    let pending_id = "";
    const { ledger_api } = await openLedgerApi((ledger_server) => {
      pending_id = putRecurringExpense(ledger_server, {
        name: "電気代",
        type: "variable",
        amount: 7480,
      });
      putRecurringExpense(ledger_server, { name: "家賃", type: "fixed" });
      const deleted_posting_recurring_id = putRecurringExpense(ledger_server, {
        name: "ガス代",
        type: "variable",
      });
      const posting_id = putJournalEntry(ledger_server, {
        transaction_date: `${current_month}-05`,
        amount: 4000,
        recurring_expense_id: deleted_posting_recurring_id,
        recurring_year_month: current_month,
      });
      ledger_server.deleteRow(posting_id);
    });

    const { pending } = await ledger_api.listPendingRecurring(current_month);

    expect(pending).toEqual([
      {
        id: pending_id,
        name: "電気代",
        emoji: "🏠",
        billing_day: 27,
        last_amount: 7480,
        group_name: "住居",
      },
    ]);
  });

  it("lists recurring expenses with their category and group names", async () => {
    const { ledger_api } = await openLedgerApi((ledger_server) => {
      putRecurringExpense(ledger_server, { name: "家賃", billing_day: 27 });
      putRecurringExpense(ledger_server, { name: "保険", billing_day: 5 });
    });

    const { recurring_expenses } = await ledger_api.listRecurringExpenses();

    expect(recurring_expenses.map((recurring_expense) => recurring_expense.name)).toEqual([
      "保険",
      "家賃",
    ]);
    expect(recurring_expenses[0]).toMatchObject({
      category_id: RENT_CATEGORY_ID,
      category_name: "家賃",
      group_name: "住居",
    });
  });
});

describe("ledger api — commands", () => {
  it("maps the legacy statement type id to its code", async () => {
    const { ledger_api, ledger_server } = await openLedgerApi();

    await ledger_api.updateCategoryGroup(FOOD_GROUP_ID, {
      group_name: "食費",
      statement_type_id: 2,
    });

    expect(ledger_server.recorded_commands[0]).toEqual({
      method: "PUT",
      path: `category-groups/${FOOD_GROUP_ID}`,
      request_body: { name: "食費", statement_type_code: "other", description: null },
    });
  });

  it("rejects an unknown statement type id without sending anything", async () => {
    const { ledger_api, ledger_server } = await openLedgerApi();

    await expect(
      ledger_api.createCategoryGroup({ group_name: "謎", statement_type_id: 42 })
    ).rejects.toThrow("区分が不正です");
    expect(ledger_server.recorded_commands).toEqual([]);
  });

  it("writes the command's row to the local database", async () => {
    const { ledger_api, local_db } = await openLedgerApi();

    await ledger_api.updateBaseIncome(320000);

    expect(await ledger_api.getBaseIncome()).toEqual({ amount: 320000 });
    expect(await local_db.select("SELECT amount FROM base_incomes WHERE deleted = 0")).toEqual([
      { amount: 320000 },
    ]);
  });

  it("surfaces the server's message for a refused command", async () => {
    const { ledger_api, ledger_server } = await openLedgerApi();
    ledger_server.rejectNextCommand(409, "duplicate", "同じ名前の目標があります");

    const create_error = await ledger_api
      .createSavingsGoal({ name: "旅行", emoji: "✈️", monthly_amount: 1, target_amount: 1 })
      .catch((caught_error: unknown) => caught_error);

    expect(create_error).toBeInstanceOf(CommandRejectedError);
    expect(commandErrorMessage(create_error, "保存できませんでした")).toBe(
      "同じ名前の目標があります"
    );
    expect(commandErrorMessage(new TypeError("Failed to fetch"), "保存できませんでした")).toBe(
      "保存できませんでした"
    );
  });
});
