/**
 * Build a smooth SVG path through `points` for the home "変動費の累積" chart.
 *
 * Uses a Catmull-Rom-to-Bézier conversion for a soft curve. A plain
 * Catmull-Rom spline overshoots its data points where the slope changes
 * sharply — e.g. a flat stretch followed by a steep jump after a new expense
 * is added — so the cumulative line visibly dips below (then rises back to) the
 * true running total even though the totals are monotonically non-decreasing.
 * That is the "chart breaks when an expense is added" symptom (#106).
 *
 * A cubic Bézier is contained within the convex hull of its four control
 * points, so clamping each segment's control-point y-values to the y-range of
 * that segment's endpoints guarantees the curve never leaves the [start, end]
 * band — eliminating the overshoot while keeping the rounded look.
 *
 * @param points pixel coordinates `[x, y]` in draw order
 * @returns an SVG path `d` string (empty when there are no points)
 */
export function smoothPath(points: [number, number][]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0][0]} ${points[0][1]}`;
  let d = `M ${points[0][0]} ${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
    const cp1y = clamp(p1[1] + (p2[1] - p0[1]) / 6, p1[1], p2[1]);
    const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
    const cp2y = clamp(p2[1] - (p3[1] - p1[1]) / 6, p1[1], p2[1]);
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2[0]} ${p2[1]}`;
  }
  return d;
}

function clamp(value: number, bound_a: number, bound_b: number): number {
  const lower = Math.min(bound_a, bound_b);
  const upper = Math.max(bound_a, bound_b);
  return Math.max(lower, Math.min(upper, value));
}
