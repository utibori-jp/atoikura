package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/utibori-jp/atoikura/backend/internal/repository"
	"github.com/utibori-jp/atoikura/backend/internal/testutil"
)

// fakeHouseholdRepo records the last household command.
type fakeHouseholdRepo struct {
	called_command string
	called_user_id int64
	called_input   any
	command_err    error
}

func (f *fakeHouseholdRepo) record(command_name string, user_id int64, command_input any) error {
	f.called_command = command_name
	f.called_user_id = user_id
	f.called_input = command_input
	return f.command_err
}

func (f *fakeHouseholdRepo) CreateHousehold(_ context.Context, user_id int64, household_name string) (string, error) {
	return "household-1", f.record("CreateHousehold", user_id, household_name)
}
func (f *fakeHouseholdRepo) CreateHouseholdInvitation(_ context.Context, user_id int64) (*repository.CreatedInvitation, error) {
	return &repository.CreatedInvitation{ID: "invitation-1", Token: "secret-token", ShortCode: "ABCD2345", ExpiresAt: time.Date(2026, 11, 1, 0, 0, 0, 0, time.UTC)},
		f.record("CreateHouseholdInvitation", user_id, nil)
}
func (f *fakeHouseholdRepo) ListHouseholdInvitations(_ context.Context, user_id int64) ([]repository.OpenInvitation, error) {
	return []repository.OpenInvitation{{ID: "invitation-1", ShortCode: "ABCD2345", CreatedBy: 7}}, f.record("ListHouseholdInvitations", user_id, nil)
}
func (f *fakeHouseholdRepo) RevokeHouseholdInvitation(_ context.Context, user_id int64, invitation_id string) error {
	return f.record("RevokeHouseholdInvitation", user_id, invitation_id)
}
func (f *fakeHouseholdRepo) JoinHousehold(_ context.Context, user_id int64, join_input repository.JoinInput) (string, error) {
	return "household-1", f.record("JoinHousehold", user_id, join_input)
}
func (f *fakeHouseholdRepo) LeaveHousehold(_ context.Context, user_id int64) error {
	return f.record("LeaveHousehold", user_id, nil)
}
func (f *fakeHouseholdRepo) RemoveHouseholdMember(_ context.Context, user_id int64, member_id int64) error {
	return f.record("RemoveHouseholdMember", user_id, member_id)
}
func (f *fakeHouseholdRepo) DissolveHousehold(_ context.Context, user_id int64) error {
	return f.record("DissolveHousehold", user_id, nil)
}
func (f *fakeHouseholdRepo) PutHouseholdAllowance(_ context.Context, user_id int64, member_id int64, effective_from string, amount int32) (*repository.PulledRow, error) {
	if err := f.record("PutHouseholdAllowance", user_id, []any{member_id, effective_from, amount}); err != nil {
		return nil, err
	}
	return &repository.PulledRow{Collection: "allowances", ID: fakeWrittenRowID, Seq: 3, Data: map[string]json.RawMessage{}}, nil
}

func newHouseholdMux(household_repo householdRepository) *http.ServeMux {
	household_mux := http.NewServeMux()
	household_mux.Handle("POST /household", CreateHouseholdHandler(household_repo))
	household_mux.Handle("POST /household/invitations", CreateHouseholdInvitationHandler(household_repo))
	household_mux.Handle("GET /household/invitations", ListHouseholdInvitationsHandler(household_repo))
	household_mux.Handle("DELETE /household/invitations/{id}", RevokeHouseholdInvitationHandler(household_repo))
	household_mux.Handle("POST /household/join", JoinHouseholdHandler(household_repo))
	household_mux.Handle("POST /household/leave", LeaveHouseholdHandler(household_repo))
	household_mux.Handle("POST /household/dissolve", DissolveHouseholdHandler(household_repo))
	household_mux.Handle("DELETE /household/members/{user_id}", RemoveHouseholdMemberHandler(household_repo))
	household_mux.Handle("PUT /household/allowances", PutHouseholdAllowanceHandler(household_repo))
	return household_mux
}

func serveHousehold(t *testing.T, household_repo *fakeHouseholdRepo, method string, path string, body string, with_user bool) *http.Response {
	t.Helper()
	household_request := testutil.NewRequest(t, method, path, nil)
	household_request.Body = nopCloser{strings.NewReader(body)}
	if with_user {
		household_request = household_request.WithContext(WithUserID(household_request.Context(), 7))
	}
	w := testutil.NewRecorder()
	newHouseholdMux(household_repo).ServeHTTP(w, household_request)
	return w.Result()
}

func TestHouseholdHandlers_Validation(t *testing.T) {
	test_cases := []struct {
		name         string
		method       string
		path         string
		body         string
		want_status  int
		want_command string
	}{
		{"create ok", "POST", "/household", `{"name":"Family"}`, http.StatusCreated, "CreateHousehold"},
		{"create without name", "POST", "/household", `{}`, http.StatusBadRequest, ""},
		{"create with forged owner", "POST", "/household", `{"name":"Family","owner_id":1}`, http.StatusBadRequest, ""},
		{"invite", "POST", "/household/invitations", ``, http.StatusCreated, "CreateHouseholdInvitation"},
		{"list invitations", "GET", "/household/invitations", ``, http.StatusOK, "ListHouseholdInvitations"},
		{"revoke", "DELETE", "/household/invitations/" + testRowID, ``, http.StatusNoContent, "RevokeHouseholdInvitation"},
		{"revoke bad id", "DELETE", "/household/invitations/1", ``, http.StatusBadRequest, ""},
		{"join with token", "POST", "/household/join", `{"token":"abc"}`, http.StatusOK, "JoinHousehold"},
		{"join with code", "POST", "/household/join", `{"code":"abcd-2345"}`, http.StatusOK, "JoinHousehold"},
		{"join with both", "POST", "/household/join", `{"token":"abc","code":"ABCD2345"}`, http.StatusBadRequest, ""},
		{"join with neither", "POST", "/household/join", `{}`, http.StatusBadRequest, ""},
		{"join with a short code", "POST", "/household/join", `{"code":"ABC"}`, http.StatusBadRequest, ""},
		{"join with misleading characters", "POST", "/household/join", `{"code":"ABCD0O1I"}`, http.StatusBadRequest, ""},
		{"join with a long token", "POST", "/household/join", `{"token":"` + strings.Repeat("a", maxInvitationTokenLength+1) + `"}`, http.StatusBadRequest, ""},
		{"join naming a household", "POST", "/household/join", `{"code":"ABCD2345","household_id":"x"}`, http.StatusBadRequest, ""},
		{"leave", "POST", "/household/leave", ``, http.StatusNoContent, "LeaveHousehold"},
		{"dissolve", "POST", "/household/dissolve", ``, http.StatusNoContent, "DissolveHousehold"},
		{"remove", "DELETE", "/household/members/12", ``, http.StatusNoContent, "RemoveHouseholdMember"},
		{"remove bad id", "DELETE", "/household/members/abc", ``, http.StatusBadRequest, ""},
		{"allowance ok", "PUT", "/household/allowances", `{"member_id":12,"effective_from":"2026-11","amount":30000}`, http.StatusOK, "PutHouseholdAllowance"},
		{"allowance bad month", "PUT", "/household/allowances", `{"member_id":12,"effective_from":"2026-13","amount":30000}`, http.StatusBadRequest, ""},
		{"allowance negative", "PUT", "/household/allowances", `{"member_id":12,"effective_from":"2026-11","amount":-1}`, http.StatusBadRequest, ""},
		{"allowance naming a ledger", "PUT", "/household/allowances", `{"member_id":12,"effective_from":"2026-11","amount":1,"ledger_id":"x"}`, http.StatusBadRequest, ""},
	}
	for _, test_case := range test_cases {
		t.Run(test_case.name, func(t *testing.T) {
			household_repo := &fakeHouseholdRepo{}
			household_response := serveHousehold(t, household_repo, test_case.method, test_case.path, test_case.body, true)
			if household_response.StatusCode != test_case.want_status {
				t.Fatalf("status = %d, want %d", household_response.StatusCode, test_case.want_status)
			}
			if household_repo.called_command != test_case.want_command {
				t.Fatalf("called %q, want %q", household_repo.called_command, test_case.want_command)
			}
			if test_case.want_command != "" && household_repo.called_user_id != 7 {
				t.Fatalf("user = %d, want the token's user", household_repo.called_user_id)
			}
		})
	}
}

func TestHouseholdHandlers_RequireUser(t *testing.T) {
	for _, route := range [][2]string{{"POST", "/household/leave"}, {"POST", "/household/invitations"}, {"DELETE", "/household/members/12"}} {
		household_repo := &fakeHouseholdRepo{}
		household_response := serveHousehold(t, household_repo, route[0], route[1], ``, false)
		if household_response.StatusCode != http.StatusUnauthorized || household_repo.called_command != "" {
			t.Fatalf("%s %s without a user: %d, called %q", route[0], route[1], household_response.StatusCode, household_repo.called_command)
		}
	}
}

func TestHouseholdHandlers_NormalizeCodeAndShowTokenOnce(t *testing.T) {
	household_repo := &fakeHouseholdRepo{}
	serveHousehold(t, household_repo, "POST", "/household/join", `{"code":" abcd-2345 "}`, true)
	if join_input := household_repo.called_input.(repository.JoinInput); join_input.ShortCode != "ABCD2345" || join_input.Token != "" {
		t.Fatalf("join input = %+v", join_input)
	}

	invite_response := serveHousehold(t, household_repo, "POST", "/household/invitations", ``, true)
	var created_invitation map[string]any
	if err := json.NewDecoder(invite_response.Body).Decode(&created_invitation); err != nil {
		t.Fatalf("decoding: %v", err)
	}
	if created_invitation["token"] != "secret-token" || created_invitation["short_code"] != "ABCD2345" {
		t.Fatalf("created invitation = %v", created_invitation)
	}
	list_response := serveHousehold(t, household_repo, "GET", "/household/invitations", ``, true)
	var listed_invitations struct {
		Invitations []map[string]any `json:"invitations"`
	}
	if err := json.NewDecoder(list_response.Body).Decode(&listed_invitations); err != nil {
		t.Fatalf("decoding: %v", err)
	}
	if _, has_token := listed_invitations.Invitations[0]["token"]; has_token {
		t.Fatal("the invitation list exposes a token")
	}
}

func TestHouseholdHandlers_MapRateLimit(t *testing.T) {
	household_repo := &fakeHouseholdRepo{command_err: &repository.CommandError{Kind: repository.CommandTooManyRequests, Message: "待って"}}
	household_response := serveHousehold(t, household_repo, "POST", "/household/join", `{"code":"ABCD2345"}`, true)
	if household_response.StatusCode != http.StatusTooManyRequests {
		t.Fatalf("status = %d, want 429", household_response.StatusCode)
	}
}
