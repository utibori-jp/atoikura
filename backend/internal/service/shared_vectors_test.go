package service

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"testing"
	"time"
)

// Shared test vectors live in testdata/logic at the repository root and are also
// consumed by the client logic tests (frontend/src/logic), so both sides stay in parity.
func loadSharedVectors(t *testing.T, file_name string, dest any) {
	t.Helper()
	vector_bytes, err := os.ReadFile(filepath.Join("..", "..", "..", "testdata", "logic", file_name))
	if err != nil {
		t.Fatalf("reading shared vectors %s: %v", file_name, err)
	}
	if err := json.Unmarshal(vector_bytes, dest); err != nil {
		t.Fatalf("decoding shared vectors %s: %v", file_name, err)
	}
}

func TestBuildDailyEntriesSharedVectors(t *testing.T) {
	var vector_file struct {
		Cases []struct {
			Name       string                      `json:"name"`
			YearMonth  string                      `json:"year_month"`
			TodayJST   string                      `json:"today_jst"`
			ActualSums map[string]map[string]int32 `json:"actual_sums"`
			Expected   []DailyEntry                `json:"expected"`
		} `json:"cases"`
	}
	loadSharedVectors(t, "forecast.json", &vector_file)

	for _, forecast_case := range vector_file.Cases {
		t.Run(forecast_case.Name, func(t *testing.T) {
			first_day, _ := time.Parse("2006-01-02", forecast_case.YearMonth+"-01")
			days_in_month, err := DaysInMonth(forecast_case.YearMonth)
			if err != nil {
				t.Fatal(err)
			}
			today_time, _ := time.Parse("2006-01-02", forecast_case.TodayJST)
			is_past_month := forecast_case.YearMonth < forecast_case.TodayJST[:7]

			daily_entries := BuildDailyEntries(forecast_case.ActualSums, first_day, days_in_month, forecast_case.TodayJST, today_time.Day(), is_past_month)
			if !reflect.DeepEqual(daily_entries, forecast_case.Expected) {
				t.Errorf("BuildDailyEntries mismatch\n got: %+v\nwant: %+v", daily_entries, forecast_case.Expected)
			}
		})
	}
}

func TestBudgetFormulasSharedVectors(t *testing.T) {
	var vector_file struct {
		Cases []struct {
			Name  string `json:"name"`
			Input struct {
				BaseIncome       int32  `json:"base_income"`
				RecurringTotal   int32  `json:"recurring_total"`
				SavingsTotal     int32  `json:"savings_total"`
				SavingsAllocated int32  `json:"savings_allocated"`
				YearMonth        string `json:"year_month"`
				TodayJST         string `json:"today_jst"`
			} `json:"input"`
			Expected struct {
				VariableBudget int32 `json:"variable_budget"`
				DailyBudget    int32 `json:"daily_budget"`
				DaysRemaining  int32 `json:"days_remaining"`
			} `json:"expected"`
		} `json:"cases"`
	}
	loadSharedVectors(t, "budget_personal.json", &vector_file)

	for _, budget_case := range vector_file.Cases {
		t.Run(budget_case.Name, func(t *testing.T) {
			budget_input := budget_case.Input
			variable_budget := VariableBudget(budget_input.BaseIncome, budget_input.RecurringTotal, budget_input.SavingsTotal, budget_input.SavingsAllocated)
			daily_budget, err := DailyBudget(variable_budget, budget_input.YearMonth)
			if err != nil {
				t.Fatal(err)
			}
			days_remaining, err := DaysRemaining(budget_input.YearMonth, budget_input.TodayJST)
			if err != nil {
				t.Fatal(err)
			}
			if variable_budget != budget_case.Expected.VariableBudget {
				t.Errorf("variable_budget = %d, want %d", variable_budget, budget_case.Expected.VariableBudget)
			}
			if daily_budget != budget_case.Expected.DailyBudget {
				t.Errorf("daily_budget = %d, want %d", daily_budget, budget_case.Expected.DailyBudget)
			}
			if days_remaining != budget_case.Expected.DaysRemaining {
				t.Errorf("days_remaining = %d, want %d", days_remaining, budget_case.Expected.DaysRemaining)
			}
		})
	}
}
