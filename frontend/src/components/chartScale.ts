/**
 * Compute the y-axis maximum for the home "変動費の累積" cumulative chart.
 *
 * The chart maps a value `v` to a pixel with `yAt(v) = padT + h - (v / maxY) * h`.
 * If `maxY` is derived from the monthly budget alone, any cumulative total that
 * exceeds the budget — or *any* spending at all when no budget is set yet
 * (budget 0) — maps above the top of the chart band and the line/point renders
 * off-canvas. That is the "chart breaks when an expense is added" bug (#106).
 *
 * Deriving `maxY` from both the budget (to keep the budget reference line
 * visible, with headroom) and the largest plotted total (with headroom) keeps
 * the cumulative line inside the band for the empty-month, single-entry, and
 * many-entry-over-budget cases alike.
 *
 * @param monthly_budget the variable-expense budget for the month (may be 0)
 * @param totals the cumulative totals the chart plots (actual + forecast)
 */
export function chartMaxY(monthly_budget: number, totals: number[]): number {
  const budget = Number.isFinite(monthly_budget) && monthly_budget > 0 ? monthly_budget : 0;
  const data_max = totals.reduce((max, v) => (Number.isFinite(v) && v > max ? v : max), 0);
  return Math.max(budget * 1.05, data_max * 1.1, 1);
}
