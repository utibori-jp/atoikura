package syncrules

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

const testCategoryID = "0192f000-0000-7000-8000-000000000001"

func expandVectorValue(raw_value any) any {
	repeat_spec, is_object := raw_value.(map[string]any)
	if !is_object {
		return raw_value
	}
	repeated_text, _ := repeat_spec["repeat"].(string)
	repeat_count, _ := repeat_spec["count"].(float64)
	return strings.Repeat(repeated_text, int(repeat_count))
}

// The push validation must reject exactly what the client and the legacy handler
// reject: testdata/logic/journal_entry_validation.json is shared by all three.
func TestValidateJournalEntryFieldsSharedVectors(t *testing.T) {
	vector_bytes, err := os.ReadFile(filepath.Join("..", "..", "..", "testdata", "logic", "journal_entry_validation.json"))
	if err != nil {
		t.Fatalf("reading shared vectors: %v", err)
	}
	var vector_file struct {
		Cases []struct {
			Name     string         `json:"name"`
			Input    map[string]any `json:"input"`
			Expected struct {
				Valid   bool   `json:"valid"`
				Message string `json:"message"`
			} `json:"expected"`
		} `json:"cases"`
	}
	if err := json.Unmarshal(vector_bytes, &vector_file); err != nil {
		t.Fatalf("decoding shared vectors: %v", err)
	}

	for _, validation_case := range vector_file.Cases {
		t.Run(validation_case.Name, func(t *testing.T) {
			change := Change{Collection: "journal_entries", Fields: map[string]FieldValue{
				"wallet": {Value: json.RawMessage(`"ledger"`)},
			}}
			for field_name, raw_value := range validation_case.Input {
				if field_name == "category" {
					if raw_value == "present" {
						change.Fields["category_id"] = FieldValue{Value: json.RawMessage(`"` + testCategoryID + `"`)}
					}
					continue
				}
				encoded_value, _ := json.Marshal(expandVectorValue(raw_value))
				change.Fields[field_name] = FieldValue{Value: encoded_value}
			}

			message := ValidateJournalEntryFields(DecodeFields(&journalEntriesSpec, change), false)
			if validation_case.Expected.Valid && message != "" {
				t.Errorf("expected valid, got %q", message)
			}
			if !validation_case.Expected.Valid && message != validation_case.Expected.Message {
				t.Errorf("message = %q, want %q", message, validation_case.Expected.Message)
			}
		})
	}
}

func TestValidateJournalEntryWalletAndTypes(t *testing.T) {
	valid_row := Row{"wallet": "ledger", "transaction_date": "2026-10-27", "amount": int64(500), "category_id": testCategoryID, "is_excluded": false}
	copyWith := func(field_name string, field_value any) Row {
		candidate_row := Row{}
		for name, value := range valid_row {
			candidate_row[name] = value
		}
		candidate_row[field_name] = field_value
		return candidate_row
	}

	if message := ValidateJournalEntryFields(copyWith("wallet", "allowance"), false); message != "お小遣いの仕訳は家庭に参加しているときだけ登録できます" {
		t.Errorf("allowance in personal mode: %q", message)
	}
	if message := ValidateJournalEntryFields(copyWith("wallet", "allowance"), true); message != "" {
		t.Errorf("allowance in household mode: %q", message)
	}
	if message := ValidateJournalEntryFields(copyWith("wallet", nil), false); message != "walletはledgerかallowanceで指定してください" {
		t.Errorf("missing wallet: %q", message)
	}
	if message := ValidateJournalEntryFields(copyWith("amount", DecodeValue(json.RawMessage(`1.5`))), false); message != "amountは正の整数である必要があります" {
		t.Errorf("fractional amount: %q", message)
	}
	if message := ValidateJournalEntryFields(copyWith("amount", DecodeValue(json.RawMessage(`"500"`))), false); message != "amountは正の整数である必要があります" {
		t.Errorf("string amount: %q", message)
	}
	if message := ValidateJournalEntryFields(copyWith("category_id", "not-a-uuid"), false); message != "category_idが不正です" {
		t.Errorf("bad category id: %q", message)
	}
}

func TestCheckEnvelope(t *testing.T) {
	now := time.UnixMilli(1793000000000)
	valid_hlc := "1793000000000-0000-device1"
	valid_id := "0192f000-0000-7000-8000-0000000000aa"
	tests := []struct {
		name       string
		change     Change
		size       int
		wantReason string
	}{
		{"valid", Change{Collection: "journal_entries", ID: valid_id, Fields: map[string]FieldValue{"amount": {HLC: valid_hlc}}}, 100, ""},
		{"unknown collection", Change{Collection: "budgets", ID: valid_id}, 100, ReasonUnknownCollection},
		{"owner_id is not pushable", Change{Collection: "journal_entries", ID: valid_id, Fields: map[string]FieldValue{"owner_id": {HLC: valid_hlc}}}, 100, ReasonUnknownField},
		{"ledger_id is not pushable", Change{Collection: "daily_notes", ID: valid_id, Fields: map[string]FieldValue{"ledger_id": {HLC: valid_hlc}}}, 100, ReasonUnknownField},
		{"too large", Change{Collection: "daily_notes", ID: valid_id}, MaxChangeBytes + 1, ReasonTooLarge},
		{"HLC six minutes ahead", Change{Collection: "daily_notes", ID: valid_id, Fields: map[string]FieldValue{"note": {HLC: "1793000360000-0000-device1"}}}, 100, ReasonClockSkew},
		{"malformed HLC", Change{Collection: "daily_notes", ID: valid_id, Fields: map[string]FieldValue{"note": {HLC: "yesterday"}}}, 100, ReasonClockSkew},
		{"malformed deleted HLC", Change{Collection: "daily_notes", ID: valid_id, DeletedHLC: textPointer("x")}, 100, ReasonClockSkew},
		{"bad id", Change{Collection: "daily_notes", ID: "42"}, 100, ReasonInvalid},
	}
	for _, envelope_case := range tests {
		t.Run(envelope_case.name, func(t *testing.T) {
			_, rejection := CheckEnvelope(envelope_case.change, envelope_case.size, now)
			got_reason := ""
			if rejection != nil {
				got_reason = rejection.Reason
			}
			if got_reason != envelope_case.wantReason {
				t.Errorf("reason = %q, want %q", got_reason, envelope_case.wantReason)
			}
		})
	}
}

func fieldChange(field_values map[string][2]string) Change {
	change := Change{Collection: "journal_entries", Fields: map[string]FieldValue{}}
	for field_name, value_and_hlc := range field_values {
		change.Fields[field_name] = FieldValue{Value: json.RawMessage(value_and_hlc[0]), HLC: value_and_hlc[1]}
	}
	return change
}

func TestMergeFieldLevelLWW(t *testing.T) {
	stored_record := &StoredRecord{
		Values:   Row{"wallet": "ledger", "amount": int64(500), "item": "ランチ"},
		FieldHLC: map[string]string{"amount": "1793000000000-0001-a", "item": "1793000000000-0005-a"},
	}
	change := fieldChange(map[string][2]string{
		"amount": {`700`, "1793000000000-0002-b"},
		"item":   {`"ディナー"`, "1793000000000-0004-b"},
	})
	merge_result, rejection := Merge(&journalEntriesSpec, stored_record, change, DecodeFields(&journalEntriesSpec, change))
	if rejection != nil {
		t.Fatalf("unexpected rejection %v", rejection)
	}
	if merge_result.Candidate["amount"] != int64(700) || merge_result.Candidate["item"] != "ランチ" {
		t.Errorf("candidate = %v", merge_result.Candidate)
	}
	if !merge_result.Changed || len(merge_result.Superseded) != 1 || merge_result.Superseded[0] != "item" {
		t.Errorf("changed=%v superseded=%v", merge_result.Changed, merge_result.Superseded)
	}
	if merge_result.FieldHLC["amount"] != "1793000000000-0002-b" {
		t.Errorf("field_hlc = %v", merge_result.FieldHLC)
	}

	// Re-sending the same change is a no-op (equal HLCs do not win).
	replay_record := &StoredRecord{Values: merge_result.Candidate, FieldHLC: merge_result.FieldHLC}
	replay_result, _ := Merge(&journalEntriesSpec, replay_record, change, DecodeFields(&journalEntriesSpec, change))
	if replay_result.Changed {
		t.Errorf("replay should not change anything: %+v", replay_result)
	}
}

func TestMergeTombstonesAndImmutables(t *testing.T) {
	stored_record := &StoredRecord{Values: Row{"wallet": "ledger", "amount": int64(500)}, FieldHLC: map[string]string{}}

	wallet_change := fieldChange(map[string][2]string{"wallet": {`"allowance"`, "1793000000000-0001-a"}})
	if _, rejection := Merge(&journalEntriesSpec, stored_record, wallet_change, DecodeFields(&journalEntriesSpec, wallet_change)); rejection == nil || rejection.Reason != ReasonImmutable {
		t.Errorf("wallet change: %v", rejection)
	}

	delete_change := fieldChange(map[string][2]string{"amount": {`900`, "1793000000000-0009-a"}})
	delete_change.DeletedHLC = textPointer("1793000000000-0009-a")
	delete_result, _ := Merge(&journalEntriesSpec, stored_record, delete_change, DecodeFields(&journalEntriesSpec, delete_change))
	if !delete_result.Tombstone || !delete_result.Changed || len(delete_result.Superseded) != 1 {
		t.Errorf("delete: %+v", delete_result)
	}

	stored_record.Deleted = true
	late_change := fieldChange(map[string][2]string{"amount": {`900`, "1793000000009-0000-a"}})
	late_result, _ := Merge(&journalEntriesSpec, stored_record, late_change, DecodeFields(&journalEntriesSpec, late_change))
	if late_result.Changed || len(late_result.Superseded) != 1 {
		t.Errorf("write after delete must be superseded: %+v", late_result)
	}

	created_then_deleted := fieldChange(map[string][2]string{"amount": {`1`, "1793000000000-0000-a"}})
	created_then_deleted.DeletedHLC = textPointer("1793000000000-0001-a")
	never_stored, _ := Merge(&journalEntriesSpec, nil, created_then_deleted, DecodeFields(&journalEntriesSpec, created_then_deleted))
	if never_stored.Changed {
		t.Errorf("created-then-deleted should store nothing: %+v", never_stored)
	}
}

func TestMergeNaturalKeyDuplicate(t *testing.T) {
	existing_record := &StoredRecord{
		Values:   Row{"date": "2026-10-27", "note": "朝: 寝坊"},
		FieldHLC: map[string]string{"note": "1793000000000-0001-a"},
	}
	change := Change{Collection: "daily_notes", Fields: map[string]FieldValue{
		"date": {Value: json.RawMessage(`"2026-10-27"`), HLC: "1793000000000-0002-b"},
		"note": {Value: json.RawMessage(`"夜: 外食"`), HLC: "1793000000000-0002-b"},
	}}
	merge_result := MergeNaturalKeyDuplicate(&dailyNotesSpec, existing_record, change, DecodeFields(&dailyNotesSpec, change))
	if merge_result.Candidate["note"] != "朝: 寝坊\n夜: 外食" || !merge_result.Changed {
		t.Errorf("merged = %+v", merge_result)
	}
	if merge_result.FieldHLC["note"] != "1793000000000-0002-b" {
		t.Errorf("field_hlc = %v", merge_result.FieldHLC)
	}

	same_text := Change{Collection: "daily_notes", Fields: map[string]FieldValue{"note": {Value: json.RawMessage(`"朝: 寝坊"`), HLC: "1793000000000-0003-b"}}}
	if same_result := MergeNaturalKeyDuplicate(&dailyNotesSpec, existing_record, same_text, DecodeFields(&dailyNotesSpec, same_text)); same_result.Changed {
		t.Errorf("identical text must not change the note: %+v", same_result)
	}
}

func TestCanWrite(t *testing.T) {
	recurring_id := "0192f000-0000-7000-8000-0000000000bb"
	own_entry := &StoredRecord{LedgerID: "L1", OwnerID: 1, Values: Row{"wallet": "ledger"}}
	posting := &StoredRecord{LedgerID: "L1", OwnerID: 1, Values: Row{"wallet": "ledger"}, RecurringExpenseID: &recurring_id}
	allowance_posting := &StoredRecord{LedgerID: "L1", OwnerID: 1, Values: Row{"wallet": "allowance"}, RecurringExpenseID: &recurring_id}

	if !CanWrite(own_entry, 1, "L1") || CanWrite(own_entry, 2, "L1") || CanWrite(own_entry, 1, "L2") {
		t.Error("author-only rule broken")
	}
	if !CanWrite(posting, 2, "L1") || CanWrite(posting, 2, "L2") {
		t.Error("shared-ledger postings are editable by members of that ledger only")
	}
	if CanWrite(allowance_posting, 2, "L1") {
		t.Error("allowance postings stay owner-only")
	}
}

func textPointer(text string) *string { return &text }
