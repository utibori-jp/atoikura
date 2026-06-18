import { describe, it, expect } from "vitest";
import { chartMaxY } from "./chartScale";

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
