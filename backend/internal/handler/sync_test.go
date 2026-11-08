package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"testing"

	"github.com/utibori-jp/atoikura/backend/internal/repository"
	"github.com/utibori-jp/atoikura/backend/internal/syncrules"
	"github.com/utibori-jp/atoikura/backend/internal/testutil"
)

type fakeSyncRepo struct {
	push_calls     int
	pushed_user_id int64
	pushed_inputs  []repository.PushInput
	push_results   []repository.PushResult
	pull_since     int64
	pull_limit     int
	pull_result    *repository.PullResult
}

func (f *fakeSyncRepo) Push(_ context.Context, user_id int64, push_inputs []repository.PushInput) ([]repository.PushResult, error) {
	f.push_calls++
	f.pushed_user_id = user_id
	f.pushed_inputs = push_inputs
	return f.push_results, nil
}

func (f *fakeSyncRepo) Pull(_ context.Context, _ int64, since int64, limit int) (*repository.PullResult, error) {
	f.pull_since = since
	f.pull_limit = limit
	if f.pull_result != nil {
		return f.pull_result, nil
	}
	return &repository.PullResult{Ledgers: repository.CallerLedgers{PersonalID: "ledger"}, Rows: []repository.PulledRow{}, NextSince: since}, nil
}

func newSyncRequest(t *testing.T, method string, path string, body string, user_id int64) *http.Request {
	t.Helper()
	sync_request := testutil.NewRequest(t, method, path, nil)
	sync_request.Body = http.NoBody
	if body != "" {
		sync_request.Body = nopCloser{strings.NewReader(body)}
	}
	sync_request.Header.Set(SyncProtocolHeader, "1")
	return sync_request.WithContext(WithUserID(sync_request.Context(), user_id))
}

func changesBody(change_count int) string {
	change_texts := make([]string, change_count)
	for change_index := range change_texts {
		change_texts[change_index] = fmt.Sprintf(`{"collection":"daily_notes","id":"00000000-0000-7000-8000-%012d","fields":{}}`, change_index)
	}
	return `{"changes":[` + strings.Join(change_texts, ",") + `]}`
}

func TestRequireSyncProtocol(t *testing.T) {
	next_handler := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusNoContent) })
	test_cases := []struct {
		name        string
		header      string
		want_status int
	}{
		{"current version", "2", http.StatusNoContent},
		{"newer version", "3", http.StatusNoContent},
		{"wallet protocol", "1", http.StatusUpgradeRequired},
		{"missing", "", http.StatusUpgradeRequired},
		{"too old", "0", http.StatusUpgradeRequired},
		{"garbage", "v1", http.StatusUpgradeRequired},
	}
	for _, test_case := range test_cases {
		t.Run(test_case.name, func(t *testing.T) {
			protocol_request := testutil.NewRequest(t, http.MethodGet, "/sync/pull?since=0", nil)
			if test_case.header != "" {
				protocol_request.Header.Set(SyncProtocolHeader, test_case.header)
			}
			w := testutil.NewRecorder()
			RequireSyncProtocol(next_handler).ServeHTTP(w, protocol_request)
			testutil.AssertStatus(t, w, test_case.want_status)
			if w.Header().Get(SyncProtocolHeader) != "2" {
				t.Errorf("server protocol header = %q", w.Header().Get(SyncProtocolHeader))
			}
			if test_case.want_status == http.StatusUpgradeRequired {
				var error_response ErrorResponse
				testutil.DecodeJSON(t, w, &error_response)
				if error_response.Code != "UPDATE_REQUIRED" {
					t.Errorf("code = %q, want UPDATE_REQUIRED", error_response.Code)
				}
			}
		})
	}
}

func TestPushHandler_RequestLimits(t *testing.T) {
	test_cases := []struct {
		name        string
		body        string
		want_status int
	}{
		{"malformed JSON", `{"changes":`, http.StatusBadRequest},
		{"no changes", `{"changes":[]}`, http.StatusBadRequest},
		{"too many changes", changesBody(syncrules.MaxChangesPerPush + 1), http.StatusBadRequest},
		{"malformed change", `{"changes":[{"collection":1}]}`, http.StatusBadRequest},
		{"body over 1 MiB", `{"changes":["` + strings.Repeat("a", maxPushBodyBytes) + `"]}`, http.StatusRequestEntityTooLarge},
	}
	for _, test_case := range test_cases {
		t.Run(test_case.name, func(t *testing.T) {
			sync_repo := &fakeSyncRepo{}
			w := testutil.NewRecorder()
			PushHandler(sync_repo).ServeHTTP(w, newSyncRequest(t, http.MethodPost, "/sync/push", test_case.body, 7))
			testutil.AssertStatus(t, w, test_case.want_status)
			if sync_repo.push_calls != 0 {
				t.Fatal("changes applied despite a request-level error")
			}
		})
	}
}

func TestPushHandler_PassesSizesAndTokenUser(t *testing.T) {
	applied_seq := int64(42)
	merged_into := "00000000-0000-7000-8000-000000000009"
	sync_repo := &fakeSyncRepo{push_results: []repository.PushResult{
		{ID: "a", Applied: true, Seq: &applied_seq, MergedInto: &merged_into},
		{ID: "b", Reason: syncrules.ReasonForbidden, Message: "このデータは変更できません"},
	}}
	w := testutil.NewRecorder()
	PushHandler(sync_repo).ServeHTTP(w, newSyncRequest(t, http.MethodPost, "/sync/push", changesBody(syncrules.MaxChangesPerPush), 7))
	testutil.AssertStatus(t, w, http.StatusOK)

	if sync_repo.pushed_user_id != 7 || len(sync_repo.pushed_inputs) != syncrules.MaxChangesPerPush {
		t.Fatalf("pushed user %d, %d inputs", sync_repo.pushed_user_id, len(sync_repo.pushed_inputs))
	}
	first_change_json := fmt.Sprintf(`{"collection":"daily_notes","id":"00000000-0000-7000-8000-%012d","fields":{}}`, 0)
	if sync_repo.pushed_inputs[0].Size != len(first_change_json) {
		t.Fatalf("size = %d, want %d", sync_repo.pushed_inputs[0].Size, len(first_change_json))
	}

	var push_response struct {
		Results []map[string]any `json:"results"`
	}
	testutil.DecodeJSON(t, w, &push_response)
	if push_response.Results[0]["status"] != "applied" || push_response.Results[0]["seq"] != float64(42) || push_response.Results[0]["merged_into"] != merged_into {
		t.Fatalf("applied result = %v", push_response.Results[0])
	}
	if _, has_reason := push_response.Results[0]["reason"]; has_reason {
		t.Fatalf("applied result has a reason: %v", push_response.Results[0])
	}
	if push_response.Results[1]["status"] != "rejected" || push_response.Results[1]["reason"] != "FORBIDDEN" {
		t.Fatalf("rejected result = %v", push_response.Results[1])
	}
}

func TestPushHandler_RequiresUser(t *testing.T) {
	push_request := testutil.NewRequest(t, http.MethodPost, "/sync/push", map[string]any{"changes": []any{}})
	w := testutil.NewRecorder()
	PushHandler(&fakeSyncRepo{}).ServeHTTP(w, push_request)
	testutil.AssertStatus(t, w, http.StatusUnauthorized)
}

func TestPullHandler_Parameters(t *testing.T) {
	test_cases := []struct {
		name        string
		query       string
		want_status int
		want_since  int64
		want_limit  int
	}{
		{"default limit", "since=0", http.StatusOK, 0, defaultPullLimit},
		{"explicit limit", "since=15&limit=1000", http.StatusOK, 15, 1000},
		{"missing since", "", http.StatusBadRequest, 0, 0},
		{"negative since", "since=-1", http.StatusBadRequest, 0, 0},
		{"limit zero", "since=0&limit=0", http.StatusBadRequest, 0, 0},
		{"limit over cap", "since=0&limit=1001", http.StatusBadRequest, 0, 0},
	}
	for _, test_case := range test_cases {
		t.Run(test_case.name, func(t *testing.T) {
			sync_repo := &fakeSyncRepo{}
			w := testutil.NewRecorder()
			PullHandler(sync_repo).ServeHTTP(w, newSyncRequest(t, http.MethodGet, "/sync/pull?"+test_case.query, "", 7))
			testutil.AssertStatus(t, w, test_case.want_status)
			if test_case.want_status == http.StatusOK && (sync_repo.pull_since != test_case.want_since || sync_repo.pull_limit != test_case.want_limit) {
				t.Fatalf("since/limit = %d/%d", sync_repo.pull_since, sync_repo.pull_limit)
			}
		})
	}
}

func TestPullHandler_ResponseShape(t *testing.T) {
	sync_repo := &fakeSyncRepo{pull_result: &repository.PullResult{
		Ledgers: repository.CallerLedgers{PersonalID: "personal-1", HouseholdID: "household-1", ArchiveIDs: []string{"archive-1"}},
		Rows: []repository.PulledRow{{
			Collection: "journal_entries", ID: "entry-1", LedgerID: "household-1", OwnerID: 7, Seq: 3,
			Data:     map[string]json.RawMessage{"amount": json.RawMessage("100")},
			FieldHLC: map[string]string{"amount": "1793000000000-0001-a"},
		}},
		NextSince: 3,
		HasMore:   true,
	}}
	w := testutil.NewRecorder()
	PullHandler(sync_repo).ServeHTTP(w, newSyncRequest(t, http.MethodGet, "/sync/pull?since=0", "", 7))
	testutil.AssertStatus(t, w, http.StatusOK)
	var pull_response map[string]any
	testutil.DecodeJSON(t, w, &pull_response)
	ledger_ids, _ := json.Marshal(pull_response["ledger_ids"])
	if string(ledger_ids) != `["personal-1","household-1","archive-1"]` || pull_response["personal_ledger_id"] != "personal-1" || pull_response["household_ledger_id"] != "household-1" {
		t.Fatalf("ledgers = %v", pull_response)
	}
	if pull_response["next_since"] != float64(3) || pull_response["has_more"] != true {
		t.Fatalf("pull response = %v", pull_response)
	}
	first_row := pull_response["rows"].([]any)[0].(map[string]any)
	if first_row["collection"] != "journal_entries" || first_row["ledger_id"] != "household-1" || first_row["data"].(map[string]any)["amount"] != float64(100) {
		t.Fatalf("pulled row = %v", first_row)
	}
}
