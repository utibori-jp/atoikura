//go:build integration

package repository_test

import (
	"context"
	"testing"

	"github.com/utibori-jp/atoikura/backend/internal/repository"
	"github.com/utibori-jp/atoikura/backend/internal/syncrules"
)

// Permission tests across households and archives (#208): a member of one
// household reaches nothing of another household, by any command or push, even
// with its row IDs, and an archive is visible to its owner only.

// newHouseholdPair creates a household through the real lifecycle: owner
// creates it, member joins with an invitation code.
func newHouseholdPair(t *testing.T, label string) (syncUser, syncUser, string) {
	t.Helper()
	owner := newSyncUser(t, label+"-owner")
	member := newSyncUser(t, label+"-member")
	household_id := mustCreateHousehold(t, &owner)
	mustJoin(t, &member, repository.JoinInput{ShortCode: mustInvite(t, owner).ShortCode})
	owner.HouseholdCategoryID = liveCategoryOf(t, household_id)
	member.HouseholdCategoryID = owner.HouseholdCategoryID
	return owner, member, household_id
}

func TestHouseholds_AreIsolatedFromEachOther(t *testing.T) {
	ctx := context.Background()
	owner_1, member_1, household_1 := newHouseholdPair(t, "iso-house-1")
	owner_2, _, household_2 := newHouseholdPair(t, "iso-house-2")

	household_1_caller := repository.HouseholdCaller(owner_1.UserID)
	group_row, category_row := createGroupAndCategory(t, household_1_caller, "Household 1 only")
	income_row := mustCommand(t)(testRepo.CreateLedgerIncomeRecord(ctx, household_1_caller, sampleIncome(1000)))
	recurring_row := mustCommand(t)(testRepo.CreateLedgerRecurringExpense(ctx, household_1_caller, sampleRecurring("variable", category_row.ID, nil, 1)))
	goal_row := mustCommand(t)(testRepo.CreateLedgerSavingsGoal(ctx, household_1_caller, sampleGoal(0)))
	shared_entry_id := newUUID(t)
	mustApply(t, owner_1.UserID, journalEntryChange(t, shared_entry_id, "household", category_row.ID, 100))

	// The other household's owner tries every command on household 1's rows,
	// through both of their targets.
	for _, outsider_caller := range []repository.Caller{repository.HouseholdCaller(owner_2.UserID), repository.PersonalCaller(owner_2.UserID)} {
		not_found_attempts := map[string]func() (*repository.PulledRow, error){
			"update group": func() (*repository.PulledRow, error) {
				return testRepo.UpdateLedgerCategoryGroup(ctx, outsider_caller, group_row.ID, repository.CategoryGroupInput{Name: "x", StatementTypeCode: "food"})
			},
			"delete group": func() (*repository.PulledRow, error) {
				return testRepo.DeleteLedgerCategoryGroup(ctx, outsider_caller, group_row.ID)
			},
			"update category": func() (*repository.PulledRow, error) {
				return testRepo.UpdateLedgerExpenseCategory(ctx, outsider_caller, category_row.ID, repository.ExpenseCategoryInput{GroupID: group_row.ID, Name: "x"})
			},
			"delete category": func() (*repository.PulledRow, error) {
				return testRepo.DeleteLedgerExpenseCategory(ctx, outsider_caller, category_row.ID)
			},
			"update income": func() (*repository.PulledRow, error) {
				return testRepo.UpdateLedgerIncomeRecord(ctx, outsider_caller, income_row.ID, sampleIncome(1))
			},
			"delete income": func() (*repository.PulledRow, error) {
				return testRepo.DeleteLedgerIncomeRecord(ctx, outsider_caller, income_row.ID)
			},
			"update recurring": func() (*repository.PulledRow, error) {
				return testRepo.UpdateLedgerRecurringExpense(ctx, outsider_caller, recurring_row.ID, sampleRecurring("variable", category_row.ID, nil, 1))
			},
			"delete recurring": func() (*repository.PulledRow, error) {
				return testRepo.DeleteLedgerRecurringExpense(ctx, outsider_caller, recurring_row.ID)
			},
			"confirm recurring": func() (*repository.PulledRow, error) {
				return testRepo.ConfirmLedgerRecurringExpense(ctx, outsider_caller, recurring_row.ID, 1, "2026-10")
			},
			"update goal": func() (*repository.PulledRow, error) {
				return testRepo.UpdateLedgerSavingsGoal(ctx, outsider_caller, goal_row.ID, sampleGoal(0))
			},
			"delete goal": func() (*repository.PulledRow, error) {
				return testRepo.DeleteLedgerSavingsGoal(ctx, outsider_caller, goal_row.ID)
			},
			"post to goal": func() (*repository.PulledRow, error) {
				return testRepo.CreateLedgerSavingsPosting(ctx, outsider_caller, goal_row.ID, 1, "2026-10")
			},
		}
		for attempt_name, attempt := range not_found_attempts {
			t.Run(string(outsider_caller.Target)+" "+attempt_name, func(t *testing.T) {
				_, err := attempt()
				expectCommandError(t, err, repository.CommandNotFound)
			})
		}
	}

	t.Run("household commands cannot reach the other household's members", func(t *testing.T) {
		_, err := testRepo.PutHouseholdAllowance(ctx, owner_2.UserID, member_1.UserID, "2026-11", 1000)
		expectCommandError(t, err, repository.CommandNotFound)
		expectCommandError(t, testRepo.RemoveHouseholdMember(ctx, owner_2.UserID, member_1.UserID), repository.CommandNotFound)
	})

	t.Run("pushes cannot write the other household's rows or use its categories", func(t *testing.T) {
		expectRejected(t, pushOne(t, owner_2.UserID, syncrules.Change{Collection: "journal_entries", ID: shared_entry_id, Fields: map[string]syncrules.FieldValue{
			"amount": fieldValue(t, 1),
		}}), syncrules.ReasonForbidden)
		deleted_hlc := nextHLC()
		expectRejected(t, pushOne(t, owner_2.UserID, syncrules.Change{Collection: "journal_entries", ID: shared_entry_id, DeletedHLC: &deleted_hlc}), syncrules.ReasonForbidden)
		expectRejected(t, pushOne(t, owner_2.UserID, journalEntryChange(t, newUUID(t), "household", category_row.ID, 1)), syncrules.ReasonInvalid)
	})

	t.Run("nothing changed in household 1", func(t *testing.T) {
		_, rows_by_key := pullAll(t, owner_1.UserID)
		for _, household_1_row := range []*repository.PulledRow{group_row, category_row, income_row, recurring_row, goal_row} {
			if expectPulled(t, rows_by_key, household_1_row).Deleted {
				t.Fatalf("household 1's %s was deleted", household_1_row.Collection)
			}
		}
		if stored_amount, is_deleted := storedAmount(t, shared_entry_id); stored_amount != 100 || is_deleted {
			t.Fatalf("household 1's entry changed: amount=%d deleted=%v", stored_amount, is_deleted)
		}
	})

	t.Run("the other household pulls nothing of household 1 or its members", func(t *testing.T) {
		pulled_ledgers, rows_by_key := pullAll(t, owner_2.UserID)
		if pulled_ledgers.HouseholdID != household_2 {
			t.Fatalf("owner 2's household = %s, want %s", pulled_ledgers.HouseholdID, household_2)
		}
		foreign_ledgers := map[string]bool{household_1: true, owner_1.LedgerID: true, member_1.LedgerID: true}
		for row_key, pulled_row := range rows_by_key {
			if foreign_ledgers[pulled_row.LedgerID] {
				t.Fatalf("owner 2 pulled %s from ledger %s", row_key, pulled_row.LedgerID)
			}
		}
	})
}

func TestArchive_IsVisibleToItsOwnerOnly(t *testing.T) {
	ctx := context.Background()
	owner, member, household_id := newHouseholdPair(t, "iso-archive")
	outsider := newSyncUser(t, "iso-archive-outsider")
	shared_recurring := mustCommand(t)(testRepo.CreateLedgerRecurringExpense(ctx, repository.HouseholdCaller(owner.UserID), sampleRecurring("variable", owner.HouseholdCategoryID, nil, 1)))
	mustApply(t, owner.UserID, journalEntryChange(t, newUUID(t), "household", owner.HouseholdCategoryID, 100))

	if err := testRepo.LeaveHousehold(ctx, member.UserID); err != nil {
		t.Fatalf("leaving: %v", err)
	}
	member_ledgers, member_rows := pullAll(t, member.UserID)
	if len(member_ledgers.ArchiveIDs) != 1 {
		t.Fatalf("member's archives = %v", member_ledgers.ArchiveIDs)
	}
	archive_id := member_ledgers.ArchiveIDs[0]
	if len(rowsOf(member_rows, "journal_entries", archive_id)) != 1 {
		t.Fatal("the archive is missing the household's entry")
	}

	t.Run("the member who left can no longer edit the household", func(t *testing.T) {
		_, err := testRepo.UpdateLedgerRecurringExpense(ctx, repository.HouseholdCaller(member.UserID), shared_recurring.ID, sampleRecurring("variable", owner.HouseholdCategoryID, nil, 2))
		expectCommandError(t, err, repository.CommandForbidden)
		if member_ledgers.HouseholdID != "" {
			t.Fatalf("member still has household %s", member_ledgers.HouseholdID)
		}
	})

	for _, other_user := range []syncUser{owner, outsider} {
		pulled_ledgers, rows_by_key := pullAll(t, other_user.UserID)
		for _, pulled_archive_id := range pulled_ledgers.ArchiveIDs {
			if pulled_archive_id == archive_id {
				t.Fatalf("user %d sees the member's archive", other_user.UserID)
			}
		}
		for row_key, pulled_row := range rows_by_key {
			if pulled_row.LedgerID == archive_id {
				t.Fatalf("user %d pulled %s from the member's archive", other_user.UserID, row_key)
			}
		}
	}
	// The household goes on for the owner.
	if owner_ledgers, _ := pullAll(t, owner.UserID); owner_ledgers.HouseholdID != household_id {
		t.Fatalf("owner's household = %s", owner_ledgers.HouseholdID)
	}
}
