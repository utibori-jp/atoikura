//go:build integration

package repository_test

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/utibori-jp/atoikura/backend/internal/repository"
	"github.com/utibori-jp/atoikura/backend/internal/syncrules"
)

// Integration tests for push/pull. They cover the security matrix of
// docs/local-first/sync-protocol.md §6.

var hlcCounter atomic.Int64

// nextHLC returns a fresh HLC that orders after every HLC returned before it.
func nextHLC() string {
	return fmt.Sprintf("%013d-%04x-itest", time.Now().UnixMilli(), hlcCounter.Add(1)%0x10000)
}

// olderHLC returns an HLC that orders before any HLC from nextHLC.
func olderHLC() string {
	return fmt.Sprintf("%013d-0000-itest", time.Now().Add(-time.Hour).UnixMilli())
}

func newUUID(t *testing.T) string {
	t.Helper()
	var generated_id string
	if err := testPool.QueryRow(context.Background(), "SELECT gen_random_uuid()::text").Scan(&generated_id); err != nil {
		t.Fatalf("generating uuid: %v", err)
	}
	return generated_id
}

type syncUser struct {
	UserID int64
	// LedgerID and CategoryID are in the user's personal ledger.
	LedgerID   string
	CategoryID string
	// HouseholdID and HouseholdCategoryID are set by joinHousehold.
	HouseholdID         string
	HouseholdCategoryID string
}

// newSyncUser creates a user with a personal ledger and one category in it.
func newSyncUser(t *testing.T, email_prefix string) syncUser {
	t.Helper()
	ctx := context.Background()
	user, err := testRepo.CreateUserWithDefaults(ctx, fmt.Sprintf("%s-%d@example.com", email_prefix, time.Now().UnixNano()), nil, "testhash")
	if err != nil {
		t.Fatalf("creating user: %v", err)
	}
	caller_ledgers, err := testRepo.EnsureCallerLedgers(ctx, user.ID)
	if err != nil {
		t.Fatalf("ensuring personal ledger: %v", err)
	}
	return syncUser{UserID: user.ID, LedgerID: caller_ledgers.PersonalID, CategoryID: insertCategory(t, caller_ledgers.PersonalID, user.ID)}
}

// insertCategory adds a category group and a category to a ledger. Online-only
// collections get REST commands in #213; until then tests insert them directly.
func insertCategory(t *testing.T, ledger_id string, owner_id int64) string {
	t.Helper()
	ctx := context.Background()
	group_id := newUUID(t)
	category_id := newUUID(t)
	if _, err := testPool.Exec(ctx,
		`INSERT INTO lf.category_groups (id, ledger_id, owner_id, seq, name, statement_type_code)
		 VALUES ($1::uuid, $2::uuid, $3, nextval('lf.sync_seq'), 'Food', 'food')`,
		group_id, ledger_id, owner_id,
	); err != nil {
		t.Fatalf("inserting category group: %v", err)
	}
	if _, err := testPool.Exec(ctx,
		`INSERT INTO lf.expense_categories (id, ledger_id, owner_id, seq, group_id, name)
		 VALUES ($1::uuid, $2::uuid, $3, nextval('lf.sync_seq'), $4::uuid, 'Groceries')`,
		category_id, ledger_id, owner_id, group_id,
	); err != nil {
		t.Fatalf("inserting category: %v", err)
	}
	return category_id
}

// joinHousehold attaches a new household ledger with one category to the users
// (design.md §6); their personal ledgers stay. The household commands come in
// the next Step 8 PR; until then tests set households up directly.
func joinHousehold(t *testing.T, members ...*syncUser) string {
	t.Helper()
	ctx := context.Background()
	household_id := newUUID(t)
	if _, err := testPool.Exec(ctx,
		`INSERT INTO lf.ledgers (id, ledger_id, owner_id, seq, kind) VALUES ($1::uuid, $1::uuid, $2, nextval('lf.sync_seq'), 'household')`,
		household_id, members[0].UserID,
	); err != nil {
		t.Fatalf("inserting household: %v", err)
	}
	for member_index, member := range members {
		member_role := "member"
		if member_index == 0 {
			member_role = "owner"
		}
		if _, err := testPool.Exec(ctx,
			`INSERT INTO lf.ledger_members (id, ledger_id, owner_id, seq, user_id, role, ledger_kind)
			 VALUES (gen_random_uuid(), $1::uuid, $2, nextval('lf.sync_seq'), $2, $3, 'household')`,
			household_id, member.UserID, member_role,
		); err != nil {
			t.Fatalf("joining household: %v", err)
		}
		member.HouseholdID = household_id
	}
	category_id := insertCategory(t, household_id, members[0].UserID)
	for _, member := range members {
		member.HouseholdCategoryID = category_id
	}
	return household_id
}

func fieldValue(t *testing.T, value any) syncrules.FieldValue {
	t.Helper()
	encoded_value, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("encoding field value: %v", err)
	}
	return syncrules.FieldValue{Value: encoded_value, HLC: nextHLC()}
}

func journalEntryChange(t *testing.T, entry_id string, ledger_target string, category_id string, amount int) syncrules.Change {
	t.Helper()
	return syncrules.Change{
		Collection: "journal_entries",
		ID:         entry_id,
		Fields: map[string]syncrules.FieldValue{
			"ledger":           fieldValue(t, ledger_target),
			"transaction_date": fieldValue(t, "2026-10-01"),
			"item":             fieldValue(t, "lunch"),
			"amount":           fieldValue(t, amount),
			"is_excluded":      fieldValue(t, false),
			"category_id":      fieldValue(t, category_id),
		},
	}
}

func dailyNoteChange(t *testing.T, note_id string, date string, note string) syncrules.Change {
	t.Helper()
	return syncrules.Change{
		Collection: "daily_notes",
		ID:         note_id,
		Fields: map[string]syncrules.FieldValue{
			"date": fieldValue(t, date),
			"note": fieldValue(t, note),
		},
	}
}

func pushOne(t *testing.T, user_id int64, change syncrules.Change) repository.PushResult {
	t.Helper()
	encoded_change, err := json.Marshal(change)
	if err != nil {
		t.Fatalf("encoding change: %v", err)
	}
	push_results, err := testRepo.Push(context.Background(), user_id, []repository.PushInput{{Change: change, Size: len(encoded_change)}})
	if err != nil {
		t.Fatalf("push: %v", err)
	}
	if len(push_results) != 1 {
		t.Fatalf("push results = %d, want 1", len(push_results))
	}
	return push_results[0]
}

func mustApply(t *testing.T, user_id int64, change syncrules.Change) repository.PushResult {
	t.Helper()
	push_result := pushOne(t, user_id, change)
	if !push_result.Applied {
		t.Fatalf("push %s rejected: %s %s", change.ID, push_result.Reason, push_result.Message)
	}
	return push_result
}

func expectRejected(t *testing.T, push_result repository.PushResult, want_reason string) {
	t.Helper()
	if push_result.Applied || push_result.Reason != want_reason {
		t.Fatalf("push result = applied:%v reason:%q, want rejected %q", push_result.Applied, push_result.Reason, want_reason)
	}
}

// pullAll pulls every visible row from cursor 0 and indexes them by collection/id.
func pullAll(t *testing.T, user_id int64) (repository.CallerLedgers, map[string]repository.PulledRow) {
	t.Helper()
	rows_by_key := map[string]repository.PulledRow{}
	var since int64
	var pulled_ledgers repository.CallerLedgers
	for {
		pull_result, err := testRepo.Pull(context.Background(), user_id, since, 1000)
		if err != nil {
			t.Fatalf("pull: %v", err)
		}
		pulled_ledgers = pull_result.Ledgers
		for _, pulled_row := range pull_result.Rows {
			rows_by_key[pulled_row.Collection+"/"+pulled_row.ID] = pulled_row
		}
		since = pull_result.NextSince
		if !pull_result.HasMore {
			return pulled_ledgers, rows_by_key
		}
	}
}

func storedAmount(t *testing.T, entry_id string) (int, bool) {
	t.Helper()
	var stored_amount int
	var is_deleted bool
	if err := testPool.QueryRow(context.Background(),
		"SELECT amount, deleted FROM lf.journal_entries WHERE id = $1::uuid", entry_id,
	).Scan(&stored_amount, &is_deleted); err != nil {
		t.Fatalf("loading entry: %v", err)
	}
	return stored_amount, is_deleted
}

func TestEnsureCallerLedgers_IsStableAndConcurrentSafe(t *testing.T) {
	ctx := context.Background()
	user, err := testRepo.CreateUserWithDefaults(ctx, fmt.Sprintf("ledger-%d@example.com", time.Now().UnixNano()), nil, "testhash")
	if err != nil {
		t.Fatalf("creating user: %v", err)
	}
	ledger_ids := make([]string, 8)
	var wait_group sync.WaitGroup
	for worker_index := range ledger_ids {
		wait_group.Add(1)
		go func() {
			defer wait_group.Done()
			caller_ledgers, err := testRepo.EnsureCallerLedgers(ctx, user.ID)
			if err != nil {
				t.Errorf("ensuring ledger: %v", err)
				return
			}
			if caller_ledgers.HouseholdID != "" || len(caller_ledgers.ArchiveIDs) != 0 {
				t.Errorf("a new user has only a personal ledger: %+v", caller_ledgers)
			}
			ledger_ids[worker_index] = caller_ledgers.PersonalID
		}()
	}
	wait_group.Wait()
	for _, ledger_id := range ledger_ids {
		if ledger_id == "" || ledger_id != ledger_ids[0] {
			t.Fatalf("ledger ids differ: %v", ledger_ids)
		}
	}
	// Racing creations roll back as a whole: one set of default categories.
	var group_count, category_count int
	if err := testPool.QueryRow(ctx,
		`SELECT (SELECT COUNT(*) FROM lf.category_groups WHERE owner_id = $1),
		        (SELECT COUNT(*) FROM lf.expense_categories WHERE owner_id = $1)`,
		user.ID,
	).Scan(&group_count, &category_count); err != nil {
		t.Fatalf("counting categories: %v", err)
	}
	if group_count != 8 || category_count != 44 {
		t.Fatalf("seeded %d groups and %d categories, want 8 and 44", group_count, category_count)
	}
}

func TestEnsurePersonalLedger_SeedsDefaultCategoriesInOrder(t *testing.T) {
	ctx := context.Background()
	user, err := testRepo.CreateUserWithDefaults(ctx, fmt.Sprintf("defaults-%d@example.com", time.Now().UnixNano()), nil, "testhash")
	if err != nil {
		t.Fatalf("creating user: %v", err)
	}

	pull_result, err := testRepo.Pull(ctx, user.ID, 0, 500)
	if err != nil {
		t.Fatalf("pulling: %v", err)
	}

	// The first pull delivers the defaults, owned by the user.
	pulled_group_count := 0
	for _, pulled_row := range pull_result.Rows {
		if pulled_row.Collection == "category_groups" {
			pulled_group_count++
			if pulled_row.OwnerID != user.ID {
				t.Fatalf("group owner = %d, want %d", pulled_row.OwnerID, user.ID)
			}
		}
	}
	if pulled_group_count != 8 {
		t.Fatalf("pulled %d category groups, want 8", pulled_group_count)
	}

	// Devices list categories by created_at: it must keep the default order.
	group_rows, err := testPool.Query(ctx,
		`SELECT cg.name, cg.statement_type_code,
		        (SELECT ec.name FROM lf.expense_categories ec WHERE ec.group_id = cg.id ORDER BY ec.created_at LIMIT 1)
		 FROM lf.category_groups cg WHERE cg.ledger_id = $1::uuid ORDER BY cg.created_at`,
		pull_result.Ledgers.PersonalID,
	)
	if err != nil {
		t.Fatalf("listing groups: %v", err)
	}
	defer group_rows.Close()
	var listed_groups []string
	for group_rows.Next() {
		var group_name, type_code, first_category_name string
		if err := group_rows.Scan(&group_name, &type_code, &first_category_name); err != nil {
			t.Fatalf("scanning group: %v", err)
		}
		listed_groups = append(listed_groups, group_name+"/"+type_code+"/"+first_category_name)
	}
	want_groups := []string{
		"食費/food/スーパー・自炊",
		"日用品/other/生活消耗品",
		"趣味・娯楽/other/遊び・娯楽",
		"交通・車両費/other/電車・バス",
		"自己投資/other/書籍（勉強・実用）",
		"医療・健康/other/医療費・薬",
		"固定費/fixed/家賃",
		"経費精算/excluded/経費立替",
	}
	if strings.Join(listed_groups, ", ") != strings.Join(want_groups, ", ") {
		t.Fatalf("groups = %v, want %v", listed_groups, want_groups)
	}
}

func TestPush_AppliesAndPullReturnsRow(t *testing.T) {
	user_a := newSyncUser(t, "push-a")
	entry_id := newUUID(t)

	push_result := mustApply(t, user_a.UserID, journalEntryChange(t, entry_id, "personal", user_a.CategoryID, 1200))
	if push_result.Seq == nil {
		t.Fatal("seq missing on applied change")
	}

	pulled_ledgers, rows_by_key := pullAll(t, user_a.UserID)
	if pulled_ledgers.PersonalID != user_a.LedgerID {
		t.Fatalf("personal ledger = %s, want %s", pulled_ledgers.PersonalID, user_a.LedgerID)
	}
	pulled_entry, found := rows_by_key["journal_entries/"+entry_id]
	if !found {
		t.Fatal("pushed entry missing from pull")
	}
	if pulled_entry.OwnerID != user_a.UserID || pulled_entry.LedgerID != user_a.LedgerID || pulled_entry.Seq != *push_result.Seq {
		t.Fatalf("pulled entry owner/seq = %d/%d", pulled_entry.OwnerID, pulled_entry.Seq)
	}
	if string(pulled_entry.Data["amount"]) != "1200" || pulled_entry.FieldHLC["amount"] == "" {
		t.Fatalf("pulled entry data = %s, field_hlc = %v", pulled_entry.Data["amount"], pulled_entry.FieldHLC)
	}
	for _, envelope_column := range []string{"ledger_id", "owner_id", "field_hlc", "seq"} {
		if _, found := pulled_entry.Data[envelope_column]; found {
			t.Fatalf("envelope column %s leaked into data", envelope_column)
		}
	}
}

func TestPush_FieldLWWAndTombstone(t *testing.T) {
	user_a := newSyncUser(t, "lww-a")
	entry_id := newUUID(t)
	mustApply(t, user_a.UserID, journalEntryChange(t, entry_id, "personal", user_a.CategoryID, 100))

	stale_change := syncrules.Change{Collection: "journal_entries", ID: entry_id, Fields: map[string]syncrules.FieldValue{
		"amount": {Value: json.RawMessage("999"), HLC: olderHLC()},
	}}
	stale_result := mustApply(t, user_a.UserID, stale_change)
	if len(stale_result.Superseded) != 1 || stale_result.Seq != nil {
		t.Fatalf("stale write: superseded=%v seq=%v", stale_result.Superseded, stale_result.Seq)
	}
	if stored_amount, _ := storedAmount(t, entry_id); stored_amount != 100 {
		t.Fatalf("amount = %d after stale write, want 100", stored_amount)
	}

	newer_change := syncrules.Change{Collection: "journal_entries", ID: entry_id, Fields: map[string]syncrules.FieldValue{"amount": fieldValue(t, 300)}}
	mustApply(t, user_a.UserID, newer_change)
	if stored_amount, _ := storedAmount(t, entry_id); stored_amount != 300 {
		t.Fatalf("amount = %d after newer write, want 300", stored_amount)
	}

	deleted_hlc := nextHLC()
	mustApply(t, user_a.UserID, syncrules.Change{Collection: "journal_entries", ID: entry_id, DeletedHLC: &deleted_hlc})
	after_tombstone := mustApply(t, user_a.UserID, syncrules.Change{Collection: "journal_entries", ID: entry_id, Fields: map[string]syncrules.FieldValue{"amount": fieldValue(t, 500)}})
	if len(after_tombstone.Superseded) != 1 {
		t.Fatalf("write after delete: superseded = %v, want [amount]", after_tombstone.Superseded)
	}
	stored_amount, is_deleted := storedAmount(t, entry_id)
	if !is_deleted || stored_amount != 300 {
		t.Fatalf("after delete: amount=%d deleted=%v", stored_amount, is_deleted)
	}
	_, rows_by_key := pullAll(t, user_a.UserID)
	if !rows_by_key["journal_entries/"+entry_id].Deleted {
		t.Fatal("tombstone not pulled")
	}
}

func TestPush_LedgerTarget(t *testing.T) {
	user_a := newSyncUser(t, "target-a")
	user_b := newSyncUser(t, "target-b")
	loner := newSyncUser(t, "target-loner")
	household_id := joinHousehold(t, &user_a, &user_b)

	t.Run("a new entry goes to the ledger its target names", func(t *testing.T) {
		personal_entry_id := newUUID(t)
		household_entry_id := newUUID(t)
		mustApply(t, user_a.UserID, journalEntryChange(t, personal_entry_id, "personal", user_a.CategoryID, 100))
		mustApply(t, user_a.UserID, journalEntryChange(t, household_entry_id, "household", user_a.HouseholdCategoryID, 200))
		if stored_ledger_id := storedLedgerID(t, "journal_entries", personal_entry_id); stored_ledger_id != user_a.LedgerID {
			t.Fatalf("personal entry stored in %s, want %s", stored_ledger_id, user_a.LedgerID)
		}
		if stored_ledger_id := storedLedgerID(t, "journal_entries", household_entry_id); stored_ledger_id != household_id {
			t.Fatalf("household entry stored in %s, want %s", stored_ledger_id, household_id)
		}
	})

	t.Run("an entry cannot move to the other ledger", func(t *testing.T) {
		entry_id := newUUID(t)
		mustApply(t, user_a.UserID, journalEntryChange(t, entry_id, "household", user_a.HouseholdCategoryID, 100))
		expectRejected(t, pushOne(t, user_a.UserID, syncrules.Change{Collection: "journal_entries", ID: entry_id, Fields: map[string]syncrules.FieldValue{
			"ledger": fieldValue(t, "personal"),
		}}), syncrules.ReasonImmutable)
		// Re-sending the same target with an edit is fine.
		mustApply(t, user_a.UserID, syncrules.Change{Collection: "journal_entries", ID: entry_id, Fields: map[string]syncrules.FieldValue{
			"ledger": fieldValue(t, "household"),
			"amount": fieldValue(t, 150),
		}})
		if stored_amount, _ := storedAmount(t, entry_id); stored_amount != 150 {
			t.Fatalf("amount = %d, want 150", stored_amount)
		}
	})

	t.Run("household needs an attached household", func(t *testing.T) {
		expectRejected(t, pushOne(t, loner.UserID, journalEntryChange(t, newUUID(t), "household", user_a.HouseholdCategoryID, 100)), syncrules.ReasonForbidden)
	})

	t.Run("a new entry needs a known target", func(t *testing.T) {
		missing_target := journalEntryChange(t, newUUID(t), "personal", user_a.CategoryID, 100)
		delete(missing_target.Fields, "ledger")
		expectRejected(t, pushOne(t, user_a.UserID, missing_target), syncrules.ReasonInvalid)
		for _, bad_target := range []string{"archive", household_id, "allowance"} {
			expectRejected(t, pushOne(t, user_a.UserID, journalEntryChange(t, newUUID(t), bad_target, user_a.CategoryID, 100)), syncrules.ReasonInvalid)
		}
	})

	t.Run("categories must belong to the target ledger", func(t *testing.T) {
		expectRejected(t, pushOne(t, user_a.UserID, journalEntryChange(t, newUUID(t), "household", user_a.CategoryID, 100)), syncrules.ReasonInvalid)
		expectRejected(t, pushOne(t, user_a.UserID, journalEntryChange(t, newUUID(t), "personal", user_a.HouseholdCategoryID, 100)), syncrules.ReasonInvalid)
		expectRejected(t, pushOne(t, user_a.UserID, journalEntryChange(t, newUUID(t), "personal", user_b.CategoryID, 100)), syncrules.ReasonInvalid)
	})

	t.Run("notes go to the personal ledger and may reflect on household categories", func(t *testing.T) {
		note_id := newUUID(t)
		mustApply(t, user_a.UserID, dailyNoteChange(t, note_id, "2026-10-06", "メモ"))
		if stored_ledger_id := storedLedgerID(t, "daily_notes", note_id); stored_ledger_id != user_a.LedgerID {
			t.Fatalf("note stored in %s, want the personal ledger", stored_ledger_id)
		}
		for _, category_id := range []string{user_a.CategoryID, user_a.HouseholdCategoryID} {
			mustApply(t, user_a.UserID, reviewNoteChange(t, newUUID(t), "2026-10", category_id, "ふりかえり"))
		}
		expectRejected(t, pushOne(t, loner.UserID, reviewNoteChange(t, newUUID(t), "2026-10", user_a.HouseholdCategoryID, "x")), syncrules.ReasonInvalid)
	})
}

func TestPush_ForbiddenOnOtherUsersRecord(t *testing.T) {
	user_a := newSyncUser(t, "forbid-a")
	user_b := newSyncUser(t, "forbid-b")
	entry_id := newUUID(t)
	mustApply(t, user_a.UserID, journalEntryChange(t, entry_id, "personal", user_a.CategoryID, 100))

	t.Run("update", func(t *testing.T) {
		expectRejected(t, pushOne(t, user_b.UserID, syncrules.Change{Collection: "journal_entries", ID: entry_id, Fields: map[string]syncrules.FieldValue{
			"amount": fieldValue(t, 1),
		}}), syncrules.ReasonForbidden)
	})
	t.Run("tombstone", func(t *testing.T) {
		deleted_hlc := nextHLC()
		expectRejected(t, pushOne(t, user_b.UserID, syncrules.Change{Collection: "journal_entries", ID: entry_id, DeletedHLC: &deleted_hlc}), syncrules.ReasonForbidden)
	})
	t.Run("create with existing id", func(t *testing.T) {
		expectRejected(t, pushOne(t, user_b.UserID, journalEntryChange(t, entry_id, "personal", user_b.CategoryID, 1)), syncrules.ReasonForbidden)
	})
	t.Run("create with existing id in different case", func(t *testing.T) {
		expectRejected(t, pushOne(t, user_b.UserID, journalEntryChange(t, strings.ToUpper(entry_id), "personal", user_b.CategoryID, 1)), syncrules.ReasonForbidden)
	})

	stored_amount, is_deleted := storedAmount(t, entry_id)
	if stored_amount != 100 || is_deleted {
		t.Fatalf("A's entry changed: amount=%d deleted=%v", stored_amount, is_deleted)
	}
}

func TestPush_RejectsCategoryFromAnotherLedger(t *testing.T) {
	user_a := newSyncUser(t, "category-a")
	user_b := newSyncUser(t, "category-b")
	expectRejected(t, pushOne(t, user_b.UserID, journalEntryChange(t, newUUID(t), "personal", user_a.CategoryID, 100)), syncrules.ReasonInvalid)
}

func TestPush_RejectsOwnershipFields(t *testing.T) {
	user_a := newSyncUser(t, "ownership-a")
	user_b := newSyncUser(t, "ownership-b")
	for _, forged_field := range []string{"owner_id", "ledger_id"} {
		forged_change := journalEntryChange(t, newUUID(t), "personal", user_b.CategoryID, 100)
		forged_change.Fields[forged_field] = fieldValue(t, user_a.LedgerID)
		expectRejected(t, pushOne(t, user_b.UserID, forged_change), syncrules.ReasonUnknownField)
	}
}

func TestPush_RejectsInvalidChanges(t *testing.T) {
	user_a := newSyncUser(t, "invalid-a")
	future_change := journalEntryChange(t, newUUID(t), "personal", user_a.CategoryID, 100)
	future_change.Fields["amount"] = syncrules.FieldValue{Value: json.RawMessage("100"), HLC: fmt.Sprintf("%013d-0000-itest", time.Now().Add(time.Hour).UnixMilli())}
	oversized_change := dailyNoteChange(t, newUUID(t), "2026-10-02", strings.Repeat("あ", 6000))
	too_long_note := dailyNoteChange(t, newUUID(t), "2026-10-02", strings.Repeat("a", 501))
	zero_amount := journalEntryChange(t, newUUID(t), "personal", user_a.CategoryID, 0)

	test_cases := []struct {
		name        string
		change      syncrules.Change
		want_reason string
	}{
		{"unknown collection", syncrules.Change{Collection: "budgets", ID: newUUID(t)}, syncrules.ReasonUnknownCollection},
		{"future HLC", future_change, syncrules.ReasonClockSkew},
		{"oversized change", oversized_change, syncrules.ReasonTooLarge},
		{"note too long", too_long_note, syncrules.ReasonInvalid},
		{"zero amount", zero_amount, syncrules.ReasonInvalid},
	}
	for _, test_case := range test_cases {
		t.Run(test_case.name, func(t *testing.T) {
			expectRejected(t, pushOne(t, user_a.UserID, test_case.change), test_case.want_reason)
		})
	}
	var stored_count int
	if err := testPool.QueryRow(context.Background(),
		"SELECT (SELECT COUNT(*) FROM lf.journal_entries WHERE owner_id = $1) + (SELECT COUNT(*) FROM lf.daily_notes WHERE owner_id = $1)", user_a.UserID,
	).Scan(&stored_count); err != nil {
		t.Fatalf("counting rows: %v", err)
	}
	if stored_count != 0 {
		t.Fatalf("rejected changes stored %d rows", stored_count)
	}
}

func TestPush_DailyNoteNaturalKeyMerge(t *testing.T) {
	user_a := newSyncUser(t, "note-a")
	first_note_id := newUUID(t)
	mustApply(t, user_a.UserID, dailyNoteChange(t, first_note_id, "2026-10-03", "morning"))

	second_result := mustApply(t, user_a.UserID, dailyNoteChange(t, newUUID(t), "2026-10-03", "evening"))
	if second_result.MergedInto == nil || *second_result.MergedInto != first_note_id {
		t.Fatalf("merged_into = %v, want %s", second_result.MergedInto, first_note_id)
	}
	var merged_note string
	if err := testPool.QueryRow(context.Background(), "SELECT note FROM lf.daily_notes WHERE id = $1::uuid", first_note_id).Scan(&merged_note); err != nil {
		t.Fatalf("loading note: %v", err)
	}
	if merged_note != "morning\nevening" {
		t.Fatalf("merged note = %q", merged_note)
	}

	// Another user's note on the same date is a different natural key.
	user_b := newSyncUser(t, "note-b")
	other_result := mustApply(t, user_b.UserID, dailyNoteChange(t, newUUID(t), "2026-10-03", "mine"))
	if other_result.MergedInto != nil {
		t.Fatalf("B's note merged into %s", *other_result.MergedInto)
	}
}

func TestPull_IsolatesLedgers(t *testing.T) {
	user_a := newSyncUser(t, "isolate-a")
	user_b := newSyncUser(t, "isolate-b")
	mustApply(t, user_a.UserID, journalEntryChange(t, newUUID(t), "personal", user_a.CategoryID, 100))
	mustApply(t, user_a.UserID, dailyNoteChange(t, newUUID(t), "2026-10-04", "secret"))

	pulled_ledgers, rows_by_key := pullAll(t, user_b.UserID)
	if pulled_ledgers.PersonalID != user_b.LedgerID || strings.Join(pulled_ledgers.VisibleIDs(), ",") != user_b.LedgerID {
		t.Fatalf("B's ledgers = %+v, want only %s", pulled_ledgers, user_b.LedgerID)
	}
	for row_key, pulled_row := range rows_by_key {
		if pulled_row.OwnerID == user_a.UserID || pulled_row.LedgerID != user_b.LedgerID {
			t.Fatalf("B pulled A's row %s", row_key)
		}
	}
}

func TestHousehold_PushAndPullVisibility(t *testing.T) {
	user_a := newSyncUser(t, "house-a")
	user_b := newSyncUser(t, "house-b")
	household_id := joinHousehold(t, &user_a, &user_b)

	shared_entry_id := newUUID(t)
	personal_entry_id := newUUID(t)
	note_id := newUUID(t)
	mustApply(t, user_a.UserID, journalEntryChange(t, shared_entry_id, "household", user_a.HouseholdCategoryID, 100))
	mustApply(t, user_a.UserID, journalEntryChange(t, personal_entry_id, "personal", user_a.CategoryID, 200))
	mustApply(t, user_a.UserID, dailyNoteChange(t, note_id, "2026-10-05", "private"))

	personal_recurring_id := newUUID(t)
	if _, err := testPool.Exec(context.Background(),
		`INSERT INTO lf.recurring_expenses (id, ledger_id, owner_id, seq, name, billing_day, amount, type, category_id)
		 VALUES ($1::uuid, $2::uuid, $3, nextval('lf.sync_seq'), 'Gym', 1, 5000, 'variable', $4::uuid)`,
		personal_recurring_id, user_a.LedgerID, user_a.UserID, user_a.CategoryID,
	); err != nil {
		t.Fatalf("inserting recurring expense: %v", err)
	}

	t.Run("member cannot write another member's entries", func(t *testing.T) {
		for _, target_entry_id := range []string{personal_entry_id, shared_entry_id} {
			expectRejected(t, pushOne(t, user_b.UserID, syncrules.Change{Collection: "journal_entries", ID: target_entry_id, Fields: map[string]syncrules.FieldValue{
				"amount": fieldValue(t, 1),
			}}), syncrules.ReasonForbidden)
		}
	})

	t.Run("member pull hides the other member's personal ledger", func(t *testing.T) {
		pulled_ledgers, rows_by_key := pullAll(t, user_b.UserID)
		if pulled_ledgers.PersonalID != user_b.LedgerID || pulled_ledgers.HouseholdID != household_id {
			t.Fatalf("B's ledgers = %+v", pulled_ledgers)
		}
		shared_entry, found := rows_by_key["journal_entries/"+shared_entry_id]
		if !found || shared_entry.LedgerID != household_id {
			t.Fatalf("shared entry for B = %+v", shared_entry)
		}
		for _, hidden_key := range []string{"journal_entries/" + personal_entry_id, "daily_notes/" + note_id, "recurring_expenses/" + personal_recurring_id} {
			if _, found := rows_by_key[hidden_key]; found {
				t.Fatalf("B pulled A's private row %s", hidden_key)
			}
		}
		for row_key, pulled_row := range rows_by_key {
			if pulled_row.LedgerID == user_a.LedgerID {
				t.Fatalf("B pulled %s from A's personal ledger", row_key)
			}
		}
	})

	t.Run("owner pull includes own personal rows", func(t *testing.T) {
		_, rows_by_key := pullAll(t, user_a.UserID)
		for _, own_key := range []string{"journal_entries/" + shared_entry_id, "journal_entries/" + personal_entry_id, "daily_notes/" + note_id, "recurring_expenses/" + personal_recurring_id} {
			if _, found := rows_by_key[own_key]; !found {
				t.Fatalf("A's own row %s missing", own_key)
			}
		}
	})
}

func TestHousehold_SharedRecurringPostingEditableByMembers(t *testing.T) {
	user_a := newSyncUser(t, "posting-a")
	user_b := newSyncUser(t, "posting-b")
	household_id := joinHousehold(t, &user_a, &user_b)

	insertPosting := func(ledger_id string, category_id string) string {
		recurring_id := newUUID(t)
		if _, err := testPool.Exec(context.Background(),
			`INSERT INTO lf.recurring_expenses (id, ledger_id, owner_id, seq, name, billing_day, type, category_id)
			 VALUES ($1::uuid, $2::uuid, $3, nextval('lf.sync_seq'), 'Electricity', 10, 'variable', $4::uuid)`,
			recurring_id, ledger_id, user_a.UserID, category_id,
		); err != nil {
			t.Fatalf("inserting recurring expense: %v", err)
		}
		posting_id := newUUID(t)
		if _, err := testPool.Exec(context.Background(),
			`INSERT INTO lf.journal_entries (id, ledger_id, owner_id, seq, transaction_date, amount, category_id, recurring_expense_id, recurring_year_month)
			 VALUES ($1::uuid, $2::uuid, $3, nextval('lf.sync_seq'), '2026-10-10', 1, $4::uuid, $5::uuid, '2026-10')`,
			posting_id, ledger_id, user_a.UserID, category_id, recurring_id,
		); err != nil {
			t.Fatalf("inserting posting: %v", err)
		}
		return posting_id
	}

	household_posting_id := insertPosting(household_id, user_a.HouseholdCategoryID)
	mustApply(t, user_b.UserID, syncrules.Change{Collection: "journal_entries", ID: household_posting_id, Fields: map[string]syncrules.FieldValue{"amount": fieldValue(t, 8000)}})
	if stored_amount, _ := storedAmount(t, household_posting_id); stored_amount != 8000 {
		t.Fatalf("posting amount = %d, want 8000", stored_amount)
	}
	var stored_owner_id int64
	if err := testPool.QueryRow(context.Background(), "SELECT owner_id FROM lf.journal_entries WHERE id = $1::uuid", household_posting_id).Scan(&stored_owner_id); err != nil {
		t.Fatalf("loading owner: %v", err)
	}
	if stored_owner_id != user_a.UserID {
		t.Fatalf("posting owner changed to %d", stored_owner_id)
	}

	// A posting in A's personal ledger stays A's alone.
	personal_posting_id := insertPosting(user_a.LedgerID, user_a.CategoryID)
	expectRejected(t, pushOne(t, user_b.UserID, syncrules.Change{Collection: "journal_entries", ID: personal_posting_id, Fields: map[string]syncrules.FieldValue{"amount": fieldValue(t, 1)}}), syncrules.ReasonForbidden)
}

func TestHousehold_LeftMemberLosesTheHousehold(t *testing.T) {
	user_a := newSyncUser(t, "leave-a")
	user_b := newSyncUser(t, "leave-b")
	household_id := joinHousehold(t, &user_a, &user_b)
	household_entry_id := newUUID(t)
	own_household_entry_id := newUUID(t)
	mustApply(t, user_a.UserID, journalEntryChange(t, household_entry_id, "household", user_a.HouseholdCategoryID, 100))
	mustApply(t, user_b.UserID, journalEntryChange(t, own_household_entry_id, "household", user_b.HouseholdCategoryID, 100))

	if _, err := testPool.Exec(context.Background(),
		"UPDATE lf.ledger_members SET left_at = NOW(), seq = nextval('lf.sync_seq') WHERE user_id = $1 AND ledger_id = $2::uuid",
		user_b.UserID, household_id,
	); err != nil {
		t.Fatalf("leaving household: %v", err)
	}
	pulled_ledgers, rows_by_key := pullAll(t, user_b.UserID)
	if pulled_ledgers.HouseholdID != "" || strings.Join(pulled_ledgers.VisibleIDs(), ",") != user_b.LedgerID {
		t.Fatalf("B's ledgers after leaving = %+v", pulled_ledgers)
	}
	for row_key, pulled_row := range rows_by_key {
		if pulled_row.LedgerID == household_id {
			t.Fatalf("B pulled household row %s after leaving", row_key)
		}
	}
	// The household is no longer writable, not even B's own entries in it.
	expectRejected(t, pushOne(t, user_b.UserID, journalEntryChange(t, newUUID(t), "household", user_b.HouseholdCategoryID, 10)), syncrules.ReasonForbidden)
	expectRejected(t, pushOne(t, user_b.UserID, syncrules.Change{Collection: "journal_entries", ID: own_household_entry_id, Fields: map[string]syncrules.FieldValue{"amount": fieldValue(t, 1)}}), syncrules.ReasonForbidden)
	// The personal ledger carries on.
	mustApply(t, user_b.UserID, journalEntryChange(t, newUUID(t), "personal", user_b.CategoryID, 10))
}

func TestHousehold_ArchiveIsPulledButReadOnly(t *testing.T) {
	user_a := newSyncUser(t, "archive-a")
	archive_id := newUUID(t)
	ctx := context.Background()
	if _, err := testPool.Exec(ctx,
		`INSERT INTO lf.ledgers (id, ledger_id, owner_id, seq, kind) VALUES ($1::uuid, $1::uuid, $2, nextval('lf.sync_seq'), 'archive')`,
		archive_id, user_a.UserID,
	); err != nil {
		t.Fatalf("inserting archive: %v", err)
	}
	if _, err := testPool.Exec(ctx,
		`INSERT INTO lf.ledger_members (id, ledger_id, owner_id, seq, user_id, role, ledger_kind)
		 VALUES (gen_random_uuid(), $1::uuid, $2, nextval('lf.sync_seq'), $2, 'owner', 'archive')`,
		archive_id, user_a.UserID,
	); err != nil {
		t.Fatalf("adding archive member: %v", err)
	}
	archive_category_id := insertCategory(t, archive_id, user_a.UserID)
	archived_entry_id := newUUID(t)
	if _, err := testPool.Exec(ctx,
		`INSERT INTO lf.journal_entries (id, ledger_id, owner_id, seq, transaction_date, amount, category_id)
		 VALUES ($1::uuid, $2::uuid, $3, nextval('lf.sync_seq'), '2026-09-10', 300, $4::uuid)`,
		archived_entry_id, archive_id, user_a.UserID, archive_category_id,
	); err != nil {
		t.Fatalf("inserting archived entry: %v", err)
	}

	pulled_ledgers, rows_by_key := pullAll(t, user_a.UserID)
	if len(pulled_ledgers.ArchiveIDs) != 1 || pulled_ledgers.ArchiveIDs[0] != archive_id {
		t.Fatalf("archives = %v", pulled_ledgers.ArchiveIDs)
	}
	if archived_entry, found := rows_by_key["journal_entries/"+archived_entry_id]; !found || archived_entry.LedgerID != archive_id {
		t.Fatalf("archived entry = %+v", archived_entry)
	}
	expectRejected(t, pushOne(t, user_a.UserID, syncrules.Change{Collection: "journal_entries", ID: archived_entry_id, Fields: map[string]syncrules.FieldValue{"amount": fieldValue(t, 1)}}), syncrules.ReasonForbidden)
	deleted_hlc := nextHLC()
	expectRejected(t, pushOne(t, user_a.UserID, syncrules.Change{Collection: "journal_entries", ID: archived_entry_id, DeletedHLC: &deleted_hlc}), syncrules.ReasonForbidden)
}

func TestPull_Pagination(t *testing.T) {
	user_a := newSyncUser(t, "page-a")
	for entry_index := 0; entry_index < 5; entry_index++ {
		mustApply(t, user_a.UserID, journalEntryChange(t, newUUID(t), "personal", user_a.CategoryID, 100+entry_index))
	}
	_, all_rows := pullAll(t, user_a.UserID)

	pulled_count := 0
	var since int64
	for page_number := 0; ; page_number++ {
		pull_result, err := testRepo.Pull(context.Background(), user_a.UserID, since, 2)
		if err != nil {
			t.Fatalf("pull: %v", err)
		}
		if len(pull_result.Rows) > 2 {
			t.Fatalf("page has %d rows, limit 2", len(pull_result.Rows))
		}
		for _, pulled_row := range pull_result.Rows {
			if pulled_row.Seq <= since {
				t.Fatalf("row seq %d not after cursor %d", pulled_row.Seq, since)
			}
		}
		pulled_count += len(pull_result.Rows)
		since = pull_result.NextSince
		if !pull_result.HasMore {
			break
		}
		// Each page brings at least one row, so it must end within len(all_rows) pages.
		if page_number > len(all_rows) {
			t.Fatal("pagination did not terminate")
		}
	}
	if pulled_count != len(all_rows) {
		t.Fatalf("paged pull returned %d rows, full pull %d", pulled_count, len(all_rows))
	}
}

// TestPull_WatermarkUnderConcurrentWriters checks that incremental pulls running
// while many writers push never skip a row (sync-protocol.md §2).
func TestPull_WatermarkUnderConcurrentWriters(t *testing.T) {
	user_a := newSyncUser(t, "watermark-a")
	user_b := newSyncUser(t, "watermark-b")
	joinHousehold(t, &user_a, &user_b)

	const writer_count = 8
	const entries_per_writer = 25
	var pushed_ids sync.Map
	var writers sync.WaitGroup
	writers_done := make(chan struct{})
	for writer_index := 0; writer_index < writer_count; writer_index++ {
		writer_user := user_a
		if writer_index%2 == 1 {
			writer_user = user_b
		}
		writers.Add(1)
		go func() {
			defer writers.Done()
			for entry_index := 0; entry_index < entries_per_writer; entry_index++ {
				entry_id := newUUID(t)
				push_result := pushOne(t, writer_user.UserID, journalEntryChange(t, entry_id, "household", writer_user.HouseholdCategoryID, 1+entry_index))
				if !push_result.Applied {
					t.Errorf("push rejected: %s", push_result.Reason)
					return
				}
				pushed_ids.Store(entry_id, true)
			}
		}()
	}
	go func() {
		writers.Wait()
		close(writers_done)
	}()

	pulled_ids := map[string]bool{}
	var since int64
	pull_once := func() {
		pull_result, err := testRepo.Pull(context.Background(), user_a.UserID, since, 7)
		if err != nil {
			t.Fatalf("pull: %v", err)
		}
		for _, pulled_row := range pull_result.Rows {
			if pulled_row.Collection == "journal_entries" {
				pulled_ids[pulled_row.ID] = true
			}
		}
		since = pull_result.NextSince
	}
	for keep_pulling := true; keep_pulling; {
		select {
		case <-writers_done:
			keep_pulling = false
		default:
			pull_once()
		}
	}
	// Drain what was committed after the last concurrent pull.
	for {
		before_cursor := since
		pull_once()
		if since == before_cursor {
			break
		}
	}

	missing_count := 0
	pushed_ids.Range(func(entry_id, _ any) bool {
		if !pulled_ids[entry_id.(string)] {
			missing_count++
		}
		return true
	})
	if missing_count > 0 {
		t.Fatalf("%d pushed entries were skipped by incremental pull", missing_count)
	}
}

func reviewNoteChange(t *testing.T, note_id string, year_month string, category_id string, note string) syncrules.Change {
	t.Helper()
	return syncrules.Change{
		Collection: "monthly_review_notes",
		ID:         note_id,
		Fields: map[string]syncrules.FieldValue{
			"year_month":  fieldValue(t, year_month),
			"category_id": fieldValue(t, category_id),
			"note":        fieldValue(t, note),
		},
	}
}

func storedLedgerID(t *testing.T, collection string, record_id string) string {
	t.Helper()
	var stored_ledger_id string
	if err := testPool.QueryRow(context.Background(),
		"SELECT ledger_id::text FROM lf."+collection+" WHERE id = $1::uuid", record_id,
	).Scan(&stored_ledger_id); err != nil {
		t.Fatalf("loading %s ledger: %v", collection, err)
	}
	return stored_ledger_id
}
