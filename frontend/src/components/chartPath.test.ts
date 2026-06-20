import { describe, expect, it } from "vitest";
import { smoothPath } from "./chartPath";

// Sample a cubic Bézier's y at parameter t.
function bezierY(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const mt = 1 - t;
  return mt * mt * mt * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t * p3;
}

// Parse the path's anchor + control y-values per segment: returns
// [{ startY, cp1y, cp2y, endY }] for every "C ..." command.
function segments(path: string): { startY: number; cp1y: number; cp2y: number; endY: number }[] {
  const [moveTo, ...curves] = path.split(" C ");
  let startY = Number(moveTo.trim().split(/\s+/)[2]);
  return curves.map((curve) => {
    const nums = curve.replace(/,/g, " ").trim().split(/\s+/).map(Number);
    const [, cp1y, , cp2y, , endY] = nums;
    const seg = { startY, cp1y, cp2y, endY };
    startY = endY;
    return seg;
  });
}

describe("smoothPath", () => {
  it("returns an empty string for no points and a move-to for one point", () => {
    expect(smoothPath([])).toBe("");
    expect(smoothPath([[10, 20]])).toBe("M 10 20");
  });

  it("never overshoots a monotonically non-decreasing cumulative series (#106)", () => {
    // Real reproduction data: cumulative variable-expense totals for a month
    // with a flat stretch then sharp jumps after expenses are added. In screen
    // space larger totals map to *smaller* y, so y is monotonically decreasing.
    const totals = [
      0, 0, 0, 0, 30000, 30000, 30000, 30000, 30500, 30500, 30500, 32500, 32500, 32500, 32500,
      32500, 132500, 157500, 159500,
    ];
    const maxY = 277450; // chartMaxY(160000, [...totals, projected_end])
    const h = 236; // height - padT - padB for the web chart
    const padT = 24;
    const yAt = (v: number) => padT + h - (v / maxY) * h;
    const points: [number, number][] = totals.map((total, index) => [index * 35, yAt(total)]);

    const path = smoothPath(points);

    for (const seg of segments(path)) {
      const lower = Math.min(seg.startY, seg.endY);
      const upper = Math.max(seg.startY, seg.endY);
      for (let step = 0; step <= 20; step++) {
        const y = bezierY(seg.startY, seg.cp1y, seg.cp2y, seg.endY, step / 20);
        // Allow a sub-pixel tolerance for floating point only.
        expect(y).toBeGreaterThanOrEqual(lower - 0.01);
        expect(y).toBeLessThanOrEqual(upper + 0.01);
      }
    }
  });
});
