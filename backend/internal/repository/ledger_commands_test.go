//go:build integration

package repository_test

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/utibori-jp/atoikura/backend/internal/repository"
	"github.com/utibori-jp/atoikura/backend/internal/syncrules"
)

// Integration tests for the online-only REST commands and server-side postings (#213).

// mustCommand returns a checker for a command result: mustCommand(t)(testRepo.X(...)).
func mustCommand(t *testing.T) func(*repository.PulledRow, error) *repository.PulledRow {
	t.Helper()
	return func(written_row *repository.PulledRow, err error) *repository.PulledRow {
		t.Helper()
		if err != nil {
			t.Fatalf("command failed: %v", err)
		}
		if written_row == nil || written_row.ID == "" || written_row.Seq == 0 {
			t.Fatalf("command returned %+v", written_row)
		}
		return written_row
	}
}

func expectCommandError(t *testing.T, err error, want_kind repository.CommandErrorKind) {
	t.Helper()
	var command_error *repository.CommandError
	if !errors.As(err, &command_error) || command_error.Kind != want_kind {
		t.Fatalf("err = %v, want command error kind %d", err, want_kind)
	}
}

func dataText(t *testing.T, pulled_row repository.PulledRow, column_name string) string {
	t.Helper()
	var column_text string
	if err := json.Unmarshal(pulled_row.Data[column_name], &column_text); err != nil {
		t.Fatalf("column %s of %s is not text: %s", column_name, pulled_row.Collection, pulled_row.Data[column_name])
	}
	return column_text
}

// expectPulled checks that the latest pulled version of a row matches the
// command's result.
func expectPulled(t *testing.T, rows_by_key map[string]repository.PulledRow, written_row *repository.PulledRow) repository.PulledRow {
	t.Helper()
	pulled_row, found := rows_by_key[written_row.Collection+"/"+written_row.ID]
	if !found {
		t.Fatalf("%s/%s missing from pull", written_row.Collection, written_row.ID)
	}
	if pulled_row.Seq != written_row.Seq || pulled_row.Deleted != written_row.Deleted {
		t.Fatalf("%s pulled seq/deleted = %d/%v, command returned %d/%v", written_row.Collection, pulled_row.Seq, pulled_row.Deleted, written_row.Seq, written_row.Deleted)
	}
	return pulled_row
}

func createGroupAndCategory(t *testing.T, user_id int64, group_name string) (*repository.PulledRow, *repository.PulledRow) {
	t.Helper()
	ctx := context.Background()
	group_row := mustCommand(t)(testRepo.CreateLedgerCategoryGroup(ctx, user_id, repository.CategoryGroupInput{Name: group_name, StatementTypeCode: "food"}))
	category_row := mustCommand(t)(testRepo.CreateLedgerExpenseCategory(ctx, user_id, repository.ExpenseCategoryInput{GroupID: group_row.ID, Name: group_name + " category"}))
	return group_row, category_row
}

func sampleIncome(amount int32) repository.IncomeRecordInput {
	return repository.IncomeRecordInput{TransactionDate: "2026-10-25", Amount: amount, Name: "Salary", IncomeType: "salary", Emoji: "💴"}
}

func sampleRecurring(wallet string, recurring_type string, category_id string, amount *int32, billing_day int16) repository.RecurringExpenseInput {
	return repository.RecurringExpenseInput{Wallet: wallet, Name: "Rent", Emoji: "🏠", BillingDay: billing_day, Amount: amount, Type: recurring_type, CategoryID: category_id}
}

func sampleGoal(monthly_amount int32) repository.SavingsGoalInput {
	return repository.SavingsGoalInput{Name: "Trip", Emoji: "✈️", MonthlyAmount: monthly_amount, TargetAmount: 100000, Deadline: strPtr("2027-03")}
}

func TestLedgerCommands_EveryCollectionReachesPull(t *testing.T) {
	ctx := context.Background()
	user_a := newSyncUser(t, "cmd-a")

	group_row, category_row := createGroupAndCategory(t, user_a.UserID, "Groceries")
	updated_group := mustCommand(t)(testRepo.UpdateLedgerCategoryGroup(ctx, user_a.UserID, group_row.ID, repository.CategoryGroupInput{Name: "Daily food", StatementTypeCode: "food", Description: strPtr("daily food")}))
	updated_category := mustCommand(t)(testRepo.UpdateLedgerExpenseCategory(ctx, user_a.UserID, category_row.ID, repository.ExpenseCategoryInput{GroupID: group_row.ID, Name: "Supermarket"}))

	income_row := mustCommand(t)(testRepo.CreateLedgerIncomeRecord(ctx, user_a.UserID, sampleIncome(300000)))
	updated_income := mustCommand(t)(testRepo.UpdateLedgerIncomeRecord(ctx, user_a.UserID, income_row.ID, sampleIncome(310000)))
	base_income_row := mustCommand(t)(testRepo.PutLedgerBaseIncome(ctx, user_a.UserID, 250000))
	updated_base_income := mustCommand(t)(testRepo.PutLedgerBaseIncome(ctx, user_a.UserID, 260000))
	if updated_base_income.ID != base_income_row.ID {
		t.Fatalf("base income upsert created a second row")
	}

	recurring_row := mustCommand(t)(testRepo.CreateLedgerRecurringExpense(ctx, user_a.UserID, sampleRecurring("ledger", "variable", updated_category.ID, nil, 27)))
	updated_recurring := mustCommand(t)(testRepo.UpdateLedgerRecurringExpense(ctx, user_a.UserID, recurring_row.ID, sampleRecurring("ledger", "variable", updated_category.ID, int32Ptr(9000), 27)))
	confirmed_entry := mustCommand(t)(testRepo.ConfirmLedgerRecurringExpense(ctx, user_a.UserID, recurring_row.ID, 8800, "2026-02"))

	goal_row := mustCommand(t)(testRepo.CreateLedgerSavingsGoal(ctx, user_a.UserID, sampleGoal(0)))
	updated_goal := mustCommand(t)(testRepo.UpdateLedgerSavingsGoal(ctx, user_a.UserID, goal_row.ID, sampleGoal(0)))
	posting_row := mustCommand(t)(testRepo.CreateLedgerSavingsPosting(ctx, user_a.UserID, goal_row.ID, 5000, "2026-10"))
	budget_row := mustCommand(t)(testRepo.PutLedgerBudget(ctx, user_a.UserID, repository.BudgetInput{MonthlyBudget: 80000, GoalAmount: 20000, GoalText: strPtr("save")}))
	surplus_row := mustCommand(t)(testRepo.CreateLedgerSurplusAllocation(ctx, user_a.UserID, repository.SurplusAllocationInput{
		YearMonth: "2026-10", Amount: 30000, Destination: "savings", SavingsGoalID: &goal_row.ID,
	}))

	deleted_income := mustCommand(t)(testRepo.DeleteLedgerIncomeRecord(ctx, user_a.UserID, income_row.ID))
	deleted_recurring := mustCommand(t)(testRepo.DeleteLedgerRecurringExpense(ctx, user_a.UserID, recurring_row.ID))

	_, rows_by_key := pullAll(t, user_a.UserID)
	pulled_group := expectPulled(t, rows_by_key, updated_group)
	if dataText(t, pulled_group, "name") != "Daily food" || dataText(t, pulled_group, "description") != "daily food" {
		t.Fatalf("pulled group = %v", pulled_group.Data)
	}
	expectPulled(t, rows_by_key, updated_category)
	expectPulled(t, rows_by_key, updated_base_income)
	expectPulled(t, rows_by_key, confirmed_entry)
	expectPulled(t, rows_by_key, updated_goal)
	expectPulled(t, rows_by_key, posting_row)
	expectPulled(t, rows_by_key, budget_row)
	expectPulled(t, rows_by_key, surplus_row)
	if !deleted_income.Deleted || !deleted_recurring.Deleted {
		t.Fatal("delete commands did not return tombstones")
	}
	expectPulled(t, rows_by_key, deleted_income)
	expectPulled(t, rows_by_key, deleted_recurring)
	if updated_income.Seq >= deleted_income.Seq || updated_recurring.Seq >= deleted_recurring.Seq {
		t.Fatal("seq did not grow across writes")
	}

	if dataText(t, *confirmed_entry, "transaction_date") != "2026-02-27" || string(confirmed_entry.Data["amount"]) != "8800" {
		t.Fatalf("confirmed entry = %v", confirmed_entry.Data)
	}
	if confirmed_entry.FieldHLC["amount"] == "" {
		t.Fatal("server posting has no field HLC")
	}
	if string(income_row.Data["earner_id"]) != fmt.Sprint(user_a.UserID) || string(base_income_row.Data["member_id"]) != fmt.Sprint(user_a.UserID) {
		t.Fatalf("earner/member = %s/%s, want the caller", income_row.Data["earner_id"], base_income_row.Data["member_id"])
	}
}

func TestLedgerCommands_IsolateOtherLedgers(t *testing.T) {
	ctx := context.Background()
	user_a := newSyncUser(t, "iso-a")
	user_b := newSyncUser(t, "iso-b")
	group_row, category_row := createGroupAndCategory(t, user_a.UserID, "A only")
	income_row := mustCommand(t)(testRepo.CreateLedgerIncomeRecord(ctx, user_a.UserID, sampleIncome(1000)))
	recurring_row := mustCommand(t)(testRepo.CreateLedgerRecurringExpense(ctx, user_a.UserID, sampleRecurring("ledger", "variable", category_row.ID, nil, 1)))
	goal_row := mustCommand(t)(testRepo.CreateLedgerSavingsGoal(ctx, user_a.UserID, sampleGoal(0)))

	not_found_attempts := map[string]func() (*repository.PulledRow, error){
		"update group": func() (*repository.PulledRow, error) {
			return testRepo.UpdateLedgerCategoryGroup(ctx, user_b.UserID, group_row.ID, repository.CategoryGroupInput{Name: "x", StatementTypeCode: "food"})
		},
		"delete group": func() (*repository.PulledRow, error) {
			return testRepo.DeleteLedgerCategoryGroup(ctx, user_b.UserID, group_row.ID)
		},
		"update category": func() (*repository.PulledRow, error) {
			return testRepo.UpdateLedgerExpenseCategory(ctx, user_b.UserID, category_row.ID, repository.ExpenseCategoryInput{GroupID: group_row.ID, Name: "x"})
		},
		"delete category": func() (*repository.PulledRow, error) {
			return testRepo.DeleteLedgerExpenseCategory(ctx, user_b.UserID, category_row.ID)
		},
		"update income": func() (*repository.PulledRow, error) {
			return testRepo.UpdateLedgerIncomeRecord(ctx, user_b.UserID, income_row.ID, sampleIncome(1))
		},
		"delete income": func() (*repository.PulledRow, error) {
			return testRepo.DeleteLedgerIncomeRecord(ctx, user_b.UserID, income_row.ID)
		},
		"update recurring": func() (*repository.PulledRow, error) {
			return testRepo.UpdateLedgerRecurringExpense(ctx, user_b.UserID, recurring_row.ID, sampleRecurring("ledger", "variable", category_row.ID, nil, 1))
		},
		"delete recurring": func() (*repository.PulledRow, error) {
			return testRepo.DeleteLedgerRecurringExpense(ctx, user_b.UserID, recurring_row.ID)
		},
		"confirm recurring": func() (*repository.PulledRow, error) {
			return testRepo.ConfirmLedgerRecurringExpense(ctx, user_b.UserID, recurring_row.ID, 1, "2026-10")
		},
		"update goal": func() (*repository.PulledRow, error) {
			return testRepo.UpdateLedgerSavingsGoal(ctx, user_b.UserID, goal_row.ID, sampleGoal(0))
		},
		"delete goal": func() (*repository.PulledRow, error) {
			return testRepo.DeleteLedgerSavingsGoal(ctx, user_b.UserID, goal_row.ID)
		},
		"post to goal": func() (*repository.PulledRow, error) {
			return testRepo.CreateLedgerSavingsPosting(ctx, user_b.UserID, goal_row.ID, 1, "2026-10")
		},
		"surplus to goal": func() (*repository.PulledRow, error) {
			return testRepo.CreateLedgerSurplusAllocation(ctx, user_b.UserID, repository.SurplusAllocationInput{YearMonth: "2026-10", Amount: 1, Destination: "savings", SavingsGoalID: &goal_row.ID})
		},
	}
	for attempt_name, attempt := range not_found_attempts {
		t.Run(attempt_name, func(t *testing.T) {
			_, err := attempt()
			expectCommandError(t, err, repository.CommandNotFound)
		})
	}
	t.Run("category in A's group", func(t *testing.T) {
		_, err := testRepo.CreateLedgerExpenseCategory(ctx, user_b.UserID, repository.ExpenseCategoryInput{GroupID: group_row.ID, Name: "x"})
		expectCommandError(t, err, repository.CommandInvalid)
	})
	t.Run("recurring with A's category", func(t *testing.T) {
		_, err := testRepo.CreateLedgerRecurringExpense(ctx, user_b.UserID, sampleRecurring("ledger", "fixed", category_row.ID, int32Ptr(1), 1))
		expectCommandError(t, err, repository.CommandInvalid)
	})

	_, rows_by_key := pullAll(t, user_a.UserID)
	for _, a_row := range []*repository.PulledRow{group_row, category_row, income_row, recurring_row, goal_row} {
		pulled_row := expectPulled(t, rows_by_key, a_row)
		if pulled_row.Deleted {
			t.Fatalf("A's %s was deleted by B", a_row.Collection)
		}
	}
	_, b_rows := pullAll(t, user_b.UserID)
	for row_key, pulled_row := range b_rows {
		if pulled_row.OwnerID == user_a.UserID {
			t.Fatalf("B pulled A's row %s", row_key)
		}
	}
}

func TestLedgerCommands_HouseholdPermissions(t *testing.T) {
	ctx := context.Background()
	user_a := newSyncUser(t, "perm-a")
	user_b := newSyncUser(t, "perm-b")

	t.Run("allowance recurring needs a household", func(t *testing.T) {
		_, err := testRepo.CreateLedgerRecurringExpense(ctx, user_a.UserID, sampleRecurring("allowance", "fixed", user_a.CategoryID, int32Ptr(1000), 1))
		expectCommandError(t, err, repository.CommandInvalid)
	})

	joinHousehold(t, &user_a, &user_b)
	a_income := mustCommand(t)(testRepo.CreateLedgerIncomeRecord(ctx, user_a.UserID, sampleIncome(1000)))
	shared_recurring := mustCommand(t)(testRepo.CreateLedgerRecurringExpense(ctx, user_a.UserID, sampleRecurring("ledger", "variable", user_a.CategoryID, nil, 5)))
	a_allowance_recurring := mustCommand(t)(testRepo.CreateLedgerRecurringExpense(ctx, user_a.UserID, sampleRecurring("allowance", "variable", user_a.CategoryID, nil, 5)))

	t.Run("income is edited by its earner only", func(t *testing.T) {
		_, err := testRepo.UpdateLedgerIncomeRecord(ctx, user_b.UserID, a_income.ID, sampleIncome(1))
		expectCommandError(t, err, repository.CommandForbidden)
		_, err = testRepo.DeleteLedgerIncomeRecord(ctx, user_b.UserID, a_income.ID)
		expectCommandError(t, err, repository.CommandForbidden)
	})
	t.Run("shared recurring is editable by any member", func(t *testing.T) {
		mustCommand(t)(testRepo.UpdateLedgerRecurringExpense(ctx, user_b.UserID, shared_recurring.ID, sampleRecurring("ledger", "variable", user_a.CategoryID, int32Ptr(5000), 5)))
		mustCommand(t)(testRepo.ConfirmLedgerRecurringExpense(ctx, user_b.UserID, shared_recurring.ID, 5100, "2026-10"))
	})
	t.Run("another member's allowance recurring is invisible", func(t *testing.T) {
		_, err := testRepo.UpdateLedgerRecurringExpense(ctx, user_b.UserID, a_allowance_recurring.ID, sampleRecurring("allowance", "variable", user_a.CategoryID, nil, 5))
		expectCommandError(t, err, repository.CommandNotFound)
		_, err = testRepo.ConfirmLedgerRecurringExpense(ctx, user_b.UserID, a_allowance_recurring.ID, 1, "2026-10")
		expectCommandError(t, err, repository.CommandNotFound)
		_, err = testRepo.DeleteLedgerRecurringExpense(ctx, user_b.UserID, a_allowance_recurring.ID)
		expectCommandError(t, err, repository.CommandNotFound)
	})
	t.Run("wallet can't change", func(t *testing.T) {
		_, err := testRepo.UpdateLedgerRecurringExpense(ctx, user_a.UserID, shared_recurring.ID, sampleRecurring("allowance", "variable", user_a.CategoryID, nil, 5))
		expectCommandError(t, err, repository.CommandInvalid)
	})
	t.Run("base incomes are per member", func(t *testing.T) {
		a_base := mustCommand(t)(testRepo.PutLedgerBaseIncome(ctx, user_a.UserID, 200000))
		b_base := mustCommand(t)(testRepo.PutLedgerBaseIncome(ctx, user_b.UserID, 100000))
		if a_base.ID == b_base.ID {
			t.Fatal("members share one base income row")
		}
	})
}

func TestLedgerCommands_Invariants(t *testing.T) {
	ctx := context.Background()
	user_a := newSyncUser(t, "inv-a")

	t.Run("unique group names among live groups", func(t *testing.T) {
		first_group := mustCommand(t)(testRepo.CreateLedgerCategoryGroup(ctx, user_a.UserID, repository.CategoryGroupInput{Name: "Utilities", StatementTypeCode: "fixed"}))
		_, err := testRepo.CreateLedgerCategoryGroup(ctx, user_a.UserID, repository.CategoryGroupInput{Name: "Utilities", StatementTypeCode: "other"})
		expectCommandError(t, err, repository.CommandConflict)
		mustCommand(t)(testRepo.DeleteLedgerCategoryGroup(ctx, user_a.UserID, first_group.ID))
		mustCommand(t)(testRepo.CreateLedgerCategoryGroup(ctx, user_a.UserID, repository.CategoryGroupInput{Name: "Utilities", StatementTypeCode: "fixed"}))
	})
	t.Run("unique category names within a group", func(t *testing.T) {
		group_row, category_row := createGroupAndCategory(t, user_a.UserID, "Hobby")
		_, err := testRepo.CreateLedgerExpenseCategory(ctx, user_a.UserID, repository.ExpenseCategoryInput{GroupID: group_row.ID, Name: dataText(t, *category_row, "name")})
		expectCommandError(t, err, repository.CommandConflict)
	})
	t.Run("group with live categories can't be deleted", func(t *testing.T) {
		group_row, category_row := createGroupAndCategory(t, user_a.UserID, "Pets")
		_, err := testRepo.DeleteLedgerCategoryGroup(ctx, user_a.UserID, group_row.ID)
		expectCommandError(t, err, repository.CommandInvalid)
		mustCommand(t)(testRepo.DeleteLedgerExpenseCategory(ctx, user_a.UserID, category_row.ID))
		mustCommand(t)(testRepo.DeleteLedgerCategoryGroup(ctx, user_a.UserID, group_row.ID))
		_, err = testRepo.CreateLedgerExpenseCategory(ctx, user_a.UserID, repository.ExpenseCategoryInput{GroupID: group_row.ID, Name: "late"})
		expectCommandError(t, err, repository.CommandInvalid)
	})
	t.Run("a variable month is confirmed once", func(t *testing.T) {
		recurring_row := mustCommand(t)(testRepo.CreateLedgerRecurringExpense(ctx, user_a.UserID, sampleRecurring("ledger", "variable", user_a.CategoryID, nil, 31)))
		confirmed_entry := mustCommand(t)(testRepo.ConfirmLedgerRecurringExpense(ctx, user_a.UserID, recurring_row.ID, 4000, "2026-02"))
		if dataText(t, *confirmed_entry, "transaction_date") != "2026-02-28" {
			t.Fatalf("billing day 31 in February = %s", dataText(t, *confirmed_entry, "transaction_date"))
		}
		_, err := testRepo.ConfirmLedgerRecurringExpense(ctx, user_a.UserID, recurring_row.ID, 4100, "2026-02")
		expectCommandError(t, err, repository.CommandConflict)
	})
}

func TestLedgerCommands_SurplusUpperBound(t *testing.T) {
	ctx := context.Background()
	user_a := newSyncUser(t, "surplus-a")
	mustCommand(t)(testRepo.CreateLedgerIncomeRecord(ctx, user_a.UserID, sampleIncome(300000)))
	mustCommand(t)(testRepo.PutLedgerBaseIncome(ctx, user_a.UserID, 250000))

	surplus_of := func(amount int32) repository.SurplusAllocationInput {
		return repository.SurplusAllocationInput{YearMonth: "2026-10", Amount: amount, Destination: "budget"}
	}
	mustCommand(t)(testRepo.CreateLedgerSurplusAllocation(ctx, user_a.UserID, surplus_of(30000)))
	_, err := testRepo.CreateLedgerSurplusAllocation(ctx, user_a.UserID, surplus_of(20001))
	expectCommandError(t, err, repository.CommandInvalid)

	// 20000 remain: of ten concurrent 5000 allocations exactly four fit.
	var applied_count, refused_count int
	var count_mutex sync.Mutex
	var allocators sync.WaitGroup
	for allocator_index := 0; allocator_index < 10; allocator_index++ {
		allocators.Add(1)
		go func() {
			defer allocators.Done()
			_, err := testRepo.CreateLedgerSurplusAllocation(ctx, user_a.UserID, surplus_of(5000))
			count_mutex.Lock()
			defer count_mutex.Unlock()
			var command_error *repository.CommandError
			switch {
			case err == nil:
				applied_count++
			case errors.As(err, &command_error) && command_error.Kind == repository.CommandInvalid:
				refused_count++
			default:
				t.Errorf("allocation failed: %v", err)
			}
		}()
	}
	allocators.Wait()
	if applied_count != 4 || refused_count != 6 {
		t.Fatalf("applied %d, refused %d; want 4 and 6", applied_count, refused_count)
	}
}

func countRows(t *testing.T, count_sql string, count_args ...any) int {
	t.Helper()
	var row_count int
	if err := testPool.QueryRow(context.Background(), count_sql, count_args...).Scan(&row_count); err != nil {
		t.Fatalf("counting rows: %v", err)
	}
	return row_count
}

func TestMonthlyPosting_ExactlyOnceUnderConcurrency(t *testing.T) {
	ctx := context.Background()
	user_a := newSyncUser(t, "post-a")
	user_b := newSyncUser(t, "post-b")
	household_id := joinHousehold(t, &user_a, &user_b)

	shared_rent := mustCommand(t)(testRepo.CreateLedgerRecurringExpense(ctx, user_a.UserID, sampleRecurring("ledger", "fixed", user_a.CategoryID, int32Ptr(80000), 31)))
	a_gym := mustCommand(t)(testRepo.CreateLedgerRecurringExpense(ctx, user_a.UserID, sampleRecurring("allowance", "fixed", user_a.CategoryID, int32Ptr(7000), 10)))
	variable_bill := mustCommand(t)(testRepo.CreateLedgerRecurringExpense(ctx, user_b.UserID, sampleRecurring("ledger", "variable", user_a.CategoryID, int32Ptr(9000), 20)))
	auto_goal := mustCommand(t)(testRepo.CreateLedgerSavingsGoal(ctx, user_a.UserID, sampleGoal(10000)))
	manual_goal := mustCommand(t)(testRepo.CreateLedgerSavingsGoal(ctx, user_b.UserID, sampleGoal(20000)))
	mustCommand(t)(testRepo.CreateLedgerSavingsPosting(ctx, user_b.UserID, manual_goal.ID, 15000, "2027-02"))

	var posters sync.WaitGroup
	for poster_index := 0; poster_index < 10; poster_index++ {
		posters.Add(1)
		go func() {
			defer posters.Done()
			if err := testRepo.PostMonthlyForLedger(ctx, household_id, "2027-02"); err != nil {
				t.Errorf("posting: %v", err)
			}
		}()
	}
	posters.Wait()

	for _, fixed_recurring := range []*repository.PulledRow{shared_rent, a_gym} {
		if posted_count := countRows(t, "SELECT COUNT(*) FROM lf.journal_entries WHERE recurring_expense_id = $1::uuid AND recurring_year_month = '2027-02'", fixed_recurring.ID); posted_count != 1 {
			t.Fatalf("recurring %s posted %d times", fixed_recurring.ID, posted_count)
		}
	}
	if posted_count := countRows(t, "SELECT COUNT(*) FROM lf.journal_entries WHERE recurring_expense_id = $1::uuid", variable_bill.ID); posted_count != 0 {
		t.Fatal("variable recurring expense was auto-posted")
	}
	if posting_count := countRows(t, "SELECT COUNT(*) FROM lf.savings_postings WHERE goal_id = $1::uuid AND year_month = '2027-02' AND kind = 'auto'", auto_goal.ID); posting_count != 1 {
		t.Fatalf("auto goal posted %d times", posting_count)
	}
	if posting_count := countRows(t, "SELECT COUNT(*) FROM lf.savings_postings WHERE goal_id = $1::uuid AND year_month = '2027-02'", manual_goal.ID); posting_count != 1 {
		t.Fatalf("goal with a manual posting got %d postings", posting_count)
	}

	_, rows_by_key := pullAll(t, user_a.UserID)
	var rent_posting *repository.PulledRow
	for _, pulled_row := range rows_by_key {
		if pulled_row.Collection == "journal_entries" && string(pulled_row.Data["recurring_expense_id"]) == `"`+shared_rent.ID+`"` && dataText(t, pulled_row, "recurring_year_month") == "2027-02" {
			found_row := pulled_row
			rent_posting = &found_row
		}
	}
	if rent_posting == nil {
		t.Fatal("rent posting missing from pull")
	}
	if dataText(t, *rent_posting, "transaction_date") != "2027-02-28" || rent_posting.OwnerID != user_a.UserID {
		t.Fatalf("rent posting = %v owner %d", rent_posting.Data, rent_posting.OwnerID)
	}
	if rent_posting.FieldHLC["amount"] == "" || !syncrules.CheckHLC(rent_posting.FieldHLC["amount"], time.Now()) {
		t.Fatalf("rent posting HLC = %v", rent_posting.FieldHLC)
	}
	gym_total := rows_by_key[fmt.Sprintf("allowance_totals/%d:2027-02", user_a.UserID)]
	if string(gym_total.Data["spent"]) != "7000" {
		t.Fatalf("allowance total after posting = %s", gym_total.Data["spent"])
	}

	// A second run finds nothing to post and writes nothing.
	seq_before := countRows(t, "SELECT last_value FROM lf.sync_seq")
	if err := testRepo.PostMonthlyForLedger(ctx, household_id, "2027-02"); err != nil {
		t.Fatalf("posting again: %v", err)
	}
	if seq_after := countRows(t, "SELECT last_value FROM lf.sync_seq"); seq_after != seq_before {
		t.Fatalf("idle posting allocated seq %d → %d", seq_before, seq_after)
	}

	// B's household pull hides A's allowance posting but shows its total.
	_, b_rows := pullAll(t, user_b.UserID)
	for _, pulled_row := range b_rows {
		if pulled_row.Collection == "journal_entries" && string(pulled_row.Data["recurring_expense_id"]) == `"`+a_gym.ID+`"` {
			t.Fatal("B pulled A's allowance posting")
		}
	}
	if _, found := b_rows[fmt.Sprintf("allowance_totals/%d:2027-02", user_a.UserID)]; !found {
		t.Fatal("B is missing A's allowance total")
	}
}

func TestPull_PostsCurrentMonth(t *testing.T) {
	ctx := context.Background()
	user_a := newSyncUser(t, "pullpost-a")
	rent := mustCommand(t)(testRepo.CreateLedgerRecurringExpense(ctx, user_a.UserID, sampleRecurring("ledger", "fixed", user_a.CategoryID, int32Ptr(1000), 1)))
	current_month := time.Now().In(time.FixedZone("Asia/Tokyo", 9*60*60)).Format("2006-01")

	_, rows_by_key := pullAll(t, user_a.UserID)
	for _, pulled_row := range rows_by_key {
		if pulled_row.Collection == "journal_entries" && string(pulled_row.Data["recurring_expense_id"]) == `"`+rent.ID+`"` && dataText(t, pulled_row, "recurring_year_month") == current_month {
			return
		}
	}
	t.Fatal("pull did not post the current month")
}

func TestAllowanceTotals_FollowPushes(t *testing.T) {
	user_a := newSyncUser(t, "total-a")
	user_b := newSyncUser(t, "total-b")
	joinHousehold(t, &user_a, &user_b)
	total_key := func(year_month string) string {
		return fmt.Sprintf("allowance_totals/%d:%s", user_a.UserID, year_month)
	}
	spent_in := func(year_month string) string {
		_, rows_by_key := pullAll(t, user_b.UserID)
		return string(rows_by_key[total_key(year_month)].Data["spent"])
	}

	allowance_entry_id := newUUID(t)
	mustApply(t, user_a.UserID, journalEntryChange(t, allowance_entry_id, "allowance", user_a.CategoryID, 200))
	excluded_entry := journalEntryChange(t, newUUID(t), "allowance", user_a.CategoryID, 50)
	excluded_entry.Fields["is_excluded"] = fieldValue(t, true)
	mustApply(t, user_a.UserID, excluded_entry)
	mustApply(t, user_a.UserID, journalEntryChange(t, newUUID(t), "ledger", user_a.CategoryID, 100))
	if spent := spent_in("2026-10"); spent != "200" {
		t.Fatalf("October spent = %s, want 200", spent)
	}

	mustApply(t, user_a.UserID, syncrules.Change{Collection: "journal_entries", ID: allowance_entry_id, Fields: map[string]syncrules.FieldValue{
		"transaction_date": fieldValue(t, "2026-11-02"),
	}})
	if spent := spent_in("2026-10"); spent != "0" {
		t.Fatalf("October spent after moving the entry = %s, want 0", spent)
	}
	if spent := spent_in("2026-11"); spent != "200" {
		t.Fatalf("November spent = %s, want 200", spent)
	}

	deleted_hlc := nextHLC()
	mustApply(t, user_a.UserID, syncrules.Change{Collection: "journal_entries", ID: allowance_entry_id, DeletedHLC: &deleted_hlc})
	if spent := spent_in("2026-11"); spent != "0" {
		t.Fatalf("November spent after delete = %s, want 0", spent)
	}
}
