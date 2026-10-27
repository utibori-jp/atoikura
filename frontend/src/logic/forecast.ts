import { dateInMonth, daysInMonth } from "./calendar";

// Port of backend/internal/service.BuildDailyEntries: cumulative variable spending
// per day, with a month-end forecast from the average daily pace so far. Checked
// against testdata/logic/forecast.json, which is generated from the Go version.

export interface DailyEntry {
  date: string;
  food: number;
  other: number;
  total: number;
  is_actual: boolean;
}

// date -> type_code ("food" | "other") -> sum of that day's spending
export type DailySums = Record<string, Partial<Record<"food" | "other", number>>>;

export function buildDailyEntries(
  daily_sums: DailySums,
  year_month: string,
  today_jst: string
): DailyEntry[] {
  const total_days = daysInMonth(year_month);
  const is_past_month = year_month < today_jst.slice(0, 7);
  const today_day_number = Number(today_jst.slice(8, 10));

  const daily_entries: DailyEntry[] = [];
  let cumulative_food = 0;
  let cumulative_other = 0;
  let cumulative_food_today = 0;
  let cumulative_other_today = 0;
  let is_pace_computed = false;
  let pace_food = 0;
  let pace_other = 0;

  for (let day_number = 1; day_number <= total_days; day_number++) {
    const date_text = dateInMonth(year_month, day_number);

    if (is_past_month || date_text <= today_jst) {
      cumulative_food += daily_sums[date_text]?.food ?? 0;
      cumulative_other += daily_sums[date_text]?.other ?? 0;
      daily_entries.push({
        date: date_text,
        food: cumulative_food,
        other: cumulative_other,
        total: cumulative_food + cumulative_other,
        is_actual: true,
      });
      if (!is_past_month && date_text === today_jst) {
        cumulative_food_today = cumulative_food;
        cumulative_other_today = cumulative_other;
      }
      continue;
    }

    if (!is_pace_computed) {
      if (today_day_number > 0 && (cumulative_food_today !== 0 || cumulative_other_today !== 0)) {
        pace_food = cumulative_food_today / today_day_number;
        pace_other = cumulative_other_today / today_day_number;
      }
      is_pace_computed = true;
    }

    const days_ahead = day_number - today_day_number;
    const forecast_food = cumulative_food_today + Math.floor(pace_food * days_ahead);
    const forecast_other = cumulative_other_today + Math.floor(pace_other * days_ahead);
    daily_entries.push({
      date: date_text,
      food: forecast_food,
      other: forecast_other,
      total: forecast_food + forecast_other,
      is_actual: false,
    });
  }

  return daily_entries;
}
