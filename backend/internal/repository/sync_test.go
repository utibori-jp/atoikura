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
	UserID     int64
	LedgerID   string
	CategoryID string
}

// newSyncUser creates a user with a personal ledger and one category in it.
func newSyncUser(t *testing.T, email_prefix string) syncUser {
	t.Helper()
	ctx := context.Background()
	user, err := testRepo.CreateUserWithDefaults(ctx, fmt.Sprintf("%s-%d@example.com", email_prefix, time.Now().UnixNano()), nil, "testhash")
	if err != nil {
		t.Fatalf("creating user: %v", err)
	}
	personal_ledger, err := testRepo.EnsurePersonalLedger(ctx, user.ID)
	if err != nil {
		t.Fatalf("ensuring personal ledger: %v", err)
	}
	return syncUser{UserID: user.ID, LedgerID: personal_ledger.ID, CategoryID: insertCategory(t, personal_ledger.ID, user.ID)}
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

// joinHousehold moves the users out of their personal ledgers into a new
// household ledger and returns it with one category. Households get REST
// commands in #207; until then tests set them up directly.
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
		if _, err := testPool.Exec(ctx,
			"UPDATE lf.ledger_members SET left_at = NOW(), seq = nextval('lf.sync_seq') WHERE user_id = $1 AND left_at IS NULL",
			member.UserID,
		); err != nil {
			t.Fatalf("leaving personal ledger: %v", err)
		}
		member_role := "member"
		if member_index == 0 {
			member_role = "owner"
		}
		if _, err := testPool.Exec(ctx,
			`INSERT INTO lf.ledger_members (id, ledger_id, owner_id, seq, user_id, role)
			 VALUES (gen_random_uuid(), $1::uuid, $2, nextval('lf.sync_seq'), $2, $3)`,
			household_id, member.UserID, member_role,
		); err != nil {
			t.Fatalf("joining household: %v", err)
		}
		member.LedgerID = household_id
	}
	category_id := insertCategory(t, household_id, members[0].UserID)
	for _, member := range members {
		member.CategoryID = category_id
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

func journalEntryChange(t *testing.T, entry_id string, wallet string, category_id string, amount int) syncrules.Change {
	t.Helper()
	return syncrules.Change{
		Collection: "journal_entries",
		ID:         entry_id,
		Fields: map[string]syncrules.FieldValue{
			"wallet":           fieldValue(t, wallet),
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
func pullAll(t *testing.T, user_id int64) (string, map[string]repository.PulledRow) {
	t.Helper()
	rows_by_key := map[string]repository.PulledRow{}
	var since int64
	var ledger_id string
	for {
		pull_result, err := testRepo.Pull(context.Background(), user_id, since, 1000)
		if err != nil {
			t.Fatalf("pull: %v", err)
		}
		ledger_id = pull_result.LedgerID
		for _, pulled_row := range pull_result.Rows {
			rows_by_key[pulled_row.Collection+"/"+pulled_row.ID] = pulled_row
		}
		since = pull_result.NextSince
		if !pull_result.HasMore {
			return ledger_id, rows_by_key
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

func TestEnsurePersonalLedger_IsStableAndConcurrentSafe(t *testing.T) {
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
			personal_ledger, err := testRepo.EnsurePersonalLedger(ctx, user.ID)
			if err != nil {
				t.Errorf("ensuring ledger: %v", err)
				return
			}
			if personal_ledger.Kind != "personal" {
				t.Errorf("kind = %q, want personal", personal_ledger.Kind)
			}
			ledger_ids[worker_index] = personal_ledger.ID
		}()
	}
	wait_group.Wait()
	for _, ledger_id := range ledger_ids {
		if ledger_id != ledger_ids[0] {
			t.Fatalf("ledger ids differ: %v", ledger_ids)
		}
	}
}

func TestPush_AppliesAndPullReturnsRow(t *testing.T) {
	user_a := newSyncUser(t, "push-a")
	entry_id := newUUID(t)

	push_result := mustApply(t, user_a.UserID, journalEntryChange(t, entry_id, "ledger", user_a.CategoryID, 1200))
	if push_result.Seq == nil {
		t.Fatal("seq missing on applied change")
	}

	ledger_id, rows_by_key := pullAll(t, user_a.UserID)
	if ledger_id != user_a.LedgerID {
		t.Fatalf("ledger_id = %s, want %s", ledger_id, user_a.LedgerID)
	}
	pulled_entry, found := rows_by_key["journal_entries/"+entry_id]
	if !found {
		t.Fatal("pushed entry missing from pull")
	}
	if pulled_entry.OwnerID != user_a.UserID || pulled_entry.Seq != *push_result.Seq {
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
	mustApply(t, user_a.UserID, journalEntryChange(t, entry_id, "ledger", user_a.CategoryID, 100))

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

func TestPush_ImmutableWallet(t *testing.T) {
	user_a := newSyncUser(t, "immutable-a")
	user_b := newSyncUser(t, "immutable-b")
	joinHousehold(t, &user_a, &user_b)
	entry_id := newUUID(t)
	mustApply(t, user_a.UserID, journalEntryChange(t, entry_id, "ledger", user_a.CategoryID, 100))

	expectRejected(t, pushOne(t, user_a.UserID, syncrules.Change{Collection: "journal_entries", ID: entry_id, Fields: map[string]syncrules.FieldValue{
		"wallet": fieldValue(t, "allowance"),
	}}), syncrules.ReasonImmutable)
}

func TestPush_ForbiddenOnOtherUsersRecord(t *testing.T) {
	user_a := newSyncUser(t, "forbid-a")
	user_b := newSyncUser(t, "forbid-b")
	entry_id := newUUID(t)
	mustApply(t, user_a.UserID, journalEntryChange(t, entry_id, "ledger", user_a.CategoryID, 100))

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
		expectRejected(t, pushOne(t, user_b.UserID, journalEntryChange(t, entry_id, "ledger", user_b.CategoryID, 1)), syncrules.ReasonForbidden)
	})
	t.Run("create with existing id in different case", func(t *testing.T) {
		expectRejected(t, pushOne(t, user_b.UserID, journalEntryChange(t, strings.ToUpper(entry_id), "ledger", user_b.CategoryID, 1)), syncrules.ReasonForbidden)
	})

	stored_amount, is_deleted := storedAmount(t, entry_id)
	if stored_amount != 100 || is_deleted {
		t.Fatalf("A's entry changed: amount=%d deleted=%v", stored_amount, is_deleted)
	}
}

func TestPush_RejectsCategoryFromAnotherLedger(t *testing.T) {
	user_a := newSyncUser(t, "category-a")
	user_b := newSyncUser(t, "category-b")
	expectRejected(t, pushOne(t, user_b.UserID, journalEntryChange(t, newUUID(t), "ledger", user_a.CategoryID, 100)), syncrules.ReasonInvalid)
}

func TestPush_RejectsOwnershipFields(t *testing.T) {
	user_a := newSyncUser(t, "ownership-a")
	user_b := newSyncUser(t, "ownership-b")
	for _, forged_field := range []string{"owner_id", "ledger_id"} {
		forged_change := journalEntryChange(t, newUUID(t), "ledger", user_b.CategoryID, 100)
		forged_change.Fields[forged_field] = fieldValue(t, user_a.LedgerID)
		expectRejected(t, pushOne(t, user_b.UserID, forged_change), syncrules.ReasonUnknownField)
	}
}

func TestPush_RejectsInvalidChanges(t *testing.T) {
	user_a := newSyncUser(t, "invalid-a")
	future_change := journalEntryChange(t, newUUID(t), "ledger", user_a.CategoryID, 100)
	future_change.Fields["amount"] = syncrules.FieldValue{Value: json.RawMessage("100"), HLC: fmt.Sprintf("%013d-0000-itest", time.Now().Add(time.Hour).UnixMilli())}
	oversized_change := dailyNoteChange(t, newUUID(t), "2026-10-02", strings.Repeat("あ", 6000))
	too_long_note := dailyNoteChange(t, newUUID(t), "2026-10-02", strings.Repeat("a", 501))
	zero_amount := journalEntryChange(t, newUUID(t), "ledger", user_a.CategoryID, 0)
	allowance_in_personal := journalEntryChange(t, newUUID(t), "allowance", user_a.CategoryID, 100)

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
		{"allowance in personal ledger", allowance_in_personal, syncrules.ReasonInvalid},
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
	mustApply(t, user_a.UserID, journalEntryChange(t, newUUID(t), "ledger", user_a.CategoryID, 100))
	mustApply(t, user_a.UserID, dailyNoteChange(t, newUUID(t), "2026-10-04", "secret"))

	ledger_id, rows_by_key := pullAll(t, user_b.UserID)
	if ledger_id != user_b.LedgerID {
		t.Fatalf("B's ledger = %s, want %s", ledger_id, user_b.LedgerID)
	}
	for row_key, pulled_row := range rows_by_key {
		if pulled_row.OwnerID == user_a.UserID {
			t.Fatalf("B pulled A's row %s", row_key)
		}
	}
}

func TestHousehold_PushAndPullVisibility(t *testing.T) {
	user_a := newSyncUser(t, "house-a")
	user_b := newSyncUser(t, "house-b")
	household_id := joinHousehold(t, &user_a, &user_b)

	shared_entry_id := newUUID(t)
	allowance_entry_id := newUUID(t)
	note_id := newUUID(t)
	mustApply(t, user_a.UserID, journalEntryChange(t, shared_entry_id, "ledger", user_a.CategoryID, 100))
	mustApply(t, user_a.UserID, journalEntryChange(t, allowance_entry_id, "allowance", user_a.CategoryID, 200))
	mustApply(t, user_a.UserID, dailyNoteChange(t, note_id, "2026-10-05", "private"))

	allowance_recurring_id := newUUID(t)
	if _, err := testPool.Exec(context.Background(),
		`INSERT INTO lf.recurring_expenses (id, ledger_id, owner_id, seq, wallet, name, billing_day, amount, type, category_id)
		 VALUES ($1::uuid, $2::uuid, $3, nextval('lf.sync_seq'), 'allowance', 'Gym', 1, 5000, 'fixed', $4::uuid)`,
		allowance_recurring_id, household_id, user_a.UserID, user_a.CategoryID,
	); err != nil {
		t.Fatalf("inserting recurring expense: %v", err)
	}
	allowance_total_id := fmt.Sprintf("%d:2026-10", user_a.UserID)
	if _, err := testPool.Exec(context.Background(),
		`INSERT INTO lf.allowance_totals (id, ledger_id, owner_id, seq, member_id, year_month, spent)
		 VALUES ($1, $2::uuid, $3, nextval('lf.sync_seq'), $3, '2026-10', 200)`,
		allowance_total_id, household_id, user_a.UserID,
	); err != nil {
		t.Fatalf("inserting allowance total: %v", err)
	}

	t.Run("member cannot write another member's entries", func(t *testing.T) {
		for _, target_entry_id := range []string{allowance_entry_id, shared_entry_id} {
			expectRejected(t, pushOne(t, user_b.UserID, syncrules.Change{Collection: "journal_entries", ID: target_entry_id, Fields: map[string]syncrules.FieldValue{
				"amount": fieldValue(t, 1),
			}}), syncrules.ReasonForbidden)
		}
	})

	t.Run("member pull hides private rows", func(t *testing.T) {
		ledger_id, rows_by_key := pullAll(t, user_b.UserID)
		if ledger_id != household_id {
			t.Fatalf("B's ledger = %s, want household %s", ledger_id, household_id)
		}
		if _, found := rows_by_key["journal_entries/"+shared_entry_id]; !found {
			t.Fatal("shared entry missing for B")
		}
		for _, hidden_key := range []string{"journal_entries/" + allowance_entry_id, "daily_notes/" + note_id, "recurring_expenses/" + allowance_recurring_id} {
			if _, found := rows_by_key[hidden_key]; found {
				t.Fatalf("B pulled A's private row %s", hidden_key)
			}
		}
		if _, found := rows_by_key["allowance_totals/"+allowance_total_id]; !found {
			t.Fatal("allowance_totals missing for B")
		}
	})

	t.Run("owner pull includes own private rows", func(t *testing.T) {
		_, rows_by_key := pullAll(t, user_a.UserID)
		for _, own_key := range []string{"journal_entries/" + allowance_entry_id, "daily_notes/" + note_id, "recurring_expenses/" + allowance_recurring_id} {
			if _, found := rows_by_key[own_key]; !found {
				t.Fatalf("A's own row %s missing", own_key)
			}
		}
	})

	t.Run("member can write own allowance entries", func(t *testing.T) {
		mustApply(t, user_a.UserID, journalEntryChange(t, newUUID(t), "allowance", user_a.CategoryID, 50))
	})
}

func TestHousehold_SharedRecurringPostingEditableByMembers(t *testing.T) {
	user_a := newSyncUser(t, "posting-a")
	user_b := newSyncUser(t, "posting-b")
	household_id := joinHousehold(t, &user_a, &user_b)

	recurring_id := newUUID(t)
	if _, err := testPool.Exec(context.Background(),
		`INSERT INTO lf.recurring_expenses (id, ledger_id, owner_id, seq, wallet, name, billing_day, type, category_id)
		 VALUES ($1::uuid, $2::uuid, $3, nextval('lf.sync_seq'), 'ledger', 'Electricity', 10, 'variable', $4::uuid)`,
		recurring_id, household_id, user_a.UserID, user_a.CategoryID,
	); err != nil {
		t.Fatalf("inserting recurring expense: %v", err)
	}
	posting_id := newUUID(t)
	if _, err := testPool.Exec(context.Background(),
		`INSERT INTO lf.journal_entries (id, ledger_id, owner_id, seq, wallet, transaction_date, amount, category_id, recurring_expense_id, recurring_year_month)
		 VALUES ($1::uuid, $2::uuid, $3, nextval('lf.sync_seq'), 'ledger', '2026-10-10', 1, $4::uuid, $5::uuid, '2026-10')`,
		posting_id, household_id, user_a.UserID, user_a.CategoryID, recurring_id,
	); err != nil {
		t.Fatalf("inserting posting: %v", err)
	}

	mustApply(t, user_b.UserID, syncrules.Change{Collection: "journal_entries", ID: posting_id, Fields: map[string]syncrules.FieldValue{"amount": fieldValue(t, 8000)}})
	if stored_amount, _ := storedAmount(t, posting_id); stored_amount != 8000 {
		t.Fatalf("posting amount = %d, want 8000", stored_amount)
	}
	var stored_owner_id int64
	if err := testPool.QueryRow(context.Background(), "SELECT owner_id FROM lf.journal_entries WHERE id = $1::uuid", posting_id).Scan(&stored_owner_id); err != nil {
		t.Fatalf("loading owner: %v", err)
	}
	if stored_owner_id != user_a.UserID {
		t.Fatalf("posting owner changed to %d", stored_owner_id)
	}
}

func TestHousehold_LeftMemberPullsNewLedgerOnly(t *testing.T) {
	user_a := newSyncUser(t, "leave-a")
	user_b := newSyncUser(t, "leave-b")
	household_id := joinHousehold(t, &user_a, &user_b)
	mustApply(t, user_a.UserID, journalEntryChange(t, newUUID(t), "ledger", user_a.CategoryID, 100))

	if _, err := testPool.Exec(context.Background(),
		"UPDATE lf.ledger_members SET left_at = NOW(), seq = nextval('lf.sync_seq') WHERE user_id = $1 AND ledger_id = $2::uuid",
		user_b.UserID, household_id,
	); err != nil {
		t.Fatalf("leaving household: %v", err)
	}
	ledger_id, rows_by_key := pullAll(t, user_b.UserID)
	if ledger_id == household_id {
		t.Fatal("B still pulls the household after leaving")
	}
	for row_key := range rows_by_key {
		if pulled_row := rows_by_key[row_key]; pulled_row.OwnerID == user_a.UserID {
			t.Fatalf("B pulled household row %s after leaving", row_key)
		}
	}
	// Writing an allowance entry is no longer possible outside a household.
	new_category_id := insertCategory(t, ledger_id, user_b.UserID)
	expectRejected(t, pushOne(t, user_b.UserID, journalEntryChange(t, newUUID(t), "allowance", new_category_id, 10)), syncrules.ReasonInvalid)
}

func TestPull_Pagination(t *testing.T) {
	user_a := newSyncUser(t, "page-a")
	for entry_index := 0; entry_index < 5; entry_index++ {
		mustApply(t, user_a.UserID, journalEntryChange(t, newUUID(t), "ledger", user_a.CategoryID, 100+entry_index))
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
		if page_number > 20 {
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
				push_result := pushOne(t, writer_user.UserID, journalEntryChange(t, entry_id, "ledger", writer_user.CategoryID, 1+entry_index))
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
