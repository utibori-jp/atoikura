import { useEffect, useState } from "react";
import { api } from "../../api/client";
import type { components } from "../../api/types";
import { T } from "../../theme";
import { emojiForGroup } from "./groupEmoji";

type DailyCumulativeResponse = components["schemas"]["DailyCumulativeResponse"];
type JournalEntryResponse = components["schemas"]["JournalEntryResponse"];

const COLORS = {
  coralSoft: "#FFE8DD",
  mustardSoft: "#FFF1CC",
  sageSoft: "#DEF1E6",
  mustardDeep: "#A3791F",
};

const yen = (n: number) => `¥${Math.round(n).toLocaleString("ja-JP")}`;
const yenSlim = (n: number) => Math.round(n).toLocaleString("ja-JP");

function currentMonthJST(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" }).slice(0, 7);
}

function todayJST(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

function todayDayJST(): number {
  return Number(todayJST().slice(8, 10));
}

function daysInMonth(ym: string): number {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

interface MRingProps {
  size: number;
  pct: number;
}

function MRing({ size, pct }: MRingProps) {
  const stroke = 18;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const spent = Math.max(0, Math.min(1, (100 - pct) / 100));
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ transform: "rotate(-90deg)" }}
    >
      <defs>
        <linearGradient id="mRingGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={T.mustard} />
          <stop offset="100%" stopColor={T.coral} />
        </linearGradient>
      </defs>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={COLORS.coralSoft}
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="url(#mRingGrad)"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * spent}
      />
    </svg>
  );
}

interface ChartPoint {
  day: number;
  total: number;
  is_actual: boolean;
}

function smoothPath(points: [number, number][]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0][0]} ${points[0][1]}`;
  let d = `M ${points[0][0]} ${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
    const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
    const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
    const cp2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2[0]} ${p2[1]}`;
  }
  return d;
}

interface MMiniChartProps {
  width: number;
  height: number;
  data: ChartPoint[];
  monthly_budget: number;
  today_day: number;
  spent_so_far: number;
  forecast_end: number;
  days_in_month: number;
}

function MMiniChart(props: MMiniChartProps) {
  const {
    width,
    height,
    data,
    monthly_budget,
    today_day,
    spent_so_far,
    forecast_end,
    days_in_month,
  } = props;
  const padL = 30,
    padR = 8,
    padT = 12,
    padB = 20;
  const w = width - padL - padR;
  const h = height - padT - padB;
  const maxY = Math.max(monthly_budget * 1.05, 1);
  const xAt = (d: number) => padL + ((d - 1) / Math.max(days_in_month - 1, 1)) * w;
  const yAt = (v: number) => padT + h - (v / maxY) * h;
  const past = data.filter((d) => d.is_actual);
  const past_pts: [number, number][] = past.map((s) => [xAt(s.day), yAt(s.total)]);
  const fc_pts: [number, number][] = [];
  if (today_day >= 1 && today_day <= days_in_month) {
    const daily_pace = today_day > 0 ? spent_so_far / today_day : 0;
    for (let d = today_day; d <= days_in_month; d++) {
      fc_pts.push([xAt(d), yAt(Math.min(maxY, d === today_day ? spent_so_far : daily_pace * d))]);
    }
  }
  const total_path = smoothPath(past_pts);
  const total_fill = past_pts.length
    ? `${total_path} L ${past_pts[past_pts.length - 1][0]} ${yAt(0)} L ${past_pts[0][0]} ${yAt(0)} Z`
    : "";
  const fc_path = smoothPath(fc_pts);
  const yTicks = [0, Math.round(monthly_budget / 2), monthly_budget];
  void forecast_end;
  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      <defs>
        <linearGradient id="mChartFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={T.coral} stopOpacity="0.3" />
          <stop offset="100%" stopColor={T.coral} stopOpacity="0" />
        </linearGradient>
      </defs>
      {yTicks.map((t) => (
        <g key={t}>
          <line
            x1={padL}
            x2={width - padR}
            y1={yAt(t)}
            y2={yAt(t)}
            stroke={T.hair}
            strokeDasharray="2 4"
          />
          <text
            x={padL - 6}
            y={yAt(t) + 3}
            textAnchor="end"
            fontFamily="DM Sans, sans-serif"
            fontSize="9"
            fill={T.inkSoft}
          >
            {t === 0 ? "0" : `${Math.round(t / 1000)}k`}
          </text>
        </g>
      ))}
      {monthly_budget > 0 && (
        <line
          x1={xAt(1)}
          y1={yAt(0)}
          x2={xAt(days_in_month)}
          y2={yAt(monthly_budget)}
          stroke={T.sage}
          strokeWidth="1.5"
          strokeDasharray="5 5"
          opacity="0.7"
        />
      )}
      {total_fill && <path d={total_fill} fill="url(#mChartFill)" />}
      {total_path && (
        <path
          d={total_path}
          fill="none"
          stroke={T.coral}
          strokeWidth="3"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}
      {fc_path && (
        <path
          d={fc_path}
          fill="none"
          stroke={T.coralDeep}
          strokeWidth="2"
          strokeDasharray="2 5"
          strokeLinecap="round"
          opacity="0.6"
        />
      )}
      {today_day >= 1 && today_day <= days_in_month && (
        <circle
          cx={xAt(today_day)}
          cy={yAt(spent_so_far)}
          r="5"
          fill="#fff"
          stroke={T.coral}
          strokeWidth="3"
        />
      )}
      {[1, Math.ceil(days_in_month / 3), Math.ceil((days_in_month * 2) / 3), days_in_month].map(
        (d) => (
          <text
            key={d}
            x={xAt(d)}
            y={padT + h + 14}
            textAnchor="middle"
            fontFamily="DM Sans, sans-serif"
            fontSize="9"
            fill={T.inkSoft}
          >
            {d}
          </text>
        )
      )}
    </svg>
  );
}

interface MMiniStatProps {
  tone: "coral" | "mustard" | "sage";
  label: string;
  value: string;
}

function MMiniStat({ tone, label, value }: MMiniStatProps) {
  const bg =
    tone === "coral" ? COLORS.coralSoft : tone === "mustard" ? COLORS.mustardSoft : COLORS.sageSoft;
  const fg = tone === "coral" ? T.coralDeep : tone === "mustard" ? COLORS.mustardDeep : T.sageDeep;
  return (
    <div style={{ background: bg, borderRadius: 18, padding: "12px 14px", flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: fg }}>{label}</div>
      <div
        style={{
          fontFamily: "'DM Sans', sans-serif",
          fontWeight: 700,
          fontSize: 18,
          color: T.ink,
          marginTop: 3,
        }}
      >
        {value}
      </div>
    </div>
  );
}

interface CardProps {
  children: React.ReactNode;
  style?: React.CSSProperties;
}

function MCard({ children, style }: CardProps) {
  return (
    <div
      style={{
        background: T.card,
        borderRadius: 24,
        padding: 18,
        boxShadow: "0 8px 24px -18px rgba(80,40,10,0.25)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

interface Props {
  refresh_token: number;
  onShowList: () => void;
}

export function MobileHome({ refresh_token, onShowList }: Props) {
  const [cumulative, setCumulative] = useState<DailyCumulativeResponse | null>(null);
  const [today_entries, setTodayEntries] = useState<JournalEntryResponse[]>([]);
  const ym = currentMonthJST();
  const today = todayJST();

  useEffect(() => {
    let cancelled = false;
    api
      .getDailyCumulative(ym)
      .then((res) => {
        if (!cancelled) setCumulative(res);
      })
      .catch(() => {});
    api
      .listJournalEntries(ym)
      .then((res) => {
        if (cancelled) return;
        const day = res.entries.find((d) => d.date === today);
        setTodayEntries(day?.journal_entries ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [ym, today, refresh_token]);

  const days_total = daysInMonth(ym);
  const today_day = todayDayJST();
  const days_left = Math.max(0, days_total - today_day);
  const monthly_budget = cumulative?.monthly_budget ?? 0;
  const last_actual = cumulative?.days
    ? [...cumulative.days].reverse().find((d) => d.is_actual)
    : null;
  const spent_so_far = last_actual?.total ?? 0;
  const remaining = Math.max(0, monthly_budget - spent_so_far);
  const remaining_pct = monthly_budget > 0 ? Math.round((remaining / monthly_budget) * 100) : 0;
  const daily_pace = today_day > 0 ? spent_so_far / today_day : 0;
  const projected_end = Math.round(daily_pace * days_total);
  const daily_left = days_left > 0 ? Math.round(remaining / days_left) : 0;
  const on_track = projected_end <= monthly_budget;

  const chart_points: ChartPoint[] =
    cumulative?.days.map((d, i) => ({
      day: i + 1,
      total: d.total,
      is_actual: d.is_actual,
    })) ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Hero ring */}
      <MCard style={{ padding: "22px 18px", position: "relative", overflow: "hidden" }}>
        <div style={{ fontSize: 13, color: T.inkSoft, fontWeight: 600, textAlign: "center" }}>
          今月あといくら使える？
        </div>
        <div
          style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginTop: 8,
          }}
        >
          <MRing size={200} pct={remaining_pct} />
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
              <span
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontWeight: 700,
                  fontSize: 42,
                  letterSpacing: "-0.03em",
                  lineHeight: 1,
                  color: T.ink,
                }}
              >
                {yenSlim(remaining)}
              </span>
              <span
                style={{
                  fontFamily: "'Zen Maru Gothic', 'M PLUS Rounded 1c', sans-serif",
                  fontWeight: 700,
                  fontSize: 16,
                }}
              >
                円
              </span>
            </div>
            <div style={{ fontSize: 12, color: T.inkSoft, marginTop: 6 }}>
              残り <strong style={{ color: T.coralDeep }}>{remaining_pct}%</strong> · あと
              {days_left}日
            </div>
          </div>
        </div>
        {monthly_budget > 0 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              marginTop: 6,
              fontSize: 12,
              color: T.sageDeep,
              fontWeight: 700,
            }}
          >
            <span>🌞</span>
            <span>{on_track ? "いいペースです、その調子！" : "少し抑えめにいきましょう"}</span>
          </div>
        )}
      </MCard>

      {/* Mini stats */}
      <div style={{ display: "flex", gap: 10 }}>
        <MMiniStat tone="coral" label="使った" value={yen(spent_so_far)} />
        <MMiniStat tone="mustard" label="月末予測" value={yen(projected_end)} />
        <MMiniStat tone="sage" label="1日" value={yen(daily_left)} />
      </div>

      {/* Chart */}
      <MCard>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 6,
          }}
        >
          <div
            style={{
              fontFamily: "'Zen Maru Gothic', 'M PLUS Rounded 1c', sans-serif",
              fontSize: 15,
              fontWeight: 700,
            }}
          >
            変動費の累積
          </div>
          <div style={{ display: "flex", gap: 10, fontSize: 11, color: T.inkSoft }}>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 9, height: 9, borderRadius: 5, background: T.coral }} />
              実績
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 9, height: 9, borderRadius: 5, background: T.sage }} />
              基準
            </span>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "center", overflow: "hidden" }}>
          <MMiniChart
            width={322}
            height={150}
            data={chart_points}
            monthly_budget={monthly_budget}
            today_day={today_day}
            spent_so_far={spent_so_far}
            forecast_end={projected_end}
            days_in_month={days_total}
          />
        </div>
        {monthly_budget === 0 && (
          <p style={{ marginTop: 8, color: T.mustard, fontSize: 12, textAlign: "center" }}>
            予算を設定してください
          </p>
        )}
      </MCard>

      {/* Today's records */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          margin: "4px 2px 0",
        }}
      >
        <div
          style={{
            fontFamily: "'Zen Maru Gothic', 'M PLUS Rounded 1c', sans-serif",
            fontSize: 15,
            fontWeight: 700,
          }}
        >
          今日の記録
        </div>
        <button
          type="button"
          onClick={onShowList}
          style={{
            background: "transparent",
            border: "none",
            fontSize: 12,
            color: T.coralDeep,
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: "inherit",
            padding: 0,
          }}
        >
          すべて見る →
        </button>
      </div>
      <MCard style={{ padding: "6px 16px" }}>
        {today_entries.length === 0 ? (
          <div
            style={{
              padding: "18px 0",
              textAlign: "center",
              fontSize: 13,
              color: T.inkSoft,
            }}
          >
            まだ今日の記録はありません
          </div>
        ) : (
          today_entries.map((e, i) => {
            const emoji = emojiForGroup(e.group_name);
            return (
              <div
                key={e.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 0",
                  borderBottom: i < today_entries.length - 1 ? `1px solid ${T.hair}` : "none",
                }}
              >
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 12,
                    background: e.is_excluded ? "#F4E9DC" : COLORS.coralSoft,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 18,
                    flexShrink: 0,
                  }}
                >
                  {emoji}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 600,
                      fontSize: 14,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {e.item ?? e.category_name}
                  </div>
                  <div style={{ fontSize: 11, color: T.inkSoft, marginTop: 1 }}>
                    {e.group_name} · {e.category_name}
                  </div>
                </div>
                <div
                  style={{
                    fontFamily: "'DM Sans', sans-serif",
                    fontWeight: 700,
                    fontSize: 15,
                    color: e.is_excluded ? T.inkSoft : T.ink,
                    textDecoration: e.is_excluded ? "line-through" : "none",
                  }}
                >
                  {yen(e.amount)}
                </div>
              </div>
            );
          })
        )}
      </MCard>
    </div>
  );
}
