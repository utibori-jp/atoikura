// Package syncrules holds the database-independent rules of the local-first sync
// protocol (docs/local-first/sync-protocol.md): which collections and fields can be
// pushed, HLC checks, content validation, and field-level LWW merging.
//
// Content validation mirrors the client (frontend/src/logic/validation.ts); both are
// checked against the shared vectors in testdata/logic.
package syncrules

import (
	"bytes"
	"encoding/json"
	"fmt"
	"regexp"
	"time"
	"unicode/utf8"
)

const (
	// ProtocolVersion is the sync protocol version this server speaks. Version 2
	// replaced the journal entry wallet with a ledger target (Step 8).
	ProtocolVersion = 2
	// MinSupportedProtocolVersion is the oldest client protocol still accepted.
	MinSupportedProtocolVersion = 2

	// MaxChangesPerPush and MaxChangeBytes bound a single push request.
	MaxChangesPerPush = 500
	MaxChangeBytes    = 16 * 1024
	// MaxClockSkew is how far ahead of the server clock an HLC may be.
	MaxClockSkew = 5 * time.Minute

	maxItemLength = 100
	maxNoteLength = 500
	maxAmount     = 2_147_483_647
)

// Reason codes returned for rejected changes.
const (
	ReasonUnknownCollection = "UNKNOWN_COLLECTION"
	ReasonUnknownField      = "UNKNOWN_FIELD"
	ReasonTooLarge          = "TOO_LARGE"
	ReasonClockSkew         = "CLOCK_SKEW"
	ReasonForbidden         = "FORBIDDEN"
	ReasonInvalid           = "INVALID"
	ReasonImmutable         = "IMMUTABLE"
)

// ColumnKind tells the repository how to bind a field value in SQL.
type ColumnKind string

const (
	KindText    ColumnKind = "text"
	KindDate    ColumnKind = "date"
	KindInteger ColumnKind = "integer"
	KindBoolean ColumnKind = "boolean"
	KindUUID    ColumnKind = "uuid"
)

// FieldSpec describes one pushable field.
type FieldSpec struct {
	Name string
	Kind ColumnKind
}

// CollectionSpec describes one pushable (offline-writable) collection.
type CollectionSpec struct {
	Name string
	// Fields lists every pushable field, in column order.
	Fields []FieldSpec
	// Immutable fields cannot change once the record exists.
	Immutable []string
	// NaturalKey fields identify a record across devices; a second live record with
	// the same key is merged into the first (notes only).
	NaturalKey []string
	// MergeField is the text field concatenated when two records share a natural key.
	MergeField string
	// TargetField names the ledger of a new record ("personal" or "household",
	// design.md D15). It is pushed like a field but is not a column: the server
	// resolves it to a ledger, and the record never moves to another ledger.
	TargetField string
}

var journalEntriesSpec = CollectionSpec{
	Name: "journal_entries",
	Fields: []FieldSpec{
		{Name: "transaction_date", Kind: KindDate},
		{Name: "item", Kind: KindText},
		{Name: "amount", Kind: KindInteger},
		{Name: "is_excluded", Kind: KindBoolean},
		{Name: "category_id", Kind: KindUUID},
		{Name: "note", Kind: KindText},
	},
	TargetField: "ledger",
}

var dailyNotesSpec = CollectionSpec{
	Name: "daily_notes",
	Fields: []FieldSpec{
		{Name: "date", Kind: KindDate},
		{Name: "note", Kind: KindText},
	},
	Immutable:  []string{"date"},
	NaturalKey: []string{"date"},
	MergeField: "note",
}

var monthlyReviewNotesSpec = CollectionSpec{
	Name: "monthly_review_notes",
	Fields: []FieldSpec{
		{Name: "year_month", Kind: KindText},
		{Name: "category_id", Kind: KindUUID},
		{Name: "note", Kind: KindText},
	},
	Immutable:  []string{"year_month", "category_id"},
	NaturalKey: []string{"year_month", "category_id"},
	MergeField: "note",
}

var pushableCollections = map[string]*CollectionSpec{
	journalEntriesSpec.Name:     &journalEntriesSpec,
	dailyNotesSpec.Name:         &dailyNotesSpec,
	monthlyReviewNotesSpec.Name: &monthlyReviewNotesSpec,
}

// LookupCollection returns the spec of a pushable collection.
func LookupCollection(collection_name string) (*CollectionSpec, bool) {
	collection_spec, found := pushableCollections[collection_name]
	return collection_spec, found
}

// Field returns the spec of a field of the collection.
func (collection_spec *CollectionSpec) Field(field_name string) (FieldSpec, bool) {
	for _, field_spec := range collection_spec.Fields {
		if field_spec.Name == field_name {
			return field_spec, true
		}
	}
	return FieldSpec{}, false
}

func (collection_spec *CollectionSpec) isImmutable(field_name string) bool {
	for _, immutable_field := range collection_spec.Immutable {
		if immutable_field == field_name {
			return true
		}
	}
	return false
}

// FieldValue is one pushed field: a plain JSON value and its HLC.
type FieldValue struct {
	Value json.RawMessage `json:"value"`
	HLC   string          `json:"hlc"`
}

// Change is one record change in a push request.
type Change struct {
	Collection string                `json:"collection"`
	ID         string                `json:"id"`
	Fields     map[string]FieldValue `json:"fields"`
	DeletedHLC *string               `json:"deleted_hlc,omitempty"`
}

var (
	hlcPattern       = regexp.MustCompile(`^([0-9]{13})-[0-9a-f]{4}-[0-9A-Za-z_-]{1,32}$`)
	uuidPattern      = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)
	yearMonthPattern = regexp.MustCompile(`^\d{4}-(0[1-9]|1[0-2])$`)
)

// IsYearMonth reports whether the text is a YYYY-MM month.
func IsYearMonth(text string) bool {
	return yearMonthPattern.MatchString(text)
}

// IsDate reports whether the text is a real YYYY-MM-DD date.
func IsDate(text string) bool {
	return isValidDateValue(text)
}

// IsUUID reports whether the text is a canonical UUID.
func IsUUID(text string) bool {
	return uuidPattern.MatchString(text)
}

// hlcWallTime extracts the wall-clock part of a well-formed HLC.
func hlcWallTime(hlc string) (time.Time, bool) {
	hlc_match := hlcPattern.FindStringSubmatch(hlc)
	if hlc_match == nil {
		return time.Time{}, false
	}
	var unix_ms int64
	if _, err := fmt.Sscan(hlc_match[1], &unix_ms); err != nil {
		return time.Time{}, false
	}
	return time.UnixMilli(unix_ms), true
}

// serverDeviceID is the device part of HLCs stamped by the server, e.g. on
// recurring postings, so that any later edit from a device wins.
const serverDeviceID = "server"

// ServerHLC returns the HLC for a field the server writes at now.
func ServerHLC(now time.Time) string {
	return fmt.Sprintf("%013d-0000-%s", now.UnixMilli(), serverDeviceID)
}

// CheckHLC reports whether the HLC is well-formed and not too far ahead of now.
func CheckHLC(hlc string, now time.Time) bool {
	wall_time, ok := hlcWallTime(hlc)
	return ok && !wall_time.After(now.Add(MaxClockSkew))
}

// Rejection explains why a change was rejected.
type Rejection struct {
	Reason  string
	Message string
}

func (rejection *Rejection) Error() string {
	return rejection.Reason + ": " + rejection.Message
}

func reject(reason string, message string) *Rejection {
	return &Rejection{Reason: reason, Message: message}
}

// CheckEnvelope runs the checks that need no stored state: collection and field
// allowlists, size, HLC format and skew, and the ID format.
func CheckEnvelope(change Change, change_size int, now time.Time) (*CollectionSpec, *Rejection) {
	collection_spec, found := LookupCollection(change.Collection)
	if !found {
		return nil, reject(ReasonUnknownCollection, "このデータは同期できません")
	}
	for field_name := range change.Fields {
		if _, known := collection_spec.Field(field_name); !known && field_name != collection_spec.TargetField {
			return nil, reject(ReasonUnknownField, "同期できない項目が含まれています: "+field_name)
		}
	}
	if change_size > MaxChangeBytes {
		return nil, reject(ReasonTooLarge, "変更のサイズが大きすぎます")
	}
	for _, field_value := range change.Fields {
		if !CheckHLC(field_value.HLC, now) {
			return nil, reject(ReasonClockSkew, "端末の時刻が正しくありません")
		}
	}
	if change.DeletedHLC != nil && !CheckHLC(*change.DeletedHLC, now) {
		return nil, reject(ReasonClockSkew, "端末の時刻が正しくありません")
	}
	if !IsUUID(change.ID) {
		return nil, reject(ReasonInvalid, "idが不正です")
	}
	return collection_spec, nil
}

// Row holds decoded field values: string, int64, bool or nil.
type Row map[string]any

// DecodeValue converts a pushed JSON value into a Row value. Numbers that are not
// integers, and values of unexpected types, are kept as invalidValue so that
// content validation reports them with the field's own message.
func DecodeValue(raw_value json.RawMessage) any {
	var decoded_value any
	decoder := json.NewDecoder(bytes.NewReader(raw_value))
	decoder.UseNumber()
	if err := decoder.Decode(&decoded_value); err != nil {
		return invalidValue{}
	}
	switch typed_value := decoded_value.(type) {
	case nil, bool:
		return typed_value
	case string:
		return typed_value
	case json.Number:
		integer_value, err := typed_value.Int64()
		if err != nil {
			return invalidValue{}
		}
		return integer_value
	default:
		return invalidValue{}
	}
}

// invalidValue marks a pushed value of the wrong JSON type.
type invalidValue struct{}

// ValidationContext is what content validation needs from stored state.
type ValidationContext struct {
	// CategoryInLedger reports whether the category belongs to the record's
	// ledger (for review notes: the caller's personal ledger or attached
	// household), tombstoned categories included (design.md §5.1).
	CategoryInLedger func(category_id string) (bool, error)
}

// ValidateRow validates the full candidate row of a collection (stored values
// overlaid with the pushed ones). Rules run in order and the first failure wins.
func ValidateRow(collection_spec *CollectionSpec, candidate_row Row, validation_context ValidationContext) (*Rejection, error) {
	var message string
	switch collection_spec.Name {
	case journalEntriesSpec.Name:
		message = validateJournalEntry(candidate_row)
	case dailyNotesSpec.Name:
		message = validateDailyNote(candidate_row)
	case monthlyReviewNotesSpec.Name:
		message = validateMonthlyReviewNote(candidate_row)
	}
	if message != "" {
		return reject(ReasonInvalid, message), nil
	}

	category_id, has_category := candidate_row["category_id"].(string)
	if !has_category {
		return nil, nil
	}
	category_in_ledger, err := validation_context.CategoryInLedger(category_id)
	if err != nil {
		return nil, err
	}
	if !category_in_ledger {
		return reject(ReasonInvalid, "指定されたcategory_idは存在しません"), nil
	}
	return nil, nil
}

// ValidateJournalEntryFields runs the journal entry rules without the category
// lookup. It is the server side of testdata/logic/journal_entry_validation.json.
func ValidateJournalEntryFields(candidate_row Row) string {
	return validateJournalEntry(candidate_row)
}

func validateJournalEntry(candidate_row Row) string {
	if !isValidDateValue(candidate_row["transaction_date"]) {
		return "transaction_dateはYYYY-MM-DD形式で指定してください"
	}
	amount, is_integer := candidate_row["amount"].(int64)
	if !is_integer || amount < 1 || amount > maxAmount {
		return "amountは正の整数である必要があります"
	}
	category_id, is_text := candidate_row["category_id"].(string)
	if !is_text || category_id == "" {
		return "category_idは必須です"
	}
	if !IsUUID(category_id) {
		return "category_idが不正です"
	}
	if _, is_bool := candidate_row["is_excluded"].(bool); !is_bool {
		return "is_excludedは必須です"
	}
	if message := checkOptionalText(candidate_row["item"], maxItemLength, "itemは100文字以内で入力してください"); message != "" {
		return message
	}
	if message := checkOptionalText(candidate_row["note"], maxNoteLength, "noteは500文字以内で入力してください"); message != "" {
		return message
	}
	return ""
}

func validateDailyNote(candidate_row Row) string {
	if !isValidDateValue(candidate_row["date"]) {
		return "dateはYYYY-MM-DD形式で指定してください"
	}
	note, is_text := candidate_row["note"].(string)
	if !is_text {
		return "リクエストの形式が不正です"
	}
	if utf8.RuneCountInString(note) > maxNoteLength {
		return "noteは500文字以内で入力してください"
	}
	return ""
}

func validateMonthlyReviewNote(candidate_row Row) string {
	year_month, is_text := candidate_row["year_month"].(string)
	if !is_text || !yearMonthPattern.MatchString(year_month) {
		return "year_monthはYYYY-MM形式で指定してください"
	}
	category_id, is_text := candidate_row["category_id"].(string)
	if !is_text || category_id == "" {
		return "category_idは必須です"
	}
	if !IsUUID(category_id) {
		return "category_idが不正です"
	}
	note, is_text := candidate_row["note"].(string)
	if !is_text {
		return "リクエストの形式が不正です"
	}
	if utf8.RuneCountInString(note) > maxNoteLength {
		return "noteは500文字以内で入力してください"
	}
	return ""
}

func isValidDateValue(raw_value any) bool {
	date_text, is_text := raw_value.(string)
	if !is_text {
		return false
	}
	_, err := time.Parse("2006-01-02", date_text)
	return err == nil
}

func checkOptionalText(raw_value any, max_length int, message string) string {
	switch typed_value := raw_value.(type) {
	case nil:
		return ""
	case string:
		if utf8.RuneCountInString(typed_value) > max_length {
			return message
		}
		return ""
	default:
		return message
	}
}
