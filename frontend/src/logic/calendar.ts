// Calendar helpers. Month and day boundaries use Asia/Tokyo, matching jstLocation()
// on the server (docs/local-first/design.md §5.4). Dates are plain "YYYY-MM-DD" and
// months "YYYY-MM" strings, so they compare correctly as strings.

const JST_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function todayInJst(now: Date = new Date()): string {
  return JST_DATE_FORMATTER.format(now);
}

const YEAR_MONTH_PATTERN = /^(\d{4})-(\d{2})$/;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidYearMonth(year_month: string): boolean {
  const year_month_match = YEAR_MONTH_PATTERN.exec(year_month);
  if (!year_month_match) return false;
  const month_number = Number(year_month_match[2]);
  return month_number >= 1 && month_number <= 12;
}

// Strict YYYY-MM-DD check that also rejects impossible dates such as 2026-02-30,
// like Go's time.Parse("2006-01-02", ...).
export function isValidDate(date_text: string): boolean {
  const date_match = DATE_PATTERN.exec(date_text);
  if (!date_match) return false;
  const year_month = `${date_match[1]}-${date_match[2]}`;
  if (!isValidYearMonth(year_month)) return false;
  const day_number = Number(date_match[3]);
  return day_number >= 1 && day_number <= daysInMonth(year_month);
}

export function daysInMonth(year_month: string): number {
  const [year_number, month_number] = year_month.split("-").map(Number);
  // Day 0 of the next month is the last day of this month.
  return new Date(Date.UTC(year_number, month_number, 0)).getUTCDate();
}

export function dateInMonth(year_month: string, day_number: number): string {
  return `${year_month}-${String(day_number).padStart(2, "0")}`;
}

// Shifts a YYYY-MM month by month_offset months (negative goes back).
export function addMonths(year_month: string, month_offset: number): string {
  const [year_number, month_number] = year_month.split("-").map(Number);
  const shifted_month = new Date(Date.UTC(year_number, month_number - 1 + month_offset, 1));
  return `${shifted_month.getUTCFullYear()}-${String(shifted_month.getUTCMonth() + 1).padStart(2, "0")}`;
}

// Inclusive list of months from start_month to end_month; empty when start > end.
export function monthsBetween(start_month: string, end_month: string): string[] {
  const month_list: string[] = [];
  for (
    let cursor_month = start_month;
    cursor_month <= end_month;
    cursor_month = addMonths(cursor_month, 1)
  ) {
    month_list.push(cursor_month);
  }
  return month_list;
}
