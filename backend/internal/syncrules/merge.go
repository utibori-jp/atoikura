package syncrules

import (
	"slices"
	"strings"
)

// StoredRecord is the server's current state of a record, as far as merging needs it.
type StoredRecord struct {
	LedgerID           string
	OwnerID            int64
	Deleted            bool
	Values             Row
	FieldHLC           map[string]string
	RecurringExpenseID *string
}

// CanWrite reports whether the caller may change the stored record. Only rows of
// the caller's personal ledger and attached household (household_ledger_id, ""
// when none) are writable; archives and other ledgers never are. Records are
// author-only, except auto-posted recurring entries of the household ledger,
// which any member may edit (design.md D11).
func CanWrite(stored_record *StoredRecord, caller_id int64, personal_ledger_id string, household_ledger_id string) bool {
	switch {
	case stored_record.LedgerID == personal_ledger_id:
		return stored_record.OwnerID == caller_id
	case household_ledger_id != "" && stored_record.LedgerID == household_ledger_id:
		return stored_record.OwnerID == caller_id || stored_record.RecurringExpenseID != nil
	}
	return false
}

// SplitTarget takes the target field (design.md D15) out of a change. It returns
// the change without it and the target text, or "" when none was pushed. A
// target that is not a string is invalid.
func SplitTarget(collection_spec *CollectionSpec, change Change) (Change, string, *Rejection) {
	target_value, has_target := change.Fields[collection_spec.TargetField]
	if collection_spec.TargetField == "" || !has_target {
		return change, "", nil
	}
	remaining_fields := make(map[string]FieldValue, len(change.Fields)-1)
	for field_name, field_value := range change.Fields {
		if field_name != collection_spec.TargetField {
			remaining_fields[field_name] = field_value
		}
	}
	change.Fields = remaining_fields
	target_text, is_text := DecodeValue(target_value.Value).(string)
	if !is_text || target_text == "" {
		return change, "", reject(ReasonInvalid, collection_spec.TargetField+"はpersonalかhouseholdで指定してください")
	}
	return change, target_text, nil
}

// MergeResult is the outcome of applying a change to a record.
type MergeResult struct {
	// Candidate holds every pushable field value the record will have.
	Candidate Row
	FieldHLC  map[string]string
	// Changed is false when nothing needs to be written.
	Changed    bool
	Tombstone  bool
	Superseded []string
}

// DecodeFields decodes the pushed values of a change. Values of UUID fields are
// lower-cased so that they compare equal to what PostgreSQL returns.
func DecodeFields(collection_spec *CollectionSpec, change Change) Row {
	decoded_row := Row{}
	for field_name, field_value := range change.Fields {
		decoded_value := DecodeValue(field_value.Value)
		if field_spec, _ := collection_spec.Field(field_name); field_spec.Kind == KindUUID {
			if uuid_text, is_text := decoded_value.(string); is_text {
				decoded_value = strings.ToLower(uuid_text)
			}
		}
		decoded_row[field_name] = decoded_value
	}
	return decoded_row
}

// Merge applies a change to the stored record (nil for a new record) with
// field-level LWW. Tombstones win: a deleted record ignores field writes, and a
// change that deletes ignores its own field writes.
func Merge(collection_spec *CollectionSpec, stored_record *StoredRecord, change Change, decoded_row Row) (MergeResult, *Rejection) {
	changed_field_names := sortedFieldNames(change)

	if stored_record == nil {
		if change.DeletedHLC != nil {
			// Created and deleted before it was ever pushed: nothing to store.
			return MergeResult{Superseded: changed_field_names}, nil
		}
		field_hlc := map[string]string{}
		for _, field_name := range changed_field_names {
			field_hlc[field_name] = change.Fields[field_name].HLC
		}
		return MergeResult{Candidate: decoded_row, FieldHLC: field_hlc, Changed: true}, nil
	}

	for _, field_name := range changed_field_names {
		if collection_spec.isImmutable(field_name) && decoded_row[field_name] != stored_record.Values[field_name] {
			return MergeResult{}, reject(ReasonImmutable, field_name+"は変更できません")
		}
	}

	if stored_record.Deleted {
		return MergeResult{Superseded: changed_field_names}, nil
	}
	if change.DeletedHLC != nil {
		return MergeResult{Tombstone: true, Changed: true, Superseded: changed_field_names}, nil
	}

	candidate_row := Row{}
	for field_name, stored_value := range stored_record.Values {
		candidate_row[field_name] = stored_value
	}
	field_hlc := map[string]string{}
	for field_name, stored_hlc := range stored_record.FieldHLC {
		field_hlc[field_name] = stored_hlc
	}

	merge_result := MergeResult{Candidate: candidate_row, FieldHLC: field_hlc}
	for _, field_name := range changed_field_names {
		incoming_hlc := change.Fields[field_name].HLC
		if incoming_hlc <= stored_record.FieldHLC[field_name] {
			merge_result.Superseded = append(merge_result.Superseded, field_name)
			continue
		}
		candidate_row[field_name] = decoded_row[field_name]
		field_hlc[field_name] = incoming_hlc
		merge_result.Changed = true
	}
	return merge_result, nil
}

// MergeNaturalKeyDuplicate folds a new note into the live note that already has
// the same natural key: the texts are concatenated (once, if they are equal), and
// the merged field keeps the newer HLC.
func MergeNaturalKeyDuplicate(collection_spec *CollectionSpec, existing_record *StoredRecord, change Change, decoded_row Row) MergeResult {
	merge_field := collection_spec.MergeField
	existing_text, _ := existing_record.Values[merge_field].(string)
	incoming_text, _ := decoded_row[merge_field].(string)

	merged_text := existing_text
	switch {
	case existing_text == "":
		merged_text = incoming_text
	case incoming_text != "" && incoming_text != existing_text:
		merged_text = existing_text + "\n" + incoming_text
	}

	candidate_row := Row{}
	for field_name, stored_value := range existing_record.Values {
		candidate_row[field_name] = stored_value
	}
	candidate_row[merge_field] = merged_text

	field_hlc := map[string]string{}
	for field_name, stored_hlc := range existing_record.FieldHLC {
		field_hlc[field_name] = stored_hlc
	}
	if incoming_hlc := change.Fields[merge_field].HLC; incoming_hlc > field_hlc[merge_field] {
		field_hlc[merge_field] = incoming_hlc
	}
	return MergeResult{Candidate: candidate_row, FieldHLC: field_hlc, Changed: merged_text != existing_text}
}

func sortedFieldNames(change Change) []string {
	field_names := make([]string, 0, len(change.Fields))
	for field_name := range change.Fields {
		field_names = append(field_names, field_name)
	}
	slices.Sort(field_names)
	return field_names
}
