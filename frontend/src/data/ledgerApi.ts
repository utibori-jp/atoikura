import { useMemo } from "react";
import type { SqlValue } from "../db/types";
import { todayInJst, type BudgetHistoryItem, type StatementTypeCode } from "../logic";
import { useAppSession, useSyncStatus } from "../session/sessionHooks";
import { CommandRejectedError, OfflineError } from "../sync/errors";
import type { LedgerCommands } from "../sync/ledgerCommands";
import {
  listCategoryGroups,
  listExpenseCategories,
  STATEMENT_TYPE_VIEWS,
  type CategoryGroupView,
  type ExpenseCategoryView,
  type StatementTypeView,
} from "./journal";
import { useLedgerData, type LedgerData } from "./ledgerData";

// The online-only screens' data (#201): budget, income, recurring expenses,
// savings and the category master. Reads come from the synced cache in the local
// database; edits are ledger commands, which need a connection (the server
// checks every invariant as the edit happens). Method names and response shapes
// follow the legacy REST client (api/client.ts), with UUID string IDs, so the
// screens change little.

export type IncomeType = "salary" | "side" | "bonus" | "oneoff";

export interface IncomeRecordView {
  id: string;
  transaction_date: string;
  amount: number;
  name: string;
  income_type: IncomeType;
  emoji: string;
  note: string;
}

export interface IncomeRecordFields {
  transaction_date: string;
  amount: number;
  name: string;
  income_type: IncomeType;
  emoji: string;
  note?: string;
}

export interface RecurringExpenseView {
  id: string;
  wallet: "ledger" | "allowance";
  name: string;
  emoji: string;
  billing_day: number;
  amount: number | null;
  type: "fixed" | "variable";
  category_id: string;
  group_id: string;
  group_name: string;
  category_name: string;
}

export interface RecurringExpenseFields {
  name: string;
  emoji: string;
  billing_day: number;
  amount?: number | null;
  type: "fixed" | "variable";
  category_id: string;
}

export interface PendingRecurringView {
  id: string;
  name: string;
  emoji: string;
  billing_day: number;
  last_amount: number;
  group_name: string;
}

export interface SavingsGoalView {
  id: string;
  name: string;
  emoji: string;
  monthly_amount: number;
  target_amount: number;
  // The goal's postings plus the surplus allocated to it (design.md §3.1).
  accumulated_amount: number;
  deadline: string | null;
  memo: string;
  is_posted_this_month: boolean;
}

export interface SavingsGoalFields {
  name: string;
  emoji: string;
  monthly_amount: number;
  target_amount: number;
  deadline?: string | null;
  memo?: string;
}

export interface SurplusAllocationView {
  id: string;
  year_month: string;
  amount: number;
  destination: "budget" | "savings";
  savings_goal_id: string | null;
  created_at: string;
}

export interface SurplusAllocationFields {
  year_month: string;
  amount: number;
  destination: "budget" | "savings";
  savings_goal_id?: string | null;
}

export interface BudgetSummaryView {
  income_total: number;
  base_income: number;
  recurring_total: number;
  savings_total: number;
  variable_budget: number;
  daily_budget: number;
  days_remaining: number;
  history: BudgetHistoryItem[];
}

export interface CategoryGroupFields {
  group_name: string;
  // The legacy statement type ID (StatementTypeView.id).
  statement_type_id: number;
  description?: string | null;
}

export interface ExpenseCategoryFields {
  category_name: string;
  group_id: string;
  description?: string | null;
}

function textOrEmpty(raw_value: SqlValue | undefined): string {
  return raw_value === null || raw_value === undefined ? "" : String(raw_value);
}

function statementTypeCodeById(statement_type_id: number): StatementTypeCode {
  const statement_type = STATEMENT_TYPE_VIEWS.find(
    (statement_type_view) => statement_type_view.id === statement_type_id
  );
  if (!statement_type) throw new Error("区分が不正です");
  return statement_type.type_code;
}

export function createLedgerApi(ledger_data: LedgerData, ledger_commands: LedgerCommands) {
  const { local_db, ledger_id, user_id } = ledger_data;

  return {
    // --- Budget -------------------------------------------------------------
    async getBudgetSummary(year_month: string): Promise<BudgetSummaryView> {
      const [ledger_summary, [base_income_row]] = await Promise.all([
        local_db.query("computeLedgerSummary", ledger_id, year_month, todayInJst()),
        local_db.select(
          "SELECT SUM(amount) AS total FROM base_incomes WHERE ledger_id = ? AND deleted = 0",
          [ledger_id]
        ),
      ]);
      return {
        income_total: ledger_summary.income_total,
        base_income: Number(base_income_row?.total ?? 0),
        recurring_total: ledger_summary.recurring_total,
        savings_total: ledger_summary.savings_total,
        variable_budget: ledger_summary.shared_living_budget,
        daily_budget: ledger_summary.daily_budget,
        days_remaining: ledger_summary.days_remaining,
        history: ledger_summary.history,
      };
    },

    // --- Income ---------------------------------------------------------------
    async listIncomeRecords(year_month: string): Promise<{ income_records: IncomeRecordView[] }> {
      const income_rows = await local_db.select(
        `SELECT id, transaction_date, amount, name, income_type, emoji, note FROM income_records
         WHERE ledger_id = ? AND deleted = 0 AND substr(transaction_date, 1, 7) = ?
         ORDER BY transaction_date DESC, id DESC`,
        [ledger_id, year_month]
      );
      return {
        income_records: income_rows.map((income_row) => ({
          id: String(income_row.id),
          transaction_date: String(income_row.transaction_date),
          amount: Number(income_row.amount),
          name: String(income_row.name),
          income_type: income_row.income_type as IncomeType,
          emoji: textOrEmpty(income_row.emoji),
          note: textOrEmpty(income_row.note),
        })),
      };
    },
    createIncomeRecord: (income_fields: IncomeRecordFields) =>
      ledger_commands.createIncomeRecord(income_fields),
    updateIncomeRecord: (income_id: string, income_fields: IncomeRecordFields) =>
      ledger_commands.updateIncomeRecord(income_id, income_fields),
    deleteIncomeRecord: (income_id: string) => ledger_commands.deleteIncomeRecord(income_id),

    // The signed-in member's base income (the ledger's is the sum over members).
    async getBaseIncome(): Promise<{ amount: number }> {
      const [base_income_row] = await local_db.select(
        "SELECT amount FROM base_incomes WHERE ledger_id = ? AND member_id = ? AND deleted = 0",
        [ledger_id, user_id]
      );
      return { amount: Number(base_income_row?.amount ?? 0) };
    },
    updateBaseIncome: (amount: number) => ledger_commands.putBaseIncome(amount),

    async listSurplusAllocations(
      year_month: string
    ): Promise<{ surplus_allocations: SurplusAllocationView[] }> {
      const allocation_rows = await local_db.select(
        `SELECT id, year_month, amount, destination, savings_goal_id, created_at
         FROM surplus_allocations
         WHERE ledger_id = ? AND deleted = 0 AND year_month = ?
         ORDER BY created_at, id`,
        [ledger_id, year_month]
      );
      return {
        surplus_allocations: allocation_rows.map((allocation_row) => ({
          id: String(allocation_row.id),
          year_month: String(allocation_row.year_month),
          amount: Number(allocation_row.amount),
          destination: allocation_row.destination as "budget" | "savings",
          savings_goal_id:
            allocation_row.savings_goal_id === null ? null : String(allocation_row.savings_goal_id),
          created_at: textOrEmpty(allocation_row.created_at),
        })),
      };
    },
    createSurplusAllocation: (allocation_fields: SurplusAllocationFields) =>
      ledger_commands.createSurplusAllocation(allocation_fields),

    // --- Recurring expenses ------------------------------------------------------
    async listRecurringExpenses(): Promise<{ recurring_expenses: RecurringExpenseView[] }> {
      const recurring_rows = await local_db.select(
        `SELECT re.id, re.wallet, re.name, re.emoji, re.billing_day, re.amount, re.type, re.category_id,
                ec.name AS category_name, cg.id AS group_id, cg.name AS group_name
         FROM recurring_expenses re
         LEFT JOIN expense_categories ec ON ec.id = re.category_id
         LEFT JOIN category_groups cg ON cg.id = ec.group_id
         WHERE re.ledger_id = ? AND re.deleted = 0
         ORDER BY re.billing_day, re.created_at, re.id`,
        [ledger_id]
      );
      return {
        recurring_expenses: recurring_rows.map((recurring_row) => ({
          id: String(recurring_row.id),
          wallet: recurring_row.wallet as "ledger" | "allowance",
          name: String(recurring_row.name),
          emoji: textOrEmpty(recurring_row.emoji),
          billing_day: Number(recurring_row.billing_day),
          amount: recurring_row.amount === null ? null : Number(recurring_row.amount),
          type: recurring_row.type as "fixed" | "variable",
          category_id: String(recurring_row.category_id),
          group_id: textOrEmpty(recurring_row.group_id),
          group_name: textOrEmpty(recurring_row.group_name),
          category_name: textOrEmpty(recurring_row.category_name),
        })),
      };
    },
    // Variable recurring expenses not yet confirmed for the month. A posting the
    // user deleted still counts: the server won't post that month again.
    async listPendingRecurring(year_month: string): Promise<{ pending: PendingRecurringView[] }> {
      const [pending_rows, posted_recurring_ids] = await Promise.all([
        local_db.select(
          `SELECT re.id, re.name, re.emoji, re.billing_day, re.amount, cg.name AS group_name
           FROM recurring_expenses re
           LEFT JOIN expense_categories ec ON ec.id = re.category_id
           LEFT JOIN category_groups cg ON cg.id = ec.group_id
           WHERE re.ledger_id = ? AND re.deleted = 0 AND re.type = 'variable'
           ORDER BY re.billing_day, re.created_at, re.id`,
          [ledger_id]
        ),
        local_db.query("listPostedRecurringIds", ledger_id, year_month),
      ]);
      return {
        pending: pending_rows
          .filter((pending_row) => !posted_recurring_ids.has(String(pending_row.id)))
          .map((pending_row) => ({
            id: String(pending_row.id),
            name: String(pending_row.name),
            emoji: textOrEmpty(pending_row.emoji),
            billing_day: Number(pending_row.billing_day),
            last_amount: Number(pending_row.amount ?? 0),
            group_name: textOrEmpty(pending_row.group_name),
          })),
      };
    },
    // New recurring expenses go to the shared ledger wallet; the allowance
    // wallet arrives with the household screens (Step 8).
    createRecurringExpense: (recurring_fields: RecurringExpenseFields) =>
      ledger_commands.createRecurringExpense({ ...recurring_fields, wallet: "ledger" }),
    async updateRecurringExpense(recurring_id: string, recurring_fields: RecurringExpenseFields) {
      const [wallet_row] = await local_db.select(
        "SELECT wallet FROM recurring_expenses WHERE id = ? AND deleted = 0",
        [recurring_id]
      );
      return ledger_commands.updateRecurringExpense(recurring_id, {
        ...recurring_fields,
        wallet: (wallet_row?.wallet as "ledger" | "allowance" | undefined) ?? "ledger",
      });
    },
    deleteRecurringExpense: (recurring_id: string) =>
      ledger_commands.deleteRecurringExpense(recurring_id),
    confirmRecurringExpense: (recurring_id: string, amount: number, year_month: string) =>
      ledger_commands.confirmRecurringExpense(recurring_id, { amount, year_month }),

    // --- Savings ------------------------------------------------------------------
    async listSavingsGoals(): Promise<{ savings_goals: SavingsGoalView[] }> {
      const current_month = todayInJst().slice(0, 7);
      const goal_rows = await local_db.select(
        `SELECT sg.id, sg.name, sg.emoji, sg.monthly_amount, sg.target_amount, sg.deadline, sg.memo,
                COALESCE((SELECT SUM(sp.amount) FROM savings_postings sp
                          WHERE sp.goal_id = sg.id AND sp.deleted = 0), 0)
                + COALESCE((SELECT SUM(sa.amount) FROM surplus_allocations sa
                            WHERE sa.savings_goal_id = sg.id AND sa.destination = 'savings'
                              AND sa.deleted = 0), 0) AS accumulated_amount,
                EXISTS (SELECT 1 FROM savings_postings sp
                        WHERE sp.goal_id = sg.id AND sp.deleted = 0 AND sp.year_month = ?)
                  AS is_posted_this_month
         FROM savings_goals sg
         WHERE sg.ledger_id = ? AND sg.deleted = 0
         ORDER BY sg.created_at, sg.id`,
        [current_month, ledger_id]
      );
      return {
        savings_goals: goal_rows.map((goal_row) => ({
          id: String(goal_row.id),
          name: String(goal_row.name),
          emoji: textOrEmpty(goal_row.emoji),
          monthly_amount: Number(goal_row.monthly_amount),
          target_amount: Number(goal_row.target_amount),
          accumulated_amount: Number(goal_row.accumulated_amount),
          deadline: goal_row.deadline === null ? null : String(goal_row.deadline),
          memo: textOrEmpty(goal_row.memo),
          is_posted_this_month: Number(goal_row.is_posted_this_month) === 1,
        })),
      };
    },
    createSavingsGoal: (goal_fields: SavingsGoalFields) =>
      ledger_commands.createSavingsGoal(goal_fields),
    updateSavingsGoal: (goal_id: string, goal_fields: SavingsGoalFields) =>
      ledger_commands.updateSavingsGoal(goal_id, goal_fields),
    deleteSavingsGoal: (goal_id: string) => ledger_commands.deleteSavingsGoal(goal_id),
    postMonthlySavings: (goal_id: string, amount: number, year_month: string) =>
      ledger_commands.createSavingsPosting(goal_id, { amount, year_month }),

    // --- Category master ----------------------------------------------------------
    listStatementTypes: async (): Promise<{ statement_types: StatementTypeView[] }> => ({
      statement_types: [...STATEMENT_TYPE_VIEWS],
    }),
    listCategoryGroups: async (): Promise<{ category_groups: CategoryGroupView[] }> => ({
      category_groups: await listCategoryGroups(ledger_data),
    }),
    listExpenseCategories: async (): Promise<{ expense_categories: ExpenseCategoryView[] }> => ({
      expense_categories: await listExpenseCategories(ledger_data),
    }),
    createCategoryGroup: async (group_fields: CategoryGroupFields) =>
      ledger_commands.createCategoryGroup({
        name: group_fields.group_name,
        statement_type_code: statementTypeCodeById(group_fields.statement_type_id),
        description: group_fields.description ?? null,
      }),
    updateCategoryGroup: async (group_id: string, group_fields: CategoryGroupFields) =>
      ledger_commands.updateCategoryGroup(group_id, {
        name: group_fields.group_name,
        statement_type_code: statementTypeCodeById(group_fields.statement_type_id),
        description: group_fields.description ?? null,
      }),
    deleteCategoryGroup: (group_id: string) => ledger_commands.deleteCategoryGroup(group_id),
    createExpenseCategory: (category_fields: ExpenseCategoryFields) =>
      ledger_commands.createExpenseCategory({
        group_id: category_fields.group_id,
        name: category_fields.category_name,
        description: category_fields.description ?? null,
      }),
    updateExpenseCategory: (category_id: string, category_fields: ExpenseCategoryFields) =>
      ledger_commands.updateExpenseCategory(category_id, {
        group_id: category_fields.group_id,
        name: category_fields.category_name,
        description: category_fields.description ?? null,
      }),
    deleteExpenseCategory: (category_id: string) =>
      ledger_commands.deleteExpenseCategory(category_id),
  };
}

export type LedgerApi = ReturnType<typeof createLedgerApi>;

export function useLedgerApi(): LedgerApi {
  const ledger_data = useLedgerData();
  const { ledger_commands } = useAppSession().sync_client;
  return useMemo(
    () => createLedgerApi(ledger_data, ledger_commands),
    [ledger_data, ledger_commands]
  );
}

export const OFFLINE_EDIT_NOTICE = "オフラインのため閲覧のみです。接続すると編集できます";

// Online-only edits are disabled while the device is offline or the client is
// too old for the server; the screens still show the cached data.
export function useCanEditOnline(): boolean {
  const { phase } = useSyncStatus();
  return phase !== "offline" && phase !== "update_required";
}

// A message for a failed ledger command: the server's reason when it refused
// the edit, the offline notice, or a generic fallback.
export function commandErrorMessage(command_error: unknown, fallback_message: string): string {
  if (command_error instanceof CommandRejectedError || command_error instanceof OfflineError) {
    return command_error.message;
  }
  return fallback_message;
}
