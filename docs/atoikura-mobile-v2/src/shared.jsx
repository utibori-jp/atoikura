/* shared utilities + sample data for Atoikura mocks */

const SAMPLE = /*EDITMODE-BEGIN*/{
  "palette": "warm",
  "density": "cozy",
  "dark": false
}/*EDITMODE-END*/;

// Sample journal data — current month so far
const TODAY = 18;
const DAYS_IN_MONTH = 30;
const MONTHLY_BUDGET = 80000;
const SPENT_SO_FAR = 47200;
const REMAINING = MONTHLY_BUDGET - SPENT_SO_FAR;
const DAILY_BUDGET = Math.round(MONTHLY_BUDGET / DAYS_IN_MONTH);
const PACE_PER_DAY = SPENT_SO_FAR / TODAY;
const PROJECTED_END = Math.round(PACE_PER_DAY * DAYS_IN_MONTH);

// Daily series — food, other, cumulative + baseline
function buildSeries() {
  // realistic random-ish daily spend (deterministic seed)
  const foodDaily = [1200,800,2400,0,1600,3200,900,1100,2800,0,1400,1800,2200,3600,1200,800,1500,2100];
  const otherDaily = [600,1800,400,2200,0,800,1500,3500,200,1200,900,2400,0,1800,600,1200,2800,1400];
  const days = DAYS_IN_MONTH;
  const series = [];
  let foodCum = 0, otherCum = 0;
  for (let d = 1; d <= days; d++) {
    const isPast = d <= TODAY;
    if (isPast) {
      foodCum += foodDaily[d-1] || 0;
      otherCum += otherDaily[d-1] || 0;
    }
    series.push({
      day: d,
      isPast,
      food: isPast ? foodCum : null,
      other: isPast ? otherCum : null,
      total: isPast ? (foodCum + otherCum) : null,
      baseline: Math.round((MONTHLY_BUDGET / days) * d),
    });
  }
  // forecast extension for future days
  const lastFood = foodCum, lastOther = otherCum;
  const foodPace = lastFood / TODAY;
  const otherPace = lastOther / TODAY;
  for (let d = TODAY + 1; d <= days; d++) {
    series[d-1].forecastFood = Math.round(foodPace * d);
    series[d-1].forecastOther = Math.round(otherPace * d);
    series[d-1].forecastTotal = Math.round((foodPace + otherPace) * d);
  }
  // anchor forecast at today's actual
  series[TODAY-1].forecastFood = lastFood;
  series[TODAY-1].forecastOther = lastOther;
  series[TODAY-1].forecastTotal = lastFood + lastOther;
  return series;
}

const SERIES = buildSeries();

// Categories
const GROUPS = [
  { id: 1, name: "食費", emoji: "🍙", code: "food" },
  { id: 2, name: "日用品", emoji: "🧺", code: "daily" },
  { id: 3, name: "交通", emoji: "🚃", code: "transport" },
  { id: 4, name: "趣味・娯楽", emoji: "🎈", code: "leisure" },
  { id: 5, name: "交際", emoji: "🍻", code: "social" },
  { id: 6, name: "美容・健康", emoji: "🌿", code: "beauty" },
  { id: 7, name: "固定費", emoji: "🏠", code: "fixed" },
  { id: 8, name: "特別費", emoji: "🎁", code: "special" },
];

const CATEGORIES = [
  { id: 1, group: 1, name: "外食", type: "food" },
  { id: 2, group: 1, name: "コンビニ", type: "food" },
  { id: 3, group: 1, name: "スーパー", type: "food" },
  { id: 4, group: 1, name: "カフェ", type: "food" },
  { id: 5, group: 2, name: "雑貨", type: "other" },
  { id: 6, group: 2, name: "消耗品", type: "other" },
  { id: 7, group: 3, name: "電車・バス", type: "other" },
  { id: 8, group: 3, name: "タクシー", type: "other" },
  { id: 9, group: 4, name: "本・雑誌", type: "other" },
  { id: 10, group: 4, name: "サブスク", type: "other" },
  { id: 11, group: 5, name: "飲み会", type: "other" },
  { id: 12, group: 5, name: "プレゼント", type: "other" },
  { id: 13, group: 6, name: "ドラッグストア", type: "other" },
  { id: 14, group: 6, name: "ジム", type: "other" },
  { id: 15, group: 7, name: "家賃", type: "fixed" },
  { id: 16, group: 7, name: "光熱費", type: "fixed" },
  { id: 17, group: 7, name: "通信費", type: "fixed" },
  { id: 18, group: 8, name: "記念日", type: "excluded" },
];

// Recent journal entries
const ENTRIES = [
  { id: 1, date: "2026-05-18", amount: 1480, name: "唐揚げ定食", group: 1, cat: 1, excluded: false, note: "" },
  { id: 2, date: "2026-05-18", amount: 620, name: "カフェラテ", group: 1, cat: 4, excluded: false, note: "打ち合わせの合間" },
  { id: 3, date: "2026-05-18", amount: 380, name: "コンビニおにぎり", group: 1, cat: 2, excluded: false, note: "" },
  { id: 4, date: "2026-05-17", amount: 3200, name: "スーパーまとめ買い", group: 1, cat: 3, excluded: false, note: "" },
  { id: 5, date: "2026-05-17", amount: 1980, name: "新しいマグカップ", group: 2, cat: 5, excluded: false, note: "" },
  { id: 6, date: "2026-05-16", amount: 4800, name: "本屋", group: 4, cat: 9, excluded: false, note: "技術書3冊" },
  { id: 7, date: "2026-05-15", amount: 15000, name: "記念日ディナー", group: 8, cat: 18, excluded: true, note: "結婚記念日" },
  { id: 8, date: "2026-05-15", amount: 980, name: "ランチ", group: 1, cat: 1, excluded: false, note: "" },
  { id: 9, date: "2026-05-14", amount: 1450, name: "電車回数券", group: 3, cat: 7, excluded: false, note: "" },
  { id: 10, date: "2026-05-13", amount: 2400, name: "ジム月会費", group: 6, cat: 14, excluded: false, note: "" },
];

const DAILY_NOTES = {
  "2026-05-15": "記念日。気にしない！",
  "2026-05-13": "今月もジム頑張った",
};

const yen = (n) => "¥" + Math.round(n).toLocaleString("ja-JP");
const yenSlim = (n) => Math.round(n).toLocaleString("ja-JP");

// Smooth path generator (cardinal-ish via Catmull-Rom)
function smoothPath(points) {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0][0]} ${points[0][1]}`;
  let d = `M ${points[0][0]} ${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
    const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
    const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
    const cp2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2[0]} ${p2[1]}`;
  }
  return d;
}

Object.assign(window, {
  SAMPLE, TODAY, DAYS_IN_MONTH, MONTHLY_BUDGET, SPENT_SO_FAR, REMAINING,
  DAILY_BUDGET, PACE_PER_DAY, PROJECTED_END, SERIES, GROUPS, CATEGORIES,
  ENTRIES, DAILY_NOTES, yen, yenSlim, smoothPath,
});
