import { describe, it, expect } from "vitest";
import { chartMaxY, niceTicks } from "./chartScale";

// The home "変動費の累積" chart maps a cumulative total `v` to a y pixel via
//   yAt(v) = padT + h - (v / maxY) * h
// so any `v` greater than `maxY` lands above the top of the chart band and the
// line/point renders off-canvas (the "chart breaks when an expense is added"
// bug, #106). The invariant that prevents this is simply: maxY must be at least
// as large as the largest value the chart has to plot.
describe("chartMaxY", () => {
  it("keeps a positive floor for an empty month with no budget", () => {
    expect(chartMaxY(0, [0, 0, 0])).toBeGreaterThanOrEqual(1);
  });

  it("fits the first expense added before any budget is set (empty-month case)", () => {
    const totals = [0, 500];
    expect(chartMaxY(0, totals)).toBeGreaterThanOrEqual(Math.max(...totals));
  });

  it("fits a single entry well within budget", () => {
    const totals = [500];
    const maxY = chartMaxY(80000, totals);
    expect(maxY).toBeGreaterThanOrEqual(Math.max(...totals));
    // budget headroom is preserved so the budget reference line is visible
    expect(maxY).toBeGreaterThanOrEqual(80000);
  });

  it("fits many entries whose cumulative total exceeds the budget", () => {
    const totals = [20000, 55000, 100000];
    expect(chartMaxY(80000, totals)).toBeGreaterThanOrEqual(Math.max(...totals));
  });

  it("ignores non-finite/empty totals safely", () => {
    expect(chartMaxY(0, [])).toBeGreaterThanOrEqual(1);
  });
});

// The y-axis labels/gridlines used to be a hard-coded list that topped out at
// ¥80k (#129), so once `maxY` grew past ¥80k the axis had no reference values
// above ¥80k. `niceTicks` derives the tick values from the actual scale, with a
// "nice" rounded step, so the axis always spans the plotted range.
describe("niceTicks", () => {
  it("preserves the familiar 0–80k ticks at the original scale", () => {
    expect(niceTicks(80000)).toEqual([0, 20000, 40000, 60000, 80000]);
  });

  it("scales the ticks up when the total exceeds ¥80k", () => {
    const ticks = niceTicks(200000);
    // the largest tick must reach into the plotted range, not stop at ¥80k
    expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(80000);
    expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(150000);
  });

  it("always starts at 0 and is strictly ascending", () => {
    for (const maxY of [5000, 80000, 137500, 220000, 1000000]) {
      const ticks = niceTicks(maxY);
      expect(ticks[0]).toBe(0);
      for (let i = 1; i < ticks.length; i++) {
        expect(ticks[i]).toBeGreaterThan(ticks[i - 1]);
      }
    }
  });

  it("uses an evenly-spaced step drawn from round 'nice' values", () => {
    const allowedSteps = [1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000, 500000, 1000000];
    for (const maxY of [5000, 80000, 137500, 220000, 1000000]) {
      const ticks = niceTicks(maxY);
      const step = ticks[1] - ticks[0];
      expect(allowedSteps).toContain(step);
      for (let i = 1; i < ticks.length; i++) {
        expect(ticks[i] - ticks[i - 1]).toBe(step);
      }
    }
  });

  it("covers the plotted range to within one step", () => {
    for (const maxY of [4950, 80000, 137500, 220000]) {
      const ticks = niceTicks(maxY);
      const step = ticks[1] - ticks[0];
      const top = ticks[ticks.length - 1];
      expect(top).toBeLessThanOrEqual(maxY);
      expect(top + step).toBeGreaterThan(maxY);
    }
  });

  it("keeps a sensible, readable number of ticks across a wide range of scales", () => {
    for (const maxY of [80000, 137500, 200000, 220000, 500000]) {
      const ticks = niceTicks(maxY);
      expect(ticks.length).toBeGreaterThanOrEqual(4);
      expect(ticks.length).toBeLessThanOrEqual(7);
    }
  });

  it("returns just [0] for an empty/non-finite scale", () => {
    expect(niceTicks(0)).toEqual([0]);
    expect(niceTicks(Number.NaN)).toEqual([0]);
    expect(niceTicks(-5)).toEqual([0]);
  });
});
