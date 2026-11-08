// Client-only rules that have no server counterpart yet: household formulas,
// allowance carry-over, deleted-category handling, notes, recurring dates.
import {
  allowanceBalances,
  allowanceInEffect,
  computeLedgerBudget,
  ledgerRemaining,
} from "./budget";
import { addMonths, isValidDate, monthsBetween, todayInJst } from "./calendar";
import { billingDateInMonth, pendingRecurringPostings, type RecurringExpense } from "./recurring";
import {
  MAX_NOTE_LENGTH,
  validateDailyNote,
  validateJournalEntry,
  validateMonthlyReviewNote,
} from "./validation";

describe("calendar", () => {
  it("uses the Asia/Tokyo date", () => {
    expect(todayInJst(new Date("2026-10-26T14:59:59Z"))).toBe("2026-10-26");
    expect(todayInJst(new Date("2026-10-26T15:00:00Z"))).toBe("2026-10-27");
  });

  it("validates real calendar dates", () => {
    expect(isValidDate("2028-02-29")).toBe(true);
    expect(isValidDate("2026-02-29")).toBe(false);
    expect(isValidDate("2026-13-01")).toBe(false);
  });

  it("shifts and enumerates months across years", () => {
    expect(addMonths("2026-01", -2)).toBe("2025-11");
    expect(monthsBetween("2026-11", "2027-02")).toEqual([
      "2026-11",
      "2026-12",
      "2027-01",
      "2027-02",
    ]);
    expect(monthsBetween("2026-03", "2026-02")).toEqual([]);
  });
});

describe("ledger budget", () => {
  it("reduces to the personal variable budget without allowances", () => {
    const ledger_budget = computeLedgerBudget({
      base_incomes: [300000],
      ledger_recurring_fixed_total: 96000,
      savings_monthly_total: 45000,
      savings_allocated: 0,
      allowance_amounts: [],
    });
    expect(ledger_budget).toEqual({
      base_income_total: 300000,
      disposable: 159000,
      allowance_total: 0,
      shared_living_budget: 159000,
    });
  });

  it("splits a household's disposable income into allowances and the shared living budget", () => {
    const ledger_budget = computeLedgerBudget({
      base_incomes: [300000, 220000],
      ledger_recurring_fixed_total: 150000,
      savings_monthly_total: 60000,
      savings_allocated: 10000,
      allowance_amounts: [40000, 30000],
    });
    expect(ledger_budget.disposable).toBe(300000);
    expect(ledger_budget.allowance_total).toBe(70000);
    expect(ledger_budget.shared_living_budget).toBe(230000);
    expect(ledgerRemaining(ledger_budget.shared_living_budget, 180000)).toBe(50000);
  });
});

describe("allowance carry-over", () => {
  const allowance_history = [
    { effective_from: "2026-08", amount: 30000 },
    { effective_from: "2026-10", amount: 40000 },
  ];

  it("picks the amount in effect for each month", () => {
    expect(allowanceInEffect(allowance_history, "2026-07")).toBe(0);
    expect(allowanceInEffect(allowance_history, "2026-09")).toBe(30000);
    expect(allowanceInEffect(allowance_history, "2026-12")).toBe(40000);
  });

  it("carries unused allowance and overspending into the next month", () => {
    const allowance_months = allowanceBalances(
      allowance_history,
      { "2026-08": 25000, "2026-09": 38000, "2026-10": 10000 },
      "2026-08",
      "2026-10"
    );
    expect(allowance_months).toEqual([
      {
        year_month: "2026-08",
        carried_in: 0,
        allowance: 30000,
        spent: 25000,
        saved: 0,
        balance: 5000,
      },
      {
        year_month: "2026-09",
        carried_in: 5000,
        allowance: 30000,
        spent: 38000,
        saved: 0,
        balance: -3000,
      },
      {
        year_month: "2026-10",
        carried_in: -3000,
        allowance: 40000,
        spent: 10000,
        saved: 0,
        balance: 27000,
      },
    ]);
  });

  it("takes personal savings out of the balance as well", () => {
    const allowance_months = allowanceBalances(
      allowance_history,
      { "2026-10": 10000 },
      "2026-10",
      "2026-11",
      { "2026-10": 5000, "2026-11": 2000 }
    );
    expect(allowance_months.map((allowance_month) => allowance_month.balance)).toEqual([
      25000, 63000,
    ]);
  });
});

describe("journal entry validation (client-only rules)", () => {
  const valid_entry = {
    transaction_date: "2026-10-27",
    amount: 500,
    category_id: "0192f000-0000-7000-8000-000000000001",
    is_excluded: false,
  };

  it("accepts a deleted category with a warning and rejects an unknown one", () => {
    expect(validateJournalEntry(valid_entry, { categoryStatus: () => "deleted" })).toEqual({
      valid: true,
      warnings: [
        {
          code: "DELETED_CATEGORY",
          message: "削除済みのカテゴリです。別のカテゴリを選んでください",
        },
      ],
    });
    expect(validateJournalEntry(valid_entry, { categoryStatus: () => "unknown" })).toEqual({
      valid: false,
      message: "指定されたcategory_idは存在しません",
    });
  });

  it("rejects fractional amounts", () => {
    expect(
      validateJournalEntry({ ...valid_entry, amount: 1.5 }, { categoryStatus: () => "active" })
    ).toEqual({ valid: false, message: "amountは正の整数である必要があります" });
  });
});

describe("note validation", () => {
  it("allows an empty daily note (it tombstones the day) and caps the length", () => {
    expect(validateDailyNote({ date: "2026-10-27", note: "" })).toEqual({
      valid: true,
      warnings: [],
    });
    expect(
      validateDailyNote({ date: "2026-10-27", note: "あ".repeat(MAX_NOTE_LENGTH + 1) }).valid
    ).toBe(false);
    expect(validateDailyNote({ date: "2026-02-30", note: "x" })).toEqual({
      valid: false,
      message: "dateはYYYY-MM-DD形式で指定してください",
    });
  });

  it("requires a month and a category for review notes", () => {
    expect(
      validateMonthlyReviewNote({ year_month: "2026-13", category_id: "c", note: "x" }).valid
    ).toBe(false);
    expect(validateMonthlyReviewNote({ year_month: "2026-10", note: "x" })).toEqual({
      valid: false,
      message: "category_idは必須です",
    });
    expect(
      validateMonthlyReviewNote({ year_month: "2026-10", category_id: "c", note: "x" }).valid
    ).toBe(true);
  });
});

describe("recurring postings", () => {
  it("clamps the billing day to the end of the month", () => {
    expect(billingDateInMonth("2026-02", 31)).toBe("2026-02-28");
    expect(billingDateInMonth("2028-02", 31)).toBe("2028-02-29");
    expect(billingDateInMonth("2026-10", 5)).toBe("2026-10-05");
  });

  it("lists fixed expenses with an amount that are not posted yet", () => {
    const recurring_expenses: RecurringExpense[] = [
      {
        id: "rent",
        name: "家賃",
        billing_day: 27,
        amount: 90000,
        type: "fixed",
        category_id: "c1",
      },
      {
        id: "phone",
        name: "スマホ",
        billing_day: 31,
        amount: 3000,
        type: "fixed",
        category_id: "c2",
      },
      {
        id: "power",
        name: "電気",
        billing_day: 10,
        amount: null,
        type: "variable",
        category_id: "c3",
      },
      {
        id: "net",
        name: "回線",
        billing_day: 1,
        amount: null,
        type: "fixed",
        category_id: "c4",
      },
    ];
    expect(pendingRecurringPostings(recurring_expenses, new Set(["rent"]), "2026-11")).toEqual([
      {
        recurring_expense_id: "phone",
        name: "スマホ",
        amount: 3000,
        category_id: "c2",
        transaction_date: "2026-11-30",
      },
    ]);
  });
});
