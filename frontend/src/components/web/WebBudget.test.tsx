import { screen } from "@testing-library/react";
import { todayInJst } from "../../logic";
import {
  putIncomeRecord,
  putJournalEntry,
  putRecurringExpense,
  putSavingsGoal,
  seedFixedCategory,
  seedHousehold,
  seedPersonalLedger,
  TEST_HOUSEHOLD_ID,
  TEST_PARTNER_ID,
  TEST_USER_ID,
  TestLedgerServer,
} from "../../test/ledgerFixtures";
import { renderWithLedger } from "../../test/renderWithLedger";
import { WebBudget } from "./WebBudget";

const current_month = todayInJst().slice(0, 7);

// Base income 300,000 − fixed recurring 80,000 − savings 20,000 = variable budget 200,000.
function budgetLedgerServer({ month_spending = 0, base_income_amount = 300000 } = {}) {
  const ledger_server = new TestLedgerServer();
  seedPersonalLedger(ledger_server, { base_income_amount });
  seedFixedCategory(ledger_server);
  putRecurringExpense(ledger_server, { amount: 80000, type: "fixed" });
  putSavingsGoal(ledger_server, { monthly_amount: 20000 });
  if (month_spending > 0) {
    putJournalEntry(ledger_server, {
      transaction_date: `${current_month}-01`,
      amount: month_spending,
    });
  }
  return ledger_server;
}

async function renderBudget(ledger_server: TestLedgerServer) {
  await renderWithLedger(<WebBudget onNavigate={() => {}} />, ledger_server);
  expect(
    await screen.findByText("今月の予算プラン", undefined, { timeout: 5000 })
  ).toBeInTheDocument();
}

describe("WebBudget — spending from the local database", () => {
  it("shows 消化ペース derived from this month's spending", async () => {
    await renderBudget(budgetLedgerServer({ month_spending: 50000 }));

    // spent_pct = round(50000 / 200000 * 100) = 25
    expect(screen.getByText("25%")).toBeInTheDocument();
  });

  it("shows 残り based on this month's spending", async () => {
    await renderBudget(budgetLedgerServer({ month_spending: 50000 }));

    expect(screen.getByText(/残り ¥150,000/)).toBeInTheDocument();
  });

  it("shows 0% when this month has no spending", async () => {
    await renderBudget(budgetLedgerServer());

    expect(screen.getByText("0%")).toBeInTheDocument();
  });

  // #119 follow-up: the breakdown shows 基準収入 (base income), not the recorded
  // income, since the budget is derived from base income.
  it("shows base income (基準収入) in the breakdown, not actual recorded income", async () => {
    const ledger_server = budgetLedgerServer({ base_income_amount: 400000 });
    putIncomeRecord(ledger_server, { transaction_date: `${current_month}-01`, amount: 500000 });
    await renderBudget(ledger_server);

    expect(screen.getByText("基準収入")).toBeInTheDocument();
    expect(screen.getByText("基準収入 ¥400,000")).toBeInTheDocument();
    expect(screen.queryByText("基準収入 ¥500,000")).not.toBeInTheDocument();
  });
});

describe("WebBudget — with a household attached", () => {
  function attachedLedgerServer() {
    const ledger_server = budgetLedgerServer();
    seedHousehold(ledger_server, {
      effective_from: current_month,
      members: [
        {
          user_id: TEST_USER_ID,
          display_name: "Dev User",
          role: "owner",
          // Joined this month, so nothing carries over yet.
          joined_at: `${current_month}-01T00:00:00+09:00`,
          allowance: 150000,
        },
        { user_id: TEST_PARTNER_ID, display_name: "Partner", role: "member", allowance: 50000 },
      ],
    });
    ledger_server.putRow(
      "base_incomes",
      "household-base-income",
      { member_id: TEST_USER_ID, amount: 400000 },
      TEST_USER_ID,
      TEST_HOUSEHOLD_ID
    );
    return ledger_server;
  }

  it("budgets the allowance view from the allowance instead of income", async () => {
    await renderWithLedger(<WebBudget onNavigate={() => {}} />, attachedLedgerServer(), {
      preferred_target: "personal",
    });
    expect(
      await screen.findByText("今月 ¥150,000 + 繰越 ¥0", undefined, { timeout: 5000 })
    ).toBeInTheDocument();

    // Allowance 150,000 − fixed 80,000 − savings 20,000.
    expect(screen.getByText("今月の予算 ¥50,000")).toBeInTheDocument();
    expect(screen.getByText("お小遣い ¥150,000")).toBeInTheDocument();
    expect(screen.queryByText(/基準収入/)).not.toBeInTheDocument();
  });

  it("takes the members' allowances out of the household budget", async () => {
    await renderWithLedger(<WebBudget onNavigate={() => {}} />, attachedLedgerServer());
    expect(
      await screen.findByText("基準収入 ¥400,000", undefined, { timeout: 5000 })
    ).toBeInTheDocument();

    expect(screen.getByText("お小遣い ¥200,000")).toBeInTheDocument();
    expect(screen.getByText("今月の予算 ¥200,000")).toBeInTheDocument();
  });
});
