package handler

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"

	"github.com/utibori-jp/atoikura/backend/internal/repository"
	"github.com/utibori-jp/atoikura/backend/internal/syncrules"
)

// REST commands for the online-only collections (#213). Each command returns the
// written row in the shape pull returns it, so a device can update its cache
// right away; the same row also reaches every other device through pull.

// maxCommandBodyBytes bounds a command body; every command is a small object.
const maxCommandBodyBytes = 64 << 10

// ledgerCommandRepository is the subset of repository.Repository used by the
// ledger command handlers.
type ledgerCommandRepository interface {
	CreateLedgerCategoryGroup(ctx context.Context, caller repository.Caller, category_group_input repository.CategoryGroupInput) (*repository.PulledRow, error)
	UpdateLedgerCategoryGroup(ctx context.Context, caller repository.Caller, group_id string, category_group_input repository.CategoryGroupInput) (*repository.PulledRow, error)
	DeleteLedgerCategoryGroup(ctx context.Context, caller repository.Caller, group_id string) (*repository.PulledRow, error)
	CreateLedgerExpenseCategory(ctx context.Context, caller repository.Caller, expense_category_input repository.ExpenseCategoryInput) (*repository.PulledRow, error)
	UpdateLedgerExpenseCategory(ctx context.Context, caller repository.Caller, category_id string, expense_category_input repository.ExpenseCategoryInput) (*repository.PulledRow, error)
	DeleteLedgerExpenseCategory(ctx context.Context, caller repository.Caller, category_id string) (*repository.PulledRow, error)
	CreateLedgerIncomeRecord(ctx context.Context, caller repository.Caller, income_record_input repository.IncomeRecordInput) (*repository.PulledRow, error)
	UpdateLedgerIncomeRecord(ctx context.Context, caller repository.Caller, income_id string, income_record_input repository.IncomeRecordInput) (*repository.PulledRow, error)
	DeleteLedgerIncomeRecord(ctx context.Context, caller repository.Caller, income_id string) (*repository.PulledRow, error)
	PutLedgerBaseIncome(ctx context.Context, caller repository.Caller, amount int32) (*repository.PulledRow, error)
	CreateLedgerRecurringExpense(ctx context.Context, caller repository.Caller, recurring_input repository.RecurringExpenseInput) (*repository.PulledRow, error)
	UpdateLedgerRecurringExpense(ctx context.Context, caller repository.Caller, recurring_id string, recurring_input repository.RecurringExpenseInput) (*repository.PulledRow, error)
	DeleteLedgerRecurringExpense(ctx context.Context, caller repository.Caller, recurring_id string) (*repository.PulledRow, error)
	ConfirmLedgerRecurringExpense(ctx context.Context, caller repository.Caller, recurring_id string, amount int32, year_month string) (*repository.PulledRow, error)
	CreateLedgerSavingsGoal(ctx context.Context, caller repository.Caller, savings_goal_input repository.SavingsGoalInput) (*repository.PulledRow, error)
	UpdateLedgerSavingsGoal(ctx context.Context, caller repository.Caller, goal_id string, savings_goal_input repository.SavingsGoalInput) (*repository.PulledRow, error)
	DeleteLedgerSavingsGoal(ctx context.Context, caller repository.Caller, goal_id string) (*repository.PulledRow, error)
	CreateLedgerSavingsPosting(ctx context.Context, caller repository.Caller, goal_id string, amount int32, year_month string) (*repository.PulledRow, error)
	PutLedgerBudget(ctx context.Context, caller repository.Caller, budget_input repository.BudgetInput) (*repository.PulledRow, error)
	CreateLedgerSurplusAllocation(ctx context.Context, caller repository.Caller, surplus_input repository.SurplusAllocationInput) (*repository.PulledRow, error)
}

// commandValidationError carries the 400 message of an invalid request body.
type commandValidationError string

// decodeCommandBody decodes a bounded JSON body. Unknown fields are rejected, so
// a body that tries to name an owner or a ledger fails loudly instead of being
// ignored.
func decodeCommandBody(w http.ResponseWriter, r *http.Request, request_body any) bool {
	body_decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxCommandBodyBytes))
	body_decoder.DisallowUnknownFields()
	if err := body_decoder.Decode(request_body); err != nil {
		WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "リクエストの形式が不正です")
		return false
	}
	return true
}

// pathUUID reads the {id} path value as a lower-case UUID.
func pathUUID(w http.ResponseWriter, r *http.Request) (string, bool) {
	path_id := strings.ToLower(r.PathValue("id"))
	if !syncrules.IsUUID(path_id) {
		WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "idが不正です")
		return "", false
	}
	return path_id, true
}

// serveLedgerCommand runs a validated command for the caller and writes the
// written row, or maps the refusal to its status. The ?ledger= query parameter
// picks the caller's personal (default) or household ledger (design.md D15);
// the ledger itself is resolved from the token.
func serveLedgerCommand(w http.ResponseWriter, r *http.Request, success_status int, validation_message commandValidationError, run_command func(context.Context, repository.Caller) (*repository.PulledRow, error)) {
	user_id, ok := UserIDFromContext(r.Context())
	if !ok {
		WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "認証情報が不正です")
		return
	}
	ledger_target, is_known_target := repository.ParseLedgerTarget(r.URL.Query().Get("ledger"))
	if !is_known_target {
		WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "ledgerはpersonalかhouseholdで指定してください")
		return
	}
	if validation_message != "" {
		WriteError(w, http.StatusBadRequest, "BAD_REQUEST", string(validation_message))
		return
	}
	written_row, err := run_command(r.Context(), repository.Caller{UserID: user_id, Target: ledger_target})
	var command_error *repository.CommandError
	if errors.As(err, &command_error) {
		switch command_error.Kind {
		case repository.CommandForbidden:
			WriteError(w, http.StatusForbidden, "FORBIDDEN", command_error.Message)
		case repository.CommandNotFound:
			WriteError(w, http.StatusNotFound, "NOT_FOUND", command_error.Message)
		case repository.CommandConflict:
			WriteError(w, http.StatusConflict, "CONFLICT", command_error.Message)
		default:
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", command_error.Message)
		}
		return
	}
	if err != nil {
		slog.Error("running ledger command", "path", r.URL.Path, "error", err)
		WriteError(w, http.StatusInternalServerError, "INTERNAL_SERVER_ERROR", "予期しないエラーが発生しました")
		return
	}
	WriteJSON(w, success_status, pulledRowJSON(*written_row))
}

// serveDeleteCommand runs a delete command for the {id} in the path.
func serveDeleteCommand(w http.ResponseWriter, r *http.Request, delete_row func(context.Context, repository.Caller, string) (*repository.PulledRow, error)) {
	row_id, ok := pathUUID(w, r)
	if !ok {
		return
	}
	serveLedgerCommand(w, r, http.StatusOK, "", func(ctx context.Context, caller repository.Caller) (*repository.PulledRow, error) {
		return delete_row(ctx, caller, row_id)
	})
}

func isValidYearMonth(year_month *string) bool {
	return year_month != nil && syncrules.IsYearMonth(*year_month)
}

func validateRequiredName(name *string) commandValidationError {
	if name == nil || *name == "" {
		return "nameは必須です"
	}
	if len([]rune(*name)) > 50 {
		return "nameは50文字以内で入力してください"
	}
	return ""
}

// --- Category groups ---

type categoryGroupRequestJSON struct {
	Name              *string `json:"name"`
	StatementTypeCode *string `json:"statement_type_code"`
	Description       *string `json:"description"`
}

var statementTypeCodes = map[string]bool{"food": true, "other": true, "fixed": true, "excluded": true}

func (category_group_request categoryGroupRequestJSON) validate() (repository.CategoryGroupInput, commandValidationError) {
	if category_group_request.Name == nil || *category_group_request.Name == "" {
		return repository.CategoryGroupInput{}, "nameは必須です"
	}
	if category_group_request.StatementTypeCode == nil || !statementTypeCodes[*category_group_request.StatementTypeCode] {
		return repository.CategoryGroupInput{}, "statement_type_codeはfood/other/fixed/excludedのいずれかで指定してください"
	}
	return repository.CategoryGroupInput{
		Name:              *category_group_request.Name,
		StatementTypeCode: *category_group_request.StatementTypeCode,
		Description:       category_group_request.Description,
	}, ""
}

// CreateLedgerCategoryGroupHandler handles POST /ledger/category-groups.
func CreateLedgerCategoryGroupHandler(repo ledgerCommandRepository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var category_group_request categoryGroupRequestJSON
		if !decodeCommandBody(w, r, &category_group_request) {
			return
		}
		category_group_input, validation_message := category_group_request.validate()
		serveLedgerCommand(w, r, http.StatusCreated, validation_message, func(ctx context.Context, caller repository.Caller) (*repository.PulledRow, error) {
			return repo.CreateLedgerCategoryGroup(ctx, caller, category_group_input)
		})
	}
}

// UpdateLedgerCategoryGroupHandler handles PUT /ledger/category-groups/{id}.
func UpdateLedgerCategoryGroupHandler(repo ledgerCommandRepository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		group_id, ok := pathUUID(w, r)
		if !ok {
			return
		}
		var category_group_request categoryGroupRequestJSON
		if !decodeCommandBody(w, r, &category_group_request) {
			return
		}
		category_group_input, validation_message := category_group_request.validate()
		serveLedgerCommand(w, r, http.StatusOK, validation_message, func(ctx context.Context, caller repository.Caller) (*repository.PulledRow, error) {
			return repo.UpdateLedgerCategoryGroup(ctx, caller, group_id, category_group_input)
		})
	}
}

// DeleteLedgerCategoryGroupHandler handles DELETE /ledger/category-groups/{id}.
func DeleteLedgerCategoryGroupHandler(repo ledgerCommandRepository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		serveDeleteCommand(w, r, repo.DeleteLedgerCategoryGroup)
	}
}

// --- Expense categories ---

type expenseCategoryRequestJSON struct {
	GroupID     *string `json:"group_id"`
	Name        *string `json:"name"`
	Description *string `json:"description"`
}

func (expense_category_request expenseCategoryRequestJSON) validate() (repository.ExpenseCategoryInput, commandValidationError) {
	if expense_category_request.GroupID == nil || !syncrules.IsUUID(*expense_category_request.GroupID) {
		return repository.ExpenseCategoryInput{}, "group_idは必須です"
	}
	if expense_category_request.Name == nil || *expense_category_request.Name == "" {
		return repository.ExpenseCategoryInput{}, "nameは必須です"
	}
	return repository.ExpenseCategoryInput{
		GroupID:     strings.ToLower(*expense_category_request.GroupID),
		Name:        *expense_category_request.Name,
		Description: expense_category_request.Description,
	}, ""
}

// CreateLedgerExpenseCategoryHandler handles POST /ledger/expense-categories.
func CreateLedgerExpenseCategoryHandler(repo ledgerCommandRepository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var expense_category_request expenseCategoryRequestJSON
		if !decodeCommandBody(w, r, &expense_category_request) {
			return
		}
		expense_category_input, validation_message := expense_category_request.validate()
		serveLedgerCommand(w, r, http.StatusCreated, validation_message, func(ctx context.Context, caller repository.Caller) (*repository.PulledRow, error) {
			return repo.CreateLedgerExpenseCategory(ctx, caller, expense_category_input)
		})
	}
}

// UpdateLedgerExpenseCategoryHandler handles PUT /ledger/expense-categories/{id}.
func UpdateLedgerExpenseCategoryHandler(repo ledgerCommandRepository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		category_id, ok := pathUUID(w, r)
		if !ok {
			return
		}
		var expense_category_request expenseCategoryRequestJSON
		if !decodeCommandBody(w, r, &expense_category_request) {
			return
		}
		expense_category_input, validation_message := expense_category_request.validate()
		serveLedgerCommand(w, r, http.StatusOK, validation_message, func(ctx context.Context, caller repository.Caller) (*repository.PulledRow, error) {
			return repo.UpdateLedgerExpenseCategory(ctx, caller, category_id, expense_category_input)
		})
	}
}

// DeleteLedgerExpenseCategoryHandler handles DELETE /ledger/expense-categories/{id}.
func DeleteLedgerExpenseCategoryHandler(repo ledgerCommandRepository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		serveDeleteCommand(w, r, repo.DeleteLedgerExpenseCategory)
	}
}

// --- Income ---

type incomeRecordRequestJSON struct {
	TransactionDate *string `json:"transaction_date"`
	Amount          *int32  `json:"amount"`
	Name            *string `json:"name"`
	IncomeType      *string `json:"income_type"`
	Emoji           *string `json:"emoji"`
	Note            string  `json:"note"`
}

func (income_record_request incomeRecordRequestJSON) validate() (repository.IncomeRecordInput, commandValidationError) {
	if income_record_request.TransactionDate == nil || !syncrules.IsDate(*income_record_request.TransactionDate) {
		return repository.IncomeRecordInput{}, "transaction_dateはYYYY-MM-DD形式で指定してください"
	}
	if income_record_request.Amount == nil || *income_record_request.Amount < 1 {
		return repository.IncomeRecordInput{}, "amountは正の整数で指定してください"
	}
	if validation_message := validateRequiredName(income_record_request.Name); validation_message != "" {
		return repository.IncomeRecordInput{}, validation_message
	}
	if income_record_request.IncomeType == nil || !validIncomeTypes[*income_record_request.IncomeType] {
		return repository.IncomeRecordInput{}, "income_typeはsalary/side/bonus/oneoffのいずれかで指定してください"
	}
	if income_record_request.Emoji == nil {
		return repository.IncomeRecordInput{}, "emojiは必須です"
	}
	return repository.IncomeRecordInput{
		TransactionDate: *income_record_request.TransactionDate,
		Amount:          *income_record_request.Amount,
		Name:            *income_record_request.Name,
		IncomeType:      *income_record_request.IncomeType,
		Emoji:           *income_record_request.Emoji,
		Note:            income_record_request.Note,
	}, ""
}

// CreateLedgerIncomeRecordHandler handles POST /ledger/income-records.
func CreateLedgerIncomeRecordHandler(repo ledgerCommandRepository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var income_record_request incomeRecordRequestJSON
		if !decodeCommandBody(w, r, &income_record_request) {
			return
		}
		income_record_input, validation_message := income_record_request.validate()
		serveLedgerCommand(w, r, http.StatusCreated, validation_message, func(ctx context.Context, caller repository.Caller) (*repository.PulledRow, error) {
			return repo.CreateLedgerIncomeRecord(ctx, caller, income_record_input)
		})
	}
}

// UpdateLedgerIncomeRecordHandler handles PUT /ledger/income-records/{id}.
func UpdateLedgerIncomeRecordHandler(repo ledgerCommandRepository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		income_id, ok := pathUUID(w, r)
		if !ok {
			return
		}
		var income_record_request incomeRecordRequestJSON
		if !decodeCommandBody(w, r, &income_record_request) {
			return
		}
		income_record_input, validation_message := income_record_request.validate()
		serveLedgerCommand(w, r, http.StatusOK, validation_message, func(ctx context.Context, caller repository.Caller) (*repository.PulledRow, error) {
			return repo.UpdateLedgerIncomeRecord(ctx, caller, income_id, income_record_input)
		})
	}
}

// DeleteLedgerIncomeRecordHandler handles DELETE /ledger/income-records/{id}.
func DeleteLedgerIncomeRecordHandler(repo ledgerCommandRepository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		serveDeleteCommand(w, r, repo.DeleteLedgerIncomeRecord)
	}
}

// PutLedgerBaseIncomeHandler handles PUT /ledger/base-income: the caller's own
// base income.
func PutLedgerBaseIncomeHandler(repo ledgerCommandRepository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var base_income_request struct {
			Amount *int32 `json:"amount"`
		}
		if !decodeCommandBody(w, r, &base_income_request) {
			return
		}
		var validation_message commandValidationError
		if base_income_request.Amount == nil || *base_income_request.Amount < 0 {
			validation_message = "amountは0以上の整数で指定してください"
		}
		serveLedgerCommand(w, r, http.StatusOK, validation_message, func(ctx context.Context, caller repository.Caller) (*repository.PulledRow, error) {
			return repo.PutLedgerBaseIncome(ctx, caller, *base_income_request.Amount)
		})
	}
}

// --- Recurring expenses ---

type recurringExpenseRequestJSON struct {
	Name       *string `json:"name"`
	Emoji      *string `json:"emoji"`
	BillingDay *int16  `json:"billing_day"`
	Amount     *int32  `json:"amount"`
	Type       *string `json:"type"`
	CategoryID *string `json:"category_id"`
}

func (recurring_request recurringExpenseRequestJSON) validate() (repository.RecurringExpenseInput, commandValidationError) {
	if validation_message := validateRequiredName(recurring_request.Name); validation_message != "" {
		return repository.RecurringExpenseInput{}, validation_message
	}
	if recurring_request.Emoji == nil {
		return repository.RecurringExpenseInput{}, "emojiは必須です"
	}
	if recurring_request.BillingDay == nil || *recurring_request.BillingDay < 1 || *recurring_request.BillingDay > 31 {
		return repository.RecurringExpenseInput{}, "billing_dayは1〜31の整数で指定してください"
	}
	// A posting is a journal entry, whose amount must be positive.
	if recurring_request.Amount != nil && *recurring_request.Amount < 1 {
		return repository.RecurringExpenseInput{}, "amountは正の整数で指定してください"
	}
	if recurring_request.Type == nil || (*recurring_request.Type != "fixed" && *recurring_request.Type != "variable") {
		return repository.RecurringExpenseInput{}, "typeはfixedまたはvariableで指定してください"
	}
	if recurring_request.CategoryID == nil || !syncrules.IsUUID(*recurring_request.CategoryID) {
		return repository.RecurringExpenseInput{}, "category_idは必須です"
	}
	return repository.RecurringExpenseInput{
		Name:       *recurring_request.Name,
		Emoji:      *recurring_request.Emoji,
		BillingDay: *recurring_request.BillingDay,
		Amount:     recurring_request.Amount,
		Type:       *recurring_request.Type,
		CategoryID: strings.ToLower(*recurring_request.CategoryID),
	}, ""
}

// CreateLedgerRecurringExpenseHandler handles POST /ledger/recurring-expenses.
func CreateLedgerRecurringExpenseHandler(repo ledgerCommandRepository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var recurring_request recurringExpenseRequestJSON
		if !decodeCommandBody(w, r, &recurring_request) {
			return
		}
		recurring_input, validation_message := recurring_request.validate()
		serveLedgerCommand(w, r, http.StatusCreated, validation_message, func(ctx context.Context, caller repository.Caller) (*repository.PulledRow, error) {
			return repo.CreateLedgerRecurringExpense(ctx, caller, recurring_input)
		})
	}
}

// UpdateLedgerRecurringExpenseHandler handles PUT /ledger/recurring-expenses/{id}.
func UpdateLedgerRecurringExpenseHandler(repo ledgerCommandRepository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		recurring_id, ok := pathUUID(w, r)
		if !ok {
			return
		}
		var recurring_request recurringExpenseRequestJSON
		if !decodeCommandBody(w, r, &recurring_request) {
			return
		}
		recurring_input, validation_message := recurring_request.validate()
		serveLedgerCommand(w, r, http.StatusOK, validation_message, func(ctx context.Context, caller repository.Caller) (*repository.PulledRow, error) {
			return repo.UpdateLedgerRecurringExpense(ctx, caller, recurring_id, recurring_input)
		})
	}
}

// DeleteLedgerRecurringExpenseHandler handles DELETE /ledger/recurring-expenses/{id}.
func DeleteLedgerRecurringExpenseHandler(repo ledgerCommandRepository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		serveDeleteCommand(w, r, repo.DeleteLedgerRecurringExpense)
	}
}

// monthlyAmountRequestJSON is the body of a posting for one month.
type monthlyAmountRequestJSON struct {
	Amount    *int32  `json:"amount"`
	YearMonth *string `json:"year_month"`
}

func (monthly_amount_request monthlyAmountRequestJSON) validate() commandValidationError {
	if monthly_amount_request.Amount == nil || *monthly_amount_request.Amount < 1 {
		return "amountは正の整数で指定してください"
	}
	if !isValidYearMonth(monthly_amount_request.YearMonth) {
		return "year_monthはYYYY-MM形式で指定してください"
	}
	return ""
}

// ConfirmLedgerRecurringExpenseHandler handles POST
// /ledger/recurring-expenses/{id}/confirm and returns the posted journal entry.
func ConfirmLedgerRecurringExpenseHandler(repo ledgerCommandRepository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		recurring_id, ok := pathUUID(w, r)
		if !ok {
			return
		}
		var confirm_request monthlyAmountRequestJSON
		if !decodeCommandBody(w, r, &confirm_request) {
			return
		}
		serveLedgerCommand(w, r, http.StatusCreated, confirm_request.validate(), func(ctx context.Context, caller repository.Caller) (*repository.PulledRow, error) {
			return repo.ConfirmLedgerRecurringExpense(ctx, caller, recurring_id, *confirm_request.Amount, *confirm_request.YearMonth)
		})
	}
}

// --- Savings ---

type savingsGoalRequestJSON struct {
	Name          *string `json:"name"`
	Emoji         *string `json:"emoji"`
	MonthlyAmount *int32  `json:"monthly_amount"`
	TargetAmount  *int32  `json:"target_amount"`
	Deadline      *string `json:"deadline"`
	Memo          string  `json:"memo"`
}

func (savings_goal_request savingsGoalRequestJSON) validate() (repository.SavingsGoalInput, commandValidationError) {
	if validation_message := validateRequiredName(savings_goal_request.Name); validation_message != "" {
		return repository.SavingsGoalInput{}, validation_message
	}
	if savings_goal_request.Emoji == nil {
		return repository.SavingsGoalInput{}, "emojiは必須です"
	}
	if savings_goal_request.MonthlyAmount == nil || *savings_goal_request.MonthlyAmount < 0 {
		return repository.SavingsGoalInput{}, "monthly_amountは0以上の整数で指定してください"
	}
	if savings_goal_request.TargetAmount == nil || *savings_goal_request.TargetAmount < 0 {
		return repository.SavingsGoalInput{}, "target_amountは0以上の整数で指定してください"
	}
	deadline := savings_goal_request.Deadline
	if deadline != nil && *deadline == "" {
		deadline = nil
	}
	if deadline != nil && !syncrules.IsYearMonth(*deadline) {
		return repository.SavingsGoalInput{}, "deadlineはYYYY-MM形式で指定してください"
	}
	return repository.SavingsGoalInput{
		Name:          *savings_goal_request.Name,
		Emoji:         *savings_goal_request.Emoji,
		MonthlyAmount: *savings_goal_request.MonthlyAmount,
		TargetAmount:  *savings_goal_request.TargetAmount,
		Deadline:      deadline,
		Memo:          savings_goal_request.Memo,
	}, ""
}

// CreateLedgerSavingsGoalHandler handles POST /ledger/savings-goals.
func CreateLedgerSavingsGoalHandler(repo ledgerCommandRepository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var savings_goal_request savingsGoalRequestJSON
		if !decodeCommandBody(w, r, &savings_goal_request) {
			return
		}
		savings_goal_input, validation_message := savings_goal_request.validate()
		serveLedgerCommand(w, r, http.StatusCreated, validation_message, func(ctx context.Context, caller repository.Caller) (*repository.PulledRow, error) {
			return repo.CreateLedgerSavingsGoal(ctx, caller, savings_goal_input)
		})
	}
}

// UpdateLedgerSavingsGoalHandler handles PUT /ledger/savings-goals/{id}.
func UpdateLedgerSavingsGoalHandler(repo ledgerCommandRepository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		goal_id, ok := pathUUID(w, r)
		if !ok {
			return
		}
		var savings_goal_request savingsGoalRequestJSON
		if !decodeCommandBody(w, r, &savings_goal_request) {
			return
		}
		savings_goal_input, validation_message := savings_goal_request.validate()
		serveLedgerCommand(w, r, http.StatusOK, validation_message, func(ctx context.Context, caller repository.Caller) (*repository.PulledRow, error) {
			return repo.UpdateLedgerSavingsGoal(ctx, caller, goal_id, savings_goal_input)
		})
	}
}

// DeleteLedgerSavingsGoalHandler handles DELETE /ledger/savings-goals/{id}.
func DeleteLedgerSavingsGoalHandler(repo ledgerCommandRepository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		serveDeleteCommand(w, r, repo.DeleteLedgerSavingsGoal)
	}
}

// CreateLedgerSavingsPostingHandler handles POST /ledger/savings-goals/{id}/postings.
func CreateLedgerSavingsPostingHandler(repo ledgerCommandRepository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		goal_id, ok := pathUUID(w, r)
		if !ok {
			return
		}
		var posting_request monthlyAmountRequestJSON
		if !decodeCommandBody(w, r, &posting_request) {
			return
		}
		serveLedgerCommand(w, r, http.StatusCreated, posting_request.validate(), func(ctx context.Context, caller repository.Caller) (*repository.PulledRow, error) {
			return repo.CreateLedgerSavingsPosting(ctx, caller, goal_id, *posting_request.Amount, *posting_request.YearMonth)
		})
	}
}

// --- Budget and surplus ---

// PutLedgerBudgetHandler handles PUT /ledger/budget.
func PutLedgerBudgetHandler(repo ledgerCommandRepository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var budget_request struct {
			MonthlyBudget *int32  `json:"monthly_budget"`
			GoalText      *string `json:"goal_text"`
			GoalAmount    *int32  `json:"goal_amount"`
		}
		if !decodeCommandBody(w, r, &budget_request) {
			return
		}
		var validation_message commandValidationError
		switch {
		case budget_request.MonthlyBudget == nil || *budget_request.MonthlyBudget < 0:
			validation_message = "monthly_budgetは0以上の整数で指定してください"
		case budget_request.GoalAmount == nil || *budget_request.GoalAmount < 0:
			validation_message = "goal_amountは0以上の整数で指定してください"
		}
		serveLedgerCommand(w, r, http.StatusOK, validation_message, func(ctx context.Context, caller repository.Caller) (*repository.PulledRow, error) {
			return repo.PutLedgerBudget(ctx, caller, repository.BudgetInput{
				MonthlyBudget: *budget_request.MonthlyBudget,
				GoalText:      budget_request.GoalText,
				GoalAmount:    *budget_request.GoalAmount,
			})
		})
	}
}

// CreateLedgerSurplusAllocationHandler handles POST /ledger/surplus-allocations.
func CreateLedgerSurplusAllocationHandler(repo ledgerCommandRepository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var surplus_request struct {
			YearMonth     *string `json:"year_month"`
			Amount        *int32  `json:"amount"`
			Destination   *string `json:"destination"`
			SavingsGoalID *string `json:"savings_goal_id"`
		}
		if !decodeCommandBody(w, r, &surplus_request) {
			return
		}
		var validation_message commandValidationError
		switch {
		case !isValidYearMonth(surplus_request.YearMonth):
			validation_message = "year_monthはYYYY-MM形式で指定してください"
		case surplus_request.Amount == nil || *surplus_request.Amount < 1:
			validation_message = "amountは正の整数で指定してください"
		case surplus_request.Destination == nil || (*surplus_request.Destination != "budget" && *surplus_request.Destination != "savings"):
			validation_message = "destinationはbudgetまたはsavingsで指定してください"
		case *surplus_request.Destination == "savings" && surplus_request.SavingsGoalID == nil:
			validation_message = "destination=savingsの場合はsavings_goal_idは必須です"
		case *surplus_request.Destination == "budget" && surplus_request.SavingsGoalID != nil:
			validation_message = "destination=budgetの場合はsavings_goal_idは指定できません"
		}
		serveLedgerCommand(w, r, http.StatusCreated, validation_message, func(ctx context.Context, caller repository.Caller) (*repository.PulledRow, error) {
			var savings_goal_id *string
			if surplus_request.SavingsGoalID != nil {
				lower_goal_id := strings.ToLower(*surplus_request.SavingsGoalID)
				savings_goal_id = &lower_goal_id
			}
			return repo.CreateLedgerSurplusAllocation(ctx, caller, repository.SurplusAllocationInput{
				YearMonth:     *surplus_request.YearMonth,
				Amount:        *surplus_request.Amount,
				Destination:   *surplus_request.Destination,
				SavingsGoalID: savings_goal_id,
			})
		})
	}
}
