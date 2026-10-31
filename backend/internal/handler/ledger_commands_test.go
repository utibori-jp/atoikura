package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"github.com/utibori-jp/atoikura/backend/internal/repository"
	"github.com/utibori-jp/atoikura/backend/internal/testutil"
)

// fakeLedgerCommandRepo records the last command and returns a fixed result.
type fakeLedgerCommandRepo struct {
	called_command string
	called_caller  repository.Caller
	called_row_id  string
	called_input   any
	command_err    error
}

const fakeWrittenRowID = "00000000-0000-4000-8000-0000000000aa"

func (f *fakeLedgerCommandRepo) record(command_name string, caller repository.Caller, row_id string, command_input any) (*repository.PulledRow, error) {
	f.called_command = command_name
	f.called_caller = caller
	f.called_row_id = row_id
	f.called_input = command_input
	if f.command_err != nil {
		return nil, f.command_err
	}
	return &repository.PulledRow{Collection: command_name, ID: fakeWrittenRowID, OwnerID: caller.UserID, Seq: 9, Data: map[string]json.RawMessage{}}, nil
}

func (f *fakeLedgerCommandRepo) CreateLedgerCategoryGroup(_ context.Context, caller repository.Caller, command_input repository.CategoryGroupInput) (*repository.PulledRow, error) {
	return f.record("CreateLedgerCategoryGroup", caller, "", command_input)
}
func (f *fakeLedgerCommandRepo) UpdateLedgerCategoryGroup(_ context.Context, caller repository.Caller, row_id string, command_input repository.CategoryGroupInput) (*repository.PulledRow, error) {
	return f.record("UpdateLedgerCategoryGroup", caller, row_id, command_input)
}
func (f *fakeLedgerCommandRepo) DeleteLedgerCategoryGroup(_ context.Context, caller repository.Caller, row_id string) (*repository.PulledRow, error) {
	return f.record("DeleteLedgerCategoryGroup", caller, row_id, nil)
}
func (f *fakeLedgerCommandRepo) CreateLedgerExpenseCategory(_ context.Context, caller repository.Caller, command_input repository.ExpenseCategoryInput) (*repository.PulledRow, error) {
	return f.record("CreateLedgerExpenseCategory", caller, "", command_input)
}
func (f *fakeLedgerCommandRepo) UpdateLedgerExpenseCategory(_ context.Context, caller repository.Caller, row_id string, command_input repository.ExpenseCategoryInput) (*repository.PulledRow, error) {
	return f.record("UpdateLedgerExpenseCategory", caller, row_id, command_input)
}
func (f *fakeLedgerCommandRepo) DeleteLedgerExpenseCategory(_ context.Context, caller repository.Caller, row_id string) (*repository.PulledRow, error) {
	return f.record("DeleteLedgerExpenseCategory", caller, row_id, nil)
}
func (f *fakeLedgerCommandRepo) CreateLedgerIncomeRecord(_ context.Context, caller repository.Caller, command_input repository.IncomeRecordInput) (*repository.PulledRow, error) {
	return f.record("CreateLedgerIncomeRecord", caller, "", command_input)
}
func (f *fakeLedgerCommandRepo) UpdateLedgerIncomeRecord(_ context.Context, caller repository.Caller, row_id string, command_input repository.IncomeRecordInput) (*repository.PulledRow, error) {
	return f.record("UpdateLedgerIncomeRecord", caller, row_id, command_input)
}
func (f *fakeLedgerCommandRepo) DeleteLedgerIncomeRecord(_ context.Context, caller repository.Caller, row_id string) (*repository.PulledRow, error) {
	return f.record("DeleteLedgerIncomeRecord", caller, row_id, nil)
}
func (f *fakeLedgerCommandRepo) PutLedgerBaseIncome(_ context.Context, caller repository.Caller, amount int32) (*repository.PulledRow, error) {
	return f.record("PutLedgerBaseIncome", caller, "", amount)
}
func (f *fakeLedgerCommandRepo) CreateLedgerRecurringExpense(_ context.Context, caller repository.Caller, command_input repository.RecurringExpenseInput) (*repository.PulledRow, error) {
	return f.record("CreateLedgerRecurringExpense", caller, "", command_input)
}
func (f *fakeLedgerCommandRepo) UpdateLedgerRecurringExpense(_ context.Context, caller repository.Caller, row_id string, command_input repository.RecurringExpenseInput) (*repository.PulledRow, error) {
	return f.record("UpdateLedgerRecurringExpense", caller, row_id, command_input)
}
func (f *fakeLedgerCommandRepo) DeleteLedgerRecurringExpense(_ context.Context, caller repository.Caller, row_id string) (*repository.PulledRow, error) {
	return f.record("DeleteLedgerRecurringExpense", caller, row_id, nil)
}
func (f *fakeLedgerCommandRepo) ConfirmLedgerRecurringExpense(_ context.Context, caller repository.Caller, row_id string, amount int32, year_month string) (*repository.PulledRow, error) {
	return f.record("ConfirmLedgerRecurringExpense", caller, row_id, []any{amount, year_month})
}
func (f *fakeLedgerCommandRepo) CreateLedgerSavingsGoal(_ context.Context, caller repository.Caller, command_input repository.SavingsGoalInput) (*repository.PulledRow, error) {
	return f.record("CreateLedgerSavingsGoal", caller, "", command_input)
}
func (f *fakeLedgerCommandRepo) UpdateLedgerSavingsGoal(_ context.Context, caller repository.Caller, row_id string, command_input repository.SavingsGoalInput) (*repository.PulledRow, error) {
	return f.record("UpdateLedgerSavingsGoal", caller, row_id, command_input)
}
func (f *fakeLedgerCommandRepo) DeleteLedgerSavingsGoal(_ context.Context, caller repository.Caller, row_id string) (*repository.PulledRow, error) {
	return f.record("DeleteLedgerSavingsGoal", caller, row_id, nil)
}
func (f *fakeLedgerCommandRepo) CreateLedgerSavingsPosting(_ context.Context, caller repository.Caller, row_id string, amount int32, year_month string) (*repository.PulledRow, error) {
	return f.record("CreateLedgerSavingsPosting", caller, row_id, []any{amount, year_month})
}
func (f *fakeLedgerCommandRepo) PutLedgerBudget(_ context.Context, caller repository.Caller, command_input repository.BudgetInput) (*repository.PulledRow, error) {
	return f.record("PutLedgerBudget", caller, "", command_input)
}
func (f *fakeLedgerCommandRepo) CreateLedgerSurplusAllocation(_ context.Context, caller repository.Caller, command_input repository.SurplusAllocationInput) (*repository.PulledRow, error) {
	return f.record("CreateLedgerSurplusAllocation", caller, "", command_input)
}

// newLedgerCommandMux mounts the command handlers under the routes main uses.
func newLedgerCommandMux(command_repo ledgerCommandRepository) *http.ServeMux {
	command_mux := http.NewServeMux()
	command_mux.Handle("POST /ledger/category-groups", CreateLedgerCategoryGroupHandler(command_repo))
	command_mux.Handle("PUT /ledger/category-groups/{id}", UpdateLedgerCategoryGroupHandler(command_repo))
	command_mux.Handle("DELETE /ledger/category-groups/{id}", DeleteLedgerCategoryGroupHandler(command_repo))
	command_mux.Handle("POST /ledger/expense-categories", CreateLedgerExpenseCategoryHandler(command_repo))
	command_mux.Handle("PUT /ledger/expense-categories/{id}", UpdateLedgerExpenseCategoryHandler(command_repo))
	command_mux.Handle("DELETE /ledger/expense-categories/{id}", DeleteLedgerExpenseCategoryHandler(command_repo))
	command_mux.Handle("POST /ledger/income-records", CreateLedgerIncomeRecordHandler(command_repo))
	command_mux.Handle("PUT /ledger/income-records/{id}", UpdateLedgerIncomeRecordHandler(command_repo))
	command_mux.Handle("DELETE /ledger/income-records/{id}", DeleteLedgerIncomeRecordHandler(command_repo))
	command_mux.Handle("PUT /ledger/base-income", PutLedgerBaseIncomeHandler(command_repo))
	command_mux.Handle("POST /ledger/recurring-expenses", CreateLedgerRecurringExpenseHandler(command_repo))
	command_mux.Handle("PUT /ledger/recurring-expenses/{id}", UpdateLedgerRecurringExpenseHandler(command_repo))
	command_mux.Handle("DELETE /ledger/recurring-expenses/{id}", DeleteLedgerRecurringExpenseHandler(command_repo))
	command_mux.Handle("POST /ledger/recurring-expenses/{id}/confirm", ConfirmLedgerRecurringExpenseHandler(command_repo))
	command_mux.Handle("POST /ledger/savings-goals", CreateLedgerSavingsGoalHandler(command_repo))
	command_mux.Handle("PUT /ledger/savings-goals/{id}", UpdateLedgerSavingsGoalHandler(command_repo))
	command_mux.Handle("DELETE /ledger/savings-goals/{id}", DeleteLedgerSavingsGoalHandler(command_repo))
	command_mux.Handle("POST /ledger/savings-goals/{id}/postings", CreateLedgerSavingsPostingHandler(command_repo))
	command_mux.Handle("PUT /ledger/budget", PutLedgerBudgetHandler(command_repo))
	command_mux.Handle("POST /ledger/surplus-allocations", CreateLedgerSurplusAllocationHandler(command_repo))
	return command_mux
}

const testRowID = "0192F2A0-0000-7000-8000-000000000001"

func serveCommand(t *testing.T, command_repo *fakeLedgerCommandRepo, method string, path string, body string) *http.Response {
	t.Helper()
	command_request := testutil.NewRequest(t, method, path, nil)
	command_request.Body = nopCloser{strings.NewReader(body)}
	command_request = command_request.WithContext(WithUserID(command_request.Context(), 7))
	w := testutil.NewRecorder()
	newLedgerCommandMux(command_repo).ServeHTTP(w, command_request)
	return w.Result()
}

func TestLedgerCommandHandlers_Validation(t *testing.T) {
	valid_recurring := `"name":"Rent","emoji":"🏠","billing_day":27,"type":"fixed","category_id":"` + testRowID + `"`
	test_cases := []struct {
		name         string
		method       string
		path         string
		body         string
		want_status  int
		want_command string
	}{
		{"group ok", "POST", "/ledger/category-groups", `{"name":"Food","statement_type_code":"food"}`, http.StatusCreated, "CreateLedgerCategoryGroup"},
		{"group bad type", "POST", "/ledger/category-groups", `{"name":"Food","statement_type_code":"rent"}`, http.StatusBadRequest, ""},
		{"group missing name", "PUT", "/ledger/category-groups/" + testRowID, `{"statement_type_code":"food"}`, http.StatusBadRequest, ""},
		{"group forged ledger_id", "POST", "/ledger/category-groups", `{"name":"Food","statement_type_code":"food","ledger_id":"x"}`, http.StatusBadRequest, ""},
		{"group forged owner_id", "PUT", "/ledger/category-groups/" + testRowID, `{"name":"Food","statement_type_code":"food","owner_id":1}`, http.StatusBadRequest, ""},
		{"bad path id", "DELETE", "/ledger/category-groups/12", ``, http.StatusBadRequest, ""},
		{"delete group", "DELETE", "/ledger/category-groups/" + testRowID, ``, http.StatusOK, "DeleteLedgerCategoryGroup"},
		{"category ok", "POST", "/ledger/expense-categories", `{"group_id":"` + testRowID + `","name":"Super"}`, http.StatusCreated, "CreateLedgerExpenseCategory"},
		{"category bad group", "POST", "/ledger/expense-categories", `{"group_id":"1","name":"Super"}`, http.StatusBadRequest, ""},
		{"income ok", "POST", "/ledger/income-records", `{"transaction_date":"2026-10-25","amount":1,"name":"Pay","income_type":"salary","emoji":""}`, http.StatusCreated, "CreateLedgerIncomeRecord"},
		{"income bad date", "POST", "/ledger/income-records", `{"transaction_date":"2026-02-30","amount":1,"name":"Pay","income_type":"salary","emoji":""}`, http.StatusBadRequest, ""},
		{"income zero", "PUT", "/ledger/income-records/" + testRowID, `{"transaction_date":"2026-10-25","amount":0,"name":"Pay","income_type":"salary","emoji":""}`, http.StatusBadRequest, ""},
		{"income long name", "POST", "/ledger/income-records", `{"transaction_date":"2026-10-25","amount":1,"name":"` + strings.Repeat("a", 51) + `","income_type":"salary","emoji":""}`, http.StatusBadRequest, ""},
		{"income forged earner", "POST", "/ledger/income-records", `{"transaction_date":"2026-10-25","amount":1,"name":"Pay","income_type":"salary","emoji":"","earner_id":2}`, http.StatusBadRequest, ""},
		{"base income ok", "PUT", "/ledger/base-income", `{"amount":0}`, http.StatusOK, "PutLedgerBaseIncome"},
		{"base income negative", "PUT", "/ledger/base-income", `{"amount":-1}`, http.StatusBadRequest, ""},
		{"base income forged member", "PUT", "/ledger/base-income", `{"amount":1,"member_id":2}`, http.StatusBadRequest, ""},
		{"recurring ok", "POST", "/ledger/recurring-expenses", `{` + valid_recurring + `}`, http.StatusCreated, "CreateLedgerRecurringExpense"},
		{"recurring with a wallet", "POST", "/ledger/recurring-expenses", `{` + valid_recurring + `,"wallet":"ledger"}`, http.StatusBadRequest, ""},
		{"household target", "POST", "/ledger/recurring-expenses?ledger=household", `{` + valid_recurring + `}`, http.StatusCreated, "CreateLedgerRecurringExpense"},
		{"unknown target", "POST", "/ledger/recurring-expenses?ledger=archive", `{` + valid_recurring + `}`, http.StatusBadRequest, ""},
		{"ledger ID as target", "DELETE", "/ledger/income-records/" + testRowID + "?ledger=" + testRowID, "", http.StatusBadRequest, ""},
		{"recurring zero amount", "POST", "/ledger/recurring-expenses", `{` + valid_recurring + `,"amount":0}`, http.StatusBadRequest, ""},
		{"recurring day 32", "PUT", "/ledger/recurring-expenses/" + testRowID, `{` + strings.Replace(valid_recurring, "27", "32", 1) + `}`, http.StatusBadRequest, ""},
		{"confirm ok", "POST", "/ledger/recurring-expenses/" + testRowID + "/confirm", `{"amount":100,"year_month":"2026-10"}`, http.StatusCreated, "ConfirmLedgerRecurringExpense"},
		{"confirm month 13", "POST", "/ledger/recurring-expenses/" + testRowID + "/confirm", `{"amount":100,"year_month":"2026-13"}`, http.StatusBadRequest, ""},
		{"goal ok", "POST", "/ledger/savings-goals", `{"name":"Trip","emoji":"","monthly_amount":0,"target_amount":0,"deadline":""}`, http.StatusCreated, "CreateLedgerSavingsGoal"},
		{"goal bad deadline", "PUT", "/ledger/savings-goals/" + testRowID, `{"name":"Trip","emoji":"","monthly_amount":0,"target_amount":0,"deadline":"2027/03"}`, http.StatusBadRequest, ""},
		{"posting ok", "POST", "/ledger/savings-goals/" + testRowID + "/postings", `{"amount":5,"year_month":"2026-10"}`, http.StatusCreated, "CreateLedgerSavingsPosting"},
		{"budget ok", "PUT", "/ledger/budget", `{"monthly_budget":0,"goal_amount":0}`, http.StatusOK, "PutLedgerBudget"},
		{"budget missing goal", "PUT", "/ledger/budget", `{"monthly_budget":0}`, http.StatusBadRequest, ""},
		{"surplus ok", "POST", "/ledger/surplus-allocations", `{"year_month":"2026-10","amount":1,"destination":"savings","savings_goal_id":"` + testRowID + `"}`, http.StatusCreated, "CreateLedgerSurplusAllocation"},
		{"surplus savings without goal", "POST", "/ledger/surplus-allocations", `{"year_month":"2026-10","amount":1,"destination":"savings"}`, http.StatusBadRequest, ""},
		{"surplus budget with goal", "POST", "/ledger/surplus-allocations", `{"year_month":"2026-10","amount":1,"destination":"budget","savings_goal_id":"` + testRowID + `"}`, http.StatusBadRequest, ""},
		{"body too large", "PUT", "/ledger/budget", `{"goal_text":"` + strings.Repeat("a", maxCommandBodyBytes) + `"}`, http.StatusBadRequest, ""},
	}
	for _, test_case := range test_cases {
		t.Run(test_case.name, func(t *testing.T) {
			command_repo := &fakeLedgerCommandRepo{}
			command_response := serveCommand(t, command_repo, test_case.method, test_case.path, test_case.body)
			if command_response.StatusCode != test_case.want_status {
				t.Fatalf("status = %d, want %d", command_response.StatusCode, test_case.want_status)
			}
			if command_repo.called_command != test_case.want_command {
				t.Fatalf("called %q, want %q", command_repo.called_command, test_case.want_command)
			}
			if test_case.want_command != "" && command_repo.called_caller.UserID != 7 {
				t.Fatalf("user = %d, want the token's user", command_repo.called_caller.UserID)
			}
			want_target := repository.TargetPersonal
			if strings.Contains(test_case.path, "ledger=household") {
				want_target = repository.TargetHousehold
			}
			if test_case.want_command != "" && command_repo.called_caller.Target != want_target {
				t.Fatalf("target = %q, want %q", command_repo.called_caller.Target, want_target)
			}
		})
	}
}

func TestLedgerCommandHandlers_NormalizeIDsAndReturnRow(t *testing.T) {
	command_repo := &fakeLedgerCommandRepo{}
	command_response := serveCommand(t, command_repo, "POST", "/ledger/recurring-expenses/"+testRowID+"/confirm", `{"amount":100,"year_month":"2026-10"}`)
	if command_response.StatusCode != http.StatusCreated {
		t.Fatalf("status = %d", command_response.StatusCode)
	}
	if command_repo.called_row_id != strings.ToLower(testRowID) {
		t.Fatalf("row id = %q, want lower case", command_repo.called_row_id)
	}
	var written_row map[string]any
	if err := json.NewDecoder(command_response.Body).Decode(&written_row); err != nil {
		t.Fatalf("decoding: %v", err)
	}
	if written_row["id"] != fakeWrittenRowID || written_row["seq"] != float64(9) || written_row["collection"] == nil {
		t.Fatalf("written row = %v", written_row)
	}
}

func TestLedgerCommandHandlers_MapCommandErrors(t *testing.T) {
	test_cases := []struct {
		command_kind repository.CommandErrorKind
		want_status  int
		want_code    string
	}{
		{repository.CommandInvalid, http.StatusBadRequest, "BAD_REQUEST"},
		{repository.CommandForbidden, http.StatusForbidden, "FORBIDDEN"},
		{repository.CommandNotFound, http.StatusNotFound, "NOT_FOUND"},
		{repository.CommandConflict, http.StatusConflict, "CONFLICT"},
	}
	for _, test_case := range test_cases {
		command_repo := &fakeLedgerCommandRepo{command_err: &repository.CommandError{Kind: test_case.command_kind, Message: "メッセージ"}}
		command_response := serveCommand(t, command_repo, "DELETE", "/ledger/income-records/"+testRowID, "")
		var error_response ErrorResponse
		if err := json.NewDecoder(command_response.Body).Decode(&error_response); err != nil {
			t.Fatalf("decoding: %v", err)
		}
		if command_response.StatusCode != test_case.want_status || error_response.Code != test_case.want_code || error_response.Message != "メッセージ" {
			t.Fatalf("kind %d → %d %+v", test_case.command_kind, command_response.StatusCode, error_response)
		}
	}
}
