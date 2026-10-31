//go:build integration

package repository_test

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/utibori-jp/atoikura/backend/internal/repository"
	"github.com/utibori-jp/atoikura/backend/internal/syncrules"
)

// Integration tests for the household lifecycle (design.md §6) and the
// allowance totals (§3.1).

func jstNow() time.Time {
	tokyo_location, _ := time.LoadLocation("Asia/Tokyo")
	return time.Now().In(tokyo_location)
}

func journalEntryOn(t *testing.T, entry_id string, ledger_target string, category_id string, amount int, transaction_date string) syncrules.Change {
	t.Helper()
	entry_change := journalEntryChange(t, entry_id, ledger_target, category_id, amount)
	entry_change.Fields["transaction_date"] = fieldValue(t, transaction_date)
	return entry_change
}

func mustCreateHousehold(t *testing.T, owner *syncUser) string {
	t.Helper()
	household_id, err := testRepo.CreateHousehold(context.Background(), owner.UserID, "Family")
	if err != nil {
		t.Fatalf("creating household: %v", err)
	}
	owner.HouseholdID = household_id
	return household_id
}

func mustInvite(t *testing.T, member syncUser) *repository.CreatedInvitation {
	t.Helper()
	created_invitation, err := testRepo.CreateHouseholdInvitation(context.Background(), member.UserID)
	if err != nil {
		t.Fatalf("creating invitation: %v", err)
	}
	return created_invitation
}

func mustJoin(t *testing.T, joiner *syncUser, join_input repository.JoinInput) {
	t.Helper()
	household_id, err := testRepo.JoinHousehold(context.Background(), joiner.UserID, join_input)
	if err != nil {
		t.Fatalf("joining household: %v", err)
	}
	joiner.HouseholdID = household_id
}

// rowsOf returns the live pulled rows of a collection in a ledger.
func rowsOf(rows_by_key map[string]repository.PulledRow, collection string, ledger_id string) []repository.PulledRow {
	matching_rows := []repository.PulledRow{}
	for _, pulled_row := range rows_by_key {
		if pulled_row.Collection == collection && pulled_row.LedgerID == ledger_id && !pulled_row.Deleted {
			matching_rows = append(matching_rows, pulled_row)
		}
	}
	return matching_rows
}

func dataNumber(t *testing.T, pulled_row repository.PulledRow, column_name string) int64 {
	t.Helper()
	var column_number int64
	if err := json.Unmarshal(pulled_row.Data[column_name], &column_number); err != nil {
		t.Fatalf("column %s of %s is not a number: %s", column_name, pulled_row.Collection, pulled_row.Data[column_name])
	}
	return column_number
}

func TestHousehold_CreateCopiesMasterAndBaseIncome(t *testing.T) {
	ctx := context.Background()
	owner := newSyncUser(t, "hh-create")
	personal_caller := repository.PersonalCaller(owner.UserID)
	mustCommand(t)(testRepo.PutLedgerBaseIncome(ctx, personal_caller, 300000))
	_, rent_category := createGroupAndCategory(t, personal_caller, "Housing")
	rent_amount := int32(80000)
	mustCommand(t)(testRepo.CreateLedgerRecurringExpense(ctx, personal_caller, sampleRecurring("fixed", rent_category.ID, &rent_amount, 25)))
	_, dropped_category := createGroupAndCategory(t, personal_caller, "Dropped")
	mustCommand(t)(testRepo.DeleteLedgerExpenseCategory(ctx, personal_caller, dropped_category.ID))
	mustApply(t, owner.UserID, journalEntryChange(t, newUUID(t), "personal", owner.CategoryID, 1200))

	household_id := mustCreateHousehold(t, &owner)

	pulled_ledgers, rows_by_key := pullAll(t, owner.UserID)
	if pulled_ledgers.HouseholdID != household_id || pulled_ledgers.PersonalID != owner.LedgerID {
		t.Fatalf("ledgers = %+v", pulled_ledgers)
	}
	personal_category_names := map[string]bool{}
	for _, category_row := range rowsOf(rows_by_key, "expense_categories", owner.LedgerID) {
		personal_category_names[dataText(t, category_row, "name")] = true
	}
	household_categories := rowsOf(rows_by_key, "expense_categories", household_id)
	household_category_ids := map[string]string{}
	for _, category_row := range household_categories {
		category_name := dataText(t, category_row, "name")
		if !personal_category_names[category_name] {
			t.Errorf("household category %q is not one of the personal ones", category_name)
		}
		household_category_ids[category_name] = category_row.ID
	}
	if len(household_categories) != len(personal_category_names) {
		t.Fatalf("household has %d categories, personal ledger %d live ones", len(household_categories), len(personal_category_names))
	}
	if _, has_dropped := household_category_ids["Dropped category"]; has_dropped {
		t.Fatal("a deleted category was copied")
	}
	if household_category_ids["Housing category"] == rent_category.ID {
		t.Fatal("the copied category kept its ID")
	}

	household_recurring := rowsOf(rows_by_key, "recurring_expenses", household_id)
	if len(household_recurring) != 1 || dataText(t, household_recurring[0], "category_id") != household_category_ids["Housing category"] {
		t.Fatalf("household recurring expenses = %+v", household_recurring)
	}
	household_base_incomes := rowsOf(rows_by_key, "base_incomes", household_id)
	if len(household_base_incomes) != 1 || dataNumber(t, household_base_incomes[0], "amount") != 300000 {
		t.Fatalf("household base incomes = %+v", household_base_incomes)
	}
	// The only entry is this month's posting of the copied rent (design.md Q7
	// leaves the double count to the users); no history was copied.
	for _, household_entry := range rowsOf(rows_by_key, "journal_entries", household_id) {
		if string(household_entry.Data["recurring_expense_id"]) != `"`+household_recurring[0].ID+`"` {
			t.Fatalf("a journal entry was copied: %+v", household_entry)
		}
	}
	owner_memberships := rowsOf(rows_by_key, "ledger_members", household_id)
	if len(owner_memberships) != 1 || dataText(t, owner_memberships[0], "role") != "owner" {
		t.Fatalf("household members = %+v", owner_memberships)
	}

	_, err := testRepo.CreateHousehold(ctx, owner.UserID, "Second")
	expectCommandError(t, err, repository.CommandConflict)
}

func TestHousehold_InviteAndJoin(t *testing.T) {
	ctx := context.Background()
	owner := newSyncUser(t, "hh-owner")
	code_joiner := newSyncUser(t, "hh-code")
	token_joiner := newSyncUser(t, "hh-token")
	household_id := mustCreateHousehold(t, &owner)
	mustCommand(t)(testRepo.PutLedgerBaseIncome(ctx, repository.PersonalCaller(code_joiner.UserID), 220000))
	owner_secret_entry := newUUID(t)
	mustApply(t, owner.UserID, journalEntryChange(t, owner_secret_entry, "personal", owner.CategoryID, 999))

	code_invitation := mustInvite(t, owner)
	if len(code_invitation.ShortCode) != repository.ShortCodeLength || len(code_invitation.Token) < 40 {
		t.Fatalf("invitation = %+v", code_invitation)
	}
	typed_code := strings.ToLower(code_invitation.ShortCode[:4] + "-" + code_invitation.ShortCode[4:])
	mustJoin(t, &code_joiner, repository.JoinInput{ShortCode: typed_code})
	if code_joiner.HouseholdID != household_id {
		t.Fatalf("joined %s, want %s", code_joiner.HouseholdID, household_id)
	}

	// Single use: the same code and token no longer work.
	_, err := testRepo.JoinHousehold(ctx, token_joiner.UserID, repository.JoinInput{ShortCode: code_invitation.ShortCode})
	expectCommandError(t, err, repository.CommandNotFound)
	_, err = testRepo.JoinHousehold(ctx, token_joiner.UserID, repository.JoinInput{Token: code_invitation.Token})
	expectCommandError(t, err, repository.CommandNotFound)

	// A member can invite too; the link's token works as well.
	token_invitation := mustInvite(t, code_joiner)
	mustJoin(t, &token_joiner, repository.JoinInput{Token: token_invitation.Token})

	// Already attached: joining again is refused.
	another_invitation := mustInvite(t, owner)
	_, err = testRepo.JoinHousehold(ctx, code_joiner.UserID, repository.JoinInput{Token: another_invitation.Token})
	expectCommandError(t, err, repository.CommandConflict)

	pulled_ledgers, rows_by_key := pullAll(t, code_joiner.UserID)
	if pulled_ledgers.HouseholdID != household_id || pulled_ledgers.PersonalID != code_joiner.LedgerID {
		t.Fatalf("joiner ledgers = %+v", pulled_ledgers)
	}
	if household_members := rowsOf(rows_by_key, "ledger_members", household_id); len(household_members) != 3 {
		t.Fatalf("household members = %d, want 3", len(household_members))
	}
	joiner_base_income_found := false
	for _, base_income_row := range rowsOf(rows_by_key, "base_incomes", household_id) {
		if dataNumber(t, base_income_row, "member_id") == code_joiner.UserID {
			joiner_base_income_found = dataNumber(t, base_income_row, "amount") == 220000
		}
	}
	if !joiner_base_income_found {
		t.Fatal("the joiner's base income was not copied into the household")
	}
	// Other members' personal ledgers never reach the joiner.
	if _, leaked := rows_by_key["journal_entries/"+owner_secret_entry]; leaked {
		t.Fatal("the owner's personal entry reached another member")
	}
	if len(rowsOf(rows_by_key, "expense_categories", owner.LedgerID)) != 0 {
		t.Fatal("the owner's personal categories reached another member")
	}
}

func TestHousehold_InvitationLimits(t *testing.T) {
	ctx := context.Background()
	owner := newSyncUser(t, "hh-limit-owner")
	outsider := newSyncUser(t, "hh-limit-outsider")
	other_owner := newSyncUser(t, "hh-limit-other")
	mustCreateHousehold(t, &owner)
	mustCreateHousehold(t, &other_owner)

	_, err := testRepo.CreateHouseholdInvitation(ctx, outsider.UserID)
	expectCommandError(t, err, repository.CommandForbidden)

	expired_invitation := mustInvite(t, owner)
	if _, err := testPool.Exec(ctx, "UPDATE lf.household_invitations SET expires_at = NOW() - INTERVAL '1 minute' WHERE id = $1::uuid", expired_invitation.ID); err != nil {
		t.Fatalf("expiring invitation: %v", err)
	}
	_, err = testRepo.JoinHousehold(ctx, outsider.UserID, repository.JoinInput{Token: expired_invitation.Token})
	expectCommandError(t, err, repository.CommandNotFound)

	revoked_invitation := mustInvite(t, owner)
	// Another household can't see or revoke it.
	expectCommandError(t, testRepo.RevokeHouseholdInvitation(ctx, other_owner.UserID, revoked_invitation.ID), repository.CommandNotFound)
	other_invitations, err := testRepo.ListHouseholdInvitations(ctx, other_owner.UserID)
	if err != nil || len(other_invitations) != 0 {
		t.Fatalf("other household's invitations = %+v, %v", other_invitations, err)
	}
	open_invitations, err := testRepo.ListHouseholdInvitations(ctx, owner.UserID)
	if err != nil || len(open_invitations) != 1 || open_invitations[0].ID != revoked_invitation.ID {
		t.Fatalf("open invitations = %+v, %v", open_invitations, err)
	}
	if err := testRepo.RevokeHouseholdInvitation(ctx, owner.UserID, revoked_invitation.ID); err != nil {
		t.Fatalf("revoking: %v", err)
	}
	_, err = testRepo.JoinHousehold(ctx, outsider.UserID, repository.JoinInput{ShortCode: revoked_invitation.ShortCode})
	expectCommandError(t, err, repository.CommandNotFound)

	// The tokens are stored as hashes only.
	var stored_token_count int
	if err := testPool.QueryRow(ctx,
		"SELECT COUNT(*) FROM lf.household_invitations WHERE token_hash = convert_to($1, 'UTF8')", revoked_invitation.Token,
	).Scan(&stored_token_count); err != nil || stored_token_count != 0 {
		t.Fatalf("plain token stored: %d, %v", stored_token_count, err)
	}

	for invitation_number := 0; invitation_number < 10; invitation_number++ {
		if _, err := testRepo.CreateHouseholdInvitation(ctx, owner.UserID); err != nil {
			t.Fatalf("invitation %d: %v", invitation_number, err)
		}
	}
	_, err = testRepo.CreateHouseholdInvitation(ctx, owner.UserID)
	expectCommandError(t, err, repository.CommandConflict)
}

func TestHousehold_JoinFailuresAreRateLimited(t *testing.T) {
	ctx := context.Background()
	owner := newSyncUser(t, "hh-rate-owner")
	guesser := newSyncUser(t, "hh-rate-guesser")
	mustCreateHousehold(t, &owner)
	valid_invitation := mustInvite(t, owner)

	for attempt_number := 0; attempt_number < 10; attempt_number++ {
		_, err := testRepo.JoinHousehold(ctx, guesser.UserID, repository.JoinInput{ShortCode: "ZZZZZZZZ"})
		expectCommandError(t, err, repository.CommandNotFound)
	}
	_, err := testRepo.JoinHousehold(ctx, guesser.UserID, repository.JoinInput{ShortCode: valid_invitation.ShortCode})
	expectCommandError(t, err, repository.CommandTooManyRequests)

	// Other users are not affected.
	other_joiner := newSyncUser(t, "hh-rate-other")
	mustJoin(t, &other_joiner, repository.JoinInput{ShortCode: valid_invitation.ShortCode})
}

func TestHousehold_LeaveArchivesAndReturnsBaseIncome(t *testing.T) {
	ctx := context.Background()
	owner := newSyncUser(t, "hh-leave-owner")
	member := newSyncUser(t, "hh-leave-member")
	household_id := mustCreateHousehold(t, &owner)
	mustJoin(t, &member, repository.JoinInput{Token: mustInvite(t, owner).Token})

	_, household_category := createGroupAndCategory(t, repository.HouseholdCaller(owner.UserID), "Shared food")
	today := jstNow().Format("2006-01-02")
	tomorrow := jstNow().AddDate(0, 0, 1).Format("2006-01-02")
	shared_entry_id := newUUID(t)
	mustApply(t, member.UserID, journalEntryOn(t, shared_entry_id, "household", household_category.ID, 1800, today))
	owner_entry_id := newUUID(t)
	mustApply(t, owner.UserID, journalEntryOn(t, owner_entry_id, "household", household_category.ID, 700, today))
	future_entry_id := newUUID(t)
	mustApply(t, owner.UserID, journalEntryOn(t, future_entry_id, "household", household_category.ID, 500, tomorrow))
	household_caller := repository.HouseholdCaller(member.UserID)
	income_row := mustCommand(t)(testRepo.CreateLedgerIncomeRecord(ctx, household_caller, repository.IncomeRecordInput{
		TransactionDate: today, Amount: 250000, Name: "Salary", IncomeType: "salary",
	}))
	mustCommand(t)(testRepo.PutLedgerBaseIncome(ctx, household_caller, 250000))

	expectCommandError(t, testRepo.LeaveHousehold(ctx, owner.UserID), repository.CommandConflict)
	if err := testRepo.LeaveHousehold(ctx, member.UserID); err != nil {
		t.Fatalf("leaving: %v", err)
	}

	member_ledgers, member_rows := pullAll(t, member.UserID)
	if member_ledgers.HouseholdID != "" || len(member_ledgers.ArchiveIDs) != 1 {
		t.Fatalf("member ledgers after leaving = %+v", member_ledgers)
	}
	archive_id := member_ledgers.ArchiveIDs[0]
	if len(rowsOf(member_rows, "journal_entries", household_id)) != 0 {
		t.Fatal("the member still pulls the household")
	}
	archived_entries := rowsOf(member_rows, "journal_entries", archive_id)
	if len(archived_entries) != 2 {
		t.Fatalf("archived entries = %d, want 2 (up to today)", len(archived_entries))
	}
	archived_categories := rowsOf(member_rows, "expense_categories", archive_id)
	if len(archived_categories) != 1 || dataText(t, archived_categories[0], "name") != "Shared food category" {
		t.Fatalf("archived categories = %+v", archived_categories)
	}
	for _, archived_entry := range archived_entries {
		if dataText(t, archived_entry, "category_id") != archived_categories[0].ID {
			t.Fatalf("archived entry keeps the household category: %+v", archived_entry)
		}
	}
	if archived_income := rowsOf(member_rows, "income_records", archive_id); len(archived_income) != 1 || archived_income[0].ID == income_row.ID {
		t.Fatalf("archived income = %+v", archived_income)
	}
	personal_base_incomes := rowsOf(member_rows, "base_incomes", member.LedgerID)
	if len(personal_base_incomes) != 1 || dataNumber(t, personal_base_incomes[0], "amount") != 250000 {
		t.Fatalf("personal base income after leaving = %+v", personal_base_incomes)
	}

	// The archive is read-only, and the household is out of reach.
	expectRejected(t, pushOne(t, member.UserID, journalEntryOn(t, archived_entries[0].ID, "household", household_category.ID, 1, today)), syncrules.ReasonForbidden)
	expectRejected(t, pushOne(t, member.UserID, journalEntryOn(t, shared_entry_id, "household", household_category.ID, 1, today)), syncrules.ReasonForbidden)
	_, err := testRepo.CreateLedgerIncomeRecord(ctx, household_caller, sampleIncome(1))
	expectCommandError(t, err, repository.CommandForbidden)

	owner_ledgers, owner_rows := pullAll(t, owner.UserID)
	if owner_ledgers.HouseholdID != household_id {
		t.Fatalf("owner lost the household: %+v", owner_ledgers)
	}
	if len(rowsOf(owner_rows, "journal_entries", household_id)) != 3 {
		t.Fatal("the household changed for the remaining members")
	}
	for _, base_income_row := range rowsOf(owner_rows, "base_incomes", household_id) {
		if dataNumber(t, base_income_row, "member_id") == member.UserID {
			t.Fatal("the household still counts the former member's base income")
		}
	}
	for _, membership_row := range rowsOf(owner_rows, "ledger_members", household_id) {
		if dataNumber(t, membership_row, "user_id") == member.UserID && string(membership_row.Data["left_at"]) == "null" {
			t.Fatal("the former member's membership has no left_at")
		}
	}
	if _, archive_leaked := owner_rows["ledgers/"+archive_id]; archive_leaked {
		t.Fatal("another member can see the archive")
	}
}

func TestHousehold_RemoveAndDissolve(t *testing.T) {
	ctx := context.Background()
	owner := newSyncUser(t, "hh-dissolve-owner")
	member := newSyncUser(t, "hh-dissolve-member")
	household_id := mustCreateHousehold(t, &owner)
	mustJoin(t, &member, repository.JoinInput{Token: mustInvite(t, owner).Token})
	mustInvite(t, owner)

	expectCommandError(t, testRepo.RemoveHouseholdMember(ctx, member.UserID, owner.UserID), repository.CommandForbidden)
	expectCommandError(t, testRepo.RemoveHouseholdMember(ctx, owner.UserID, owner.UserID), repository.CommandConflict)
	expectCommandError(t, testRepo.RemoveHouseholdMember(ctx, owner.UserID, newSyncUser(t, "hh-stranger").UserID), repository.CommandNotFound)
	expectCommandError(t, testRepo.DissolveHousehold(ctx, member.UserID), repository.CommandForbidden)
	expectCommandError(t, testRepo.DissolveHousehold(ctx, owner.UserID), repository.CommandConflict)

	if err := testRepo.RemoveHouseholdMember(ctx, owner.UserID, member.UserID); err != nil {
		t.Fatalf("removing member: %v", err)
	}
	member_ledgers, _ := pullAll(t, member.UserID)
	if member_ledgers.HouseholdID != "" || len(member_ledgers.ArchiveIDs) != 1 {
		t.Fatalf("removed member ledgers = %+v", member_ledgers)
	}

	if err := testRepo.DissolveHousehold(ctx, owner.UserID); err != nil {
		t.Fatalf("dissolving: %v", err)
	}
	owner_ledgers, owner_rows := pullAll(t, owner.UserID)
	if owner_ledgers.HouseholdID != "" || len(owner_ledgers.ArchiveIDs) != 1 || owner_ledgers.ArchiveIDs[0] != household_id {
		t.Fatalf("owner ledgers after dissolving = %+v", owner_ledgers)
	}
	if dataText(t, owner_rows["ledgers/"+household_id], "kind") != "archive" {
		t.Fatal("the dissolved household is not an archive")
	}
	if len(rowsOf(owner_rows, "allowance_totals", household_id)) != 0 {
		t.Fatal("the archive kept allowance totals")
	}
	if open_count := countRows(t, "SELECT COUNT(*) FROM lf.household_invitations WHERE ledger_id = $1::uuid AND revoked_at IS NULL AND used_at IS NULL", household_id); open_count != 0 {
		t.Fatalf("open invitations after dissolving = %d", open_count)
	}
	_, err := testRepo.CreateLedgerIncomeRecord(ctx, repository.HouseholdCaller(owner.UserID), sampleIncome(1))
	expectCommandError(t, err, repository.CommandForbidden)

	// The owner can start a new household afterwards.
	if _, err := testRepo.CreateHousehold(ctx, owner.UserID, "Again"); err != nil {
		t.Fatalf("creating a household after dissolving: %v", err)
	}
}

func TestAllowanceTotals_FollowPersonalWrites(t *testing.T) {
	ctx := context.Background()
	owner := newSyncUser(t, "allow-owner")
	member := newSyncUser(t, "allow-member")
	household_id := mustCreateHousehold(t, &owner)
	mustJoin(t, &member, repository.JoinInput{Token: mustInvite(t, owner).Token})
	current_month := jstNow().Format("2006-01")
	today := jstNow().Format("2006-01-02")
	last_month_day := jstNow().AddDate(0, -1, -jstNow().Day()+1).Format("2006-01-02")

	memberTotals := func() (int64, int64, bool) {
		t.Helper()
		_, owner_rows := pullAll(t, owner.UserID)
		for _, totals_row := range rowsOf(owner_rows, "allowance_totals", household_id) {
			if dataNumber(t, totals_row, "member_id") == member.UserID && dataText(t, totals_row, "year_month") == current_month {
				return dataNumber(t, totals_row, "spent"), dataNumber(t, totals_row, "saved"), true
			}
		}
		return 0, 0, false
	}
	if spent, saved, found := memberTotals(); !found || spent != 0 || saved != 0 {
		t.Fatalf("totals after joining = %d/%d found:%v, want 0/0", spent, saved, found)
	}

	entry_id := newUUID(t)
	mustApply(t, member.UserID, journalEntryOn(t, entry_id, "personal", member.CategoryID, 1200, today))
	if spent, _, _ := memberTotals(); spent != 1200 {
		t.Fatalf("spent after push = %d, want 1200", spent)
	}
	edit_change := syncrules.Change{Collection: "journal_entries", ID: entry_id, Fields: map[string]syncrules.FieldValue{"amount": fieldValue(t, 1500)}}
	mustApply(t, member.UserID, edit_change)
	excluded_change := journalEntryOn(t, newUUID(t), "personal", member.CategoryID, 9000, today)
	excluded_change.Fields["is_excluded"] = fieldValue(t, true)
	mustApply(t, member.UserID, excluded_change)
	// A household entry is shared spending, not allowance spending.
	mustApply(t, member.UserID, journalEntryOn(t, newUUID(t), "household", liveCategoryOf(t, household_id), 4000, today))
	if spent, _, _ := memberTotals(); spent != 1500 {
		t.Fatalf("spent after edit = %d, want 1500", spent)
	}

	// Months before the join month are not covered.
	mustApply(t, member.UserID, journalEntryOn(t, newUUID(t), "personal", member.CategoryID, 800, last_month_day))
	if previous_month_count := countRows(t,
		"SELECT COUNT(*) FROM lf.allowance_totals WHERE ledger_id = $1::uuid AND member_id = $2 AND year_month < $3",
		household_id, member.UserID, current_month,
	); previous_month_count != 0 {
		t.Fatalf("totals before the join month = %d", previous_month_count)
	}

	personal_caller := repository.PersonalCaller(member.UserID)
	goal_row := mustCommand(t)(testRepo.CreateLedgerSavingsGoal(ctx, personal_caller, sampleGoal(0)))
	mustCommand(t)(testRepo.CreateLedgerSavingsPosting(ctx, personal_caller, goal_row.ID, 3000, current_month))
	if _, saved, _ := memberTotals(); saved != 3000 {
		t.Fatalf("saved after posting = %d, want 3000", saved)
	}

	// A personal surplus allocation is capped by the allowance balance:
	// 20000 − 1500 spent − 3000 saved = 15500.
	mustCommand(t)(testRepo.PutHouseholdAllowance(ctx, owner.UserID, member.UserID, current_month, 20000))
	_, err := testRepo.CreateLedgerSurplusAllocation(ctx, personal_caller, repository.SurplusAllocationInput{
		YearMonth: current_month, Amount: 15501, Destination: "savings", SavingsGoalID: &goal_row.ID,
	})
	expectCommandError(t, err, repository.CommandInvalid)
	_, err = testRepo.CreateLedgerSurplusAllocation(ctx, personal_caller, repository.SurplusAllocationInput{
		YearMonth: current_month, Amount: 100, Destination: "budget",
	})
	expectCommandError(t, err, repository.CommandInvalid)
	mustCommand(t)(testRepo.CreateLedgerSurplusAllocation(ctx, personal_caller, repository.SurplusAllocationInput{
		YearMonth: current_month, Amount: 15500, Destination: "savings", SavingsGoalID: &goal_row.ID,
	}))
	if spent, saved, _ := memberTotals(); spent != 1500 || saved != 18500 {
		t.Fatalf("totals after allocation = %d/%d, want 1500/18500", spent, saved)
	}

	// Deleting the entry takes it out again.
	mustApply(t, member.UserID, syncrules.Change{Collection: "journal_entries", ID: entry_id, DeletedHLC: strPtr(nextHLC())})
	if spent, _, _ := memberTotals(); spent != 0 {
		t.Fatalf("spent after delete = %d, want 0", spent)
	}

	// The owner sees the totals, never the entries behind them.
	_, owner_rows := pullAll(t, owner.UserID)
	if len(rowsOf(owner_rows, "journal_entries", member.LedgerID)) != 0 || len(rowsOf(owner_rows, "savings_goals", member.LedgerID)) != 0 {
		t.Fatal("the member's personal ledger reached the owner")
	}
}

// liveCategoryOf returns a live category of a ledger.
func liveCategoryOf(t *testing.T, ledger_id string) string {
	t.Helper()
	var category_id string
	if err := testPool.QueryRow(context.Background(),
		"SELECT id::text FROM lf.expense_categories WHERE ledger_id = $1::uuid AND deleted = false ORDER BY created_at LIMIT 1", ledger_id,
	).Scan(&category_id); err != nil {
		t.Fatalf("finding a category: %v", err)
	}
	return category_id
}

func TestHousehold_AllowanceCommand(t *testing.T) {
	ctx := context.Background()
	owner := newSyncUser(t, "allowance-cmd-owner")
	member := newSyncUser(t, "allowance-cmd-member")
	outsider := newSyncUser(t, "allowance-cmd-outsider")
	mustCreateHousehold(t, &owner)
	mustJoin(t, &member, repository.JoinInput{Token: mustInvite(t, owner).Token})

	first_row := mustCommand(t)(testRepo.PutHouseholdAllowance(ctx, member.UserID, owner.UserID, "2026-11", 30000))
	second_row := mustCommand(t)(testRepo.PutHouseholdAllowance(ctx, owner.UserID, owner.UserID, "2026-11", 35000))
	if first_row.ID != second_row.ID || dataNumber(t, *second_row, "amount") != 35000 {
		t.Fatalf("same month was not replaced: %+v / %+v", first_row, second_row)
	}
	_, err := testRepo.PutHouseholdAllowance(ctx, owner.UserID, outsider.UserID, "2026-11", 1000)
	expectCommandError(t, err, repository.CommandNotFound)
	_, err = testRepo.PutHouseholdAllowance(ctx, outsider.UserID, outsider.UserID, "2026-11", 1000)
	expectCommandError(t, err, repository.CommandForbidden)
}
