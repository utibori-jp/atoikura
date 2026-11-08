// Runs the shared test vectors in testdata/logic, which the Go tests
// (backend/internal/service, backend/internal/handler) also consume, so the
// client logic and the server stay in parity.
import budget_vectors from "../../../testdata/logic/budget_personal.json";
import forecast_vectors from "../../../testdata/logic/forecast.json";
import validation_vectors from "../../../testdata/logic/journal_entry_validation.json";
import { dailyBudget, daysRemaining, variableBudget } from "./budget";
import { buildDailyEntries, type DailySums } from "./forecast";
import { validateJournalEntry, type JournalEntryInput } from "./validation";

function expandVectorValue(raw_value: unknown): unknown {
  if (
    raw_value !== null &&
    typeof raw_value === "object" &&
    "repeat" in raw_value &&
    "count" in raw_value
  ) {
    const repeat_spec = raw_value as { repeat: string; count: number };
    return repeat_spec.repeat.repeat(repeat_spec.count);
  }
  return raw_value;
}

describe("forecast vectors", () => {
  it.each(
    forecast_vectors.cases.map((forecast_case) => [forecast_case.name, forecast_case] as const)
  )("%s", (_case_name, forecast_case) => {
    expect(
      buildDailyEntries(
        forecast_case.actual_sums as DailySums,
        forecast_case.year_month,
        forecast_case.today_jst
      )
    ).toEqual(forecast_case.expected);
  });
});

describe("personal budget vectors", () => {
  it.each(budget_vectors.cases.map((budget_case) => [budget_case.name, budget_case] as const))(
    "%s",
    (_case_name, budget_case) => {
      const budget_input = budget_case.input;
      const variable_budget = variableBudget(
        budget_input.base_income,
        budget_input.recurring_total,
        budget_input.savings_total,
        budget_input.savings_allocated
      );
      expect({
        variable_budget,
        daily_budget: dailyBudget(variable_budget, budget_input.year_month),
        days_remaining: daysRemaining(budget_input.year_month, budget_input.today_jst),
      }).toEqual(budget_case.expected);
    }
  );
});

describe("journal entry validation vectors", () => {
  const active_category_context = { is_household: false, categoryStatus: () => "active" as const };

  it.each(
    validation_vectors.cases.map(
      (validation_case) => [validation_case.name, validation_case] as const
    )
  )("%s", (_case_name, validation_case) => {
    const { category, ...raw_fields } = validation_case.input as Record<string, unknown>;
    const entry_input = Object.fromEntries(
      Object.entries(raw_fields).map(([field_name, raw_value]) => [
        field_name,
        expandVectorValue(raw_value),
      ])
    ) as JournalEntryInput;
    if (category === "present") entry_input.category_id = "0192f000-0000-7000-8000-000000000001";

    const validation_result = validateJournalEntry(entry_input, active_category_context);
    if (validation_case.expected.valid) {
      expect(validation_result).toEqual({ valid: true, warnings: [] });
    } else {
      expect(validation_result).toEqual({
        valid: false,
        message: validation_case.expected.message,
      });
    }
  });
});
