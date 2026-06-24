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

// Smallest tick step we ever use, in yen. Cumulative totals are whole yen and the
// axis labels render as "{step/1000}k", so anything below ¥1k would produce
// fractional, unreadable labels.
const MIN_TICK_STEP = 1000;

/**
 * Generate evenly-spaced "nice" y-axis tick values for the home cumulative chart.
 *
 * The tick labels used to be a hard-coded list topping out at ¥80k (#129), so
 * once `maxY` grew past ¥80k the axis had no reference values above ¥80k. This
 * derives the ticks from the actual scale instead: it picks a rounded step from
 * the 1-2-5 ladder (…1k, 2k, 5k, 10k, 20k, 50k…) aiming for ~`target_ticks`
 * intervals, then walks from 0 up to `maxY`. The result always starts at 0, is
 * evenly spaced, and spans the plotted range to within one step.
 *
 * @param maxY the y-axis maximum (see {@link chartMaxY}); 0/NaN yields just `[0]`
 * @param target_ticks the desired number of intervals (defaults to 5)
 */
export function niceTicks(maxY: number, target_ticks = 5): number[] {
  if (!Number.isFinite(maxY) || maxY <= 0) return [0];

  const rough_step = maxY / target_ticks;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rough_step)));
  const normalized_step = rough_step / magnitude; // in [1, 10)
  const nice_multiplier =
    normalized_step < 1.5 ? 1 : normalized_step < 3 ? 2 : normalized_step < 7 ? 5 : 10;
  const step = Math.max(nice_multiplier * magnitude, MIN_TICK_STEP);

  const ticks: number[] = [];
  for (let tick = 0; tick <= maxY + 1e-9; tick += step) {
    ticks.push(tick);
  }
  return ticks;
}
