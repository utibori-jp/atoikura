import { useEffect, useCallback, useState } from "react";
import { api } from "../../api/client";
import type { components } from "../../api/types";
import { T } from "../../theme";
import { emojiForGroup } from "../mobile/groupEmoji";

type DailyCumulativeResponse = components["schemas"]["DailyCumulativeResponse"];
type CategoryGroup = components["schemas"]["CategoryGroup"];
type ExpenseCategory = components["schemas"]["ExpenseCategory"];

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

function formatDateJP(dateStr: string): string {
  const [, m, d] = dateStr.split("-").map(Number);
  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
  const date = new Date(dateStr);
  return `${m}月${d}日（${weekdays[date.getDay()]}）`;
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

interface DonutProps {
  size: number;
  spent_pct: number;
  remaining: number;
  remaining_pct: number;
  days_left: number;
}

function DonutChart({ size, spent_pct, remaining, remaining_pct, days_left }: DonutProps) {
  const r = 96;
  const cx = size / 2;
  const cy = size / 2;
  const circ = 2 * Math.PI * r;
  const spent_arc = (circ * spent_pct) / 100;

  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <linearGradient id="webDonutGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={T.mustard} />
            <stop offset="100%" stopColor={T.coral} />
          </linearGradient>
        </defs>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#FFE8DD" strokeWidth="26" />
        {spent_pct > 0 && (
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke="url(#webDonutGrad)"
            strokeWidth="26"
            strokeDasharray={`${spent_arc} ${circ}`}
            strokeLinecap="round"
            style={{ transform: "rotate(-90deg)", transformOrigin: `${cx}px ${cy}px` }}
          />
        )}
      </svg>
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
              fontSize: 38,
              letterSpacing: "-0.03em",
              color: T.ink,
              lineHeight: 1,
            }}
          >
            {yenSlim(remaining)}
          </span>
          <span
            style={{
              fontFamily: "'Zen Maru Gothic', 'M PLUS Rounded 1c', sans-serif",
              fontWeight: 700,
              fontSize: 17,
              color: T.ink,
            }}
          >
            円
          </span>
        </div>
        <div style={{ fontSize: 12, color: T.inkSoft, marginTop: 6 }}>
          残り <strong style={{ color: T.coralDeep }}>{remaining_pct}%</strong> · あと{days_left}日
        </div>
      </div>
    </div>
  );
}

interface AreaChartProps {
  width: number;
  height: number;
  days: DailyCumulativeResponse["days"];
  monthly_budget: number;
  today_day: number;
  days_in_month: number;
  spent_so_far: number;
}

function AreaChart({
  width,
  height,
  days,
  monthly_budget,
  today_day,
  days_in_month,
  spent_so_far,
}: AreaChartProps) {
  const padL = 56,
    padR = 28,
    padT = 24,
    padB = 40;
  const w = width - padL - padR;
  const h = height - padT - padB;
  const maxY = Math.max(monthly_budget * 1.05, 1);

  const xAt = (d: number) => padL + ((d - 1) / Math.max(days_in_month - 1, 1)) * w;
  const yAt = (v: number) => padT + h - (v / maxY) * h;

  const actual_days = days.filter((d) => d.is_actual);

  const total_pts: [number, number][] = actual_days.map((d, i) => [xAt(i + 1), yAt(d.total)]);
  const food_pts: [number, number][] = actual_days.map((d, i) => [xAt(i + 1), yAt(d.food ?? 0)]);
  const other_pts: [number, number][] = actual_days.map((d, i) => [xAt(i + 1), yAt(d.other ?? 0)]);

  const daily_pace = today_day > 0 ? spent_so_far / today_day : 0;
  const fc_pts: [number, number][] = [];
  for (let d = today_day; d <= days_in_month; d++) {
    fc_pts.push([xAt(d), yAt(Math.min(maxY, d === today_day ? spent_so_far : daily_pace * d))]);
  }

  const total_path = smoothPath(total_pts);
  const total_fill = total_pts.length
    ? `${total_path} L ${total_pts[total_pts.length - 1][0]} ${yAt(0)} L ${total_pts[0][0]} ${yAt(0)} Z`
    : "";
  const food_path = smoothPath(food_pts);
  const other_path = smoothPath(other_pts);
  const fc_path = smoothPath(fc_pts);

  const y_ticks = [0, 20000, 40000, 60000, 80000].filter((t) => t <= maxY * 1.05);
  const x_ticks = [1, 5, 10, 15, 20, 25, days_in_month];

  const today_x = xAt(today_day);
  const today_y = yAt(spent_so_far);

  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      <defs>
        <linearGradient id="webAreaFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={T.coral} stopOpacity="0.32" />
          <stop offset="100%" stopColor={T.coral} stopOpacity="0" />
        </linearGradient>
      </defs>

      {y_ticks.map((t) => (
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
            x={padL - 10}
            y={yAt(t) + 4}
            textAnchor="end"
            fontFamily="DM Sans"
            fontSize="11"
            fill={T.inkSoft}
          >
            {t === 0 ? "0" : `${t / 1000}k`}
          </text>
        </g>
      ))}

      <line
        x1={xAt(1)}
        y1={yAt(0)}
        x2={xAt(days_in_month)}
        y2={yAt(monthly_budget)}
        stroke={T.sage}
        strokeWidth="2"
        strokeDasharray="6 6"
        strokeLinecap="round"
        opacity="0.7"
      />

      {total_fill && <path d={total_fill} fill="url(#webAreaFill)" />}
      {total_path && (
        <path
          d={total_path}
          fill="none"
          stroke={T.coral}
          strokeWidth="3.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}
      {food_path && (
        <path
          d={food_path}
          fill="none"
          stroke={T.mustard}
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}
      {other_path && (
        <path
          d={other_path}
          fill="none"
          stroke={T.sky}
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}
      {fc_path && (
        <path
          d={fc_path}
          fill="none"
          stroke={T.coralDeep}
          strokeWidth="2.5"
          strokeDasharray="2 6"
          strokeLinecap="round"
          opacity="0.65"
        />
      )}

      <line
        x1={today_x}
        y1={padT}
        x2={today_x}
        y2={padT + h}
        stroke={T.ink}
        strokeWidth="1"
        opacity="0.15"
      />
      <circle cx={today_x} cy={today_y} r="7" fill="#fff" stroke={T.coral} strokeWidth="3" />

      {spent_so_far > 0 && (
        <g
          transform={`translate(${Math.min(today_x + 12, width - padR - 120)}, ${Math.max(today_y - 44, padT)})`}
        >
          <rect width="116" height="38" rx="12" fill={T.ink} />
          <text
            x="14"
            y="16"
            fill="#fff"
            fontFamily="M PLUS Rounded 1c"
            fontSize="10"
            opacity="0.6"
          >
            今日
          </text>
          <text x="14" y="30" fill="#fff" fontFamily="DM Sans" fontWeight="700" fontSize="14">
            {yen(spent_so_far)}
          </text>
        </g>
      )}

      {x_ticks.map((d) => (
        <text
          key={d}
          x={xAt(d)}
          y={padT + h + 18}
          textAnchor="middle"
          fontFamily="DM Sans"
          fontSize="11"
          fill={T.inkSoft}
        >
          {d}
        </text>
      ))}
    </svg>
  );
}

interface LegendDotProps {
  color: string;
  label: string;
  dashed?: boolean;
}

function LegendDot({ color, label, dashed }: LegendDotProps) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: T.inkSoft }}>
      {dashed ? (
        <svg width="20" height="6">
          <line
            x1="0"
            y1="3"
            x2="20"
            y2="3"
            stroke={color}
            strokeWidth="2.5"
            strokeDasharray="4 4"
            strokeLinecap="round"
          />
        </svg>
      ) : (
        <span
          style={{
            width: 14,
            height: 14,
            borderRadius: 7,
            background: color,
            display: "inline-block",
          }}
        />
      )}
      <span>{label}</span>
    </div>
  );
}

interface StatPillProps {
  tone: "coral" | "mustard" | "sage";
  label: string;
  value: string;
  sub: string;
}

function StatPill({ tone, label, value, sub }: StatPillProps) {
  const bg = { coral: "#FFE8DD", mustard: "#FFF1CC", sage: "#DEF1E6" }[tone];
  const fg = { coral: T.coralDeep, mustard: "#A3791F", sage: T.sageDeep }[tone];
  return (
    <div style={{ background: bg, borderRadius: 24, padding: "18px 22px", flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 12, color: fg, fontWeight: 700, letterSpacing: "0.04em" }}>
        {label}
      </div>
      <div
        style={{
          fontFamily: "'DM Sans', sans-serif",
          fontWeight: 700,
          fontSize: 26,
          color: T.ink,
          marginTop: 4,
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 12, color: T.inkSoft, marginTop: 2 }}>{sub}</div>
    </div>
  );
}

interface EntryFormProps {
  onSuccess: () => void;
}

function EntryForm({ onSuccess }: EntryFormProps) {
  const [groups, setGroups] = useState<CategoryGroup[]>([]);
  const [all_categories, setAllCategories] = useState<ExpenseCategory[]>([]);
  const [selected_group_id, setSelectedGroupId] = useState("");
  const [selected_category_id, setSelectedCategoryId] = useState("");
  const [transaction_date, setTransactionDate] = useState(todayJST());
  const [amount_str, setAmountStr] = useState("");
  const [item, setItem] = useState("");
  const [is_excluded, setIsExcluded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error_msg, setErrorMsg] = useState("");

  useEffect(() => {
    api.listCategoryGroups().then((res) => {
      setGroups(res.category_groups);
      if (res.category_groups.length > 0) {
        setSelectedGroupId((cur) => cur || String(res.category_groups[0].id));
      }
    });
    api.listExpenseCategories().then((res) => setAllCategories(res.expense_categories));
  }, []);

  const filtered_categories = all_categories.filter(
    (c) => String(c.group_id) === selected_group_id
  );

  useEffect(() => {
    void Promise.resolve().then(() =>
      setSelectedCategoryId((cur) => {
        const still_valid = filtered_categories.some((c) => String(c.id) === cur);
        return still_valid ? cur : "";
      })
    );
  }, [selected_group_id, all_categories]); // eslint-disable-line react-hooks/exhaustive-deps

  const handle_submit = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      setErrorMsg("");
      const parsed_amount = parseInt(amount_str, 10);
      if (!selected_category_id) {
        setErrorMsg("生活区分を選択してください");
        return;
      }
      if (isNaN(parsed_amount) || parsed_amount < 1) {
        setErrorMsg("金額は1以上の整数を入力してください");
        return;
      }
      setSubmitting(true);
      try {
        await api.createJournalEntry({
          transaction_date,
          amount: parsed_amount,
          category_id: parseInt(selected_category_id, 10),
          is_excluded,
          item: item || null,
          note: null,
        });
        setAmountStr("");
        setItem("");
        setIsExcluded(false);
        setTransactionDate(todayJST());
        onSuccess();
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : "エラーが発生しました");
      } finally {
        setSubmitting(false);
      }
    },
    [amount_str, selected_category_id, transaction_date, is_excluded, item, onSuccess]
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        void handle_submit();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handle_submit]);

  const input_base: React.CSSProperties = {
    padding: "12px 14px",
    border: `1.5px solid ${T.hair}`,
    borderRadius: 16,
    background: T.bgSoft,
    fontFamily: "inherit",
    fontSize: 14,
    fontWeight: 500,
    color: T.ink,
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
  };

  return (
    <form
      onSubmit={handle_submit}
      style={{
        background: T.card,
        borderRadius: 32,
        padding: 28,
        boxShadow: "0 8px 24px -16px rgba(80,40,10,0.18)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 18,
        }}
      >
        <div>
          <div
            style={{
              fontFamily: "'Zen Maru Gothic', 'M PLUS Rounded 1c', sans-serif",
              fontSize: 18,
              fontWeight: 700,
            }}
          >
            支出を記録
          </div>
          <div style={{ fontSize: 12, color: T.inkSoft, marginTop: 2 }}>
            サクッと入力してすぐ反映
          </div>
        </div>
        <div style={{ fontSize: 12, color: T.inkSoft }}>⌘ + Enter で保存</div>
      </div>

      <div style={{ display: "flex", gap: 14, marginBottom: 16 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, flex: 0.7 }}>
          <span style={{ fontSize: 12, color: T.inkSoft, fontWeight: 500 }}>日付</span>
          <input
            type="date"
            value={transaction_date}
            onChange={(e) => setTransactionDate(e.target.value)}
            style={{ ...input_base }}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, flex: 0.6 }}>
          <span style={{ fontSize: 12, color: T.inkSoft, fontWeight: 500 }}>金額</span>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "12px 14px",
              border: `1.5px solid ${amount_str ? T.coral : T.hair}`,
              borderRadius: 16,
              background: "#fff",
              transition: "border-color 0.15s",
            }}
          >
            <span
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontWeight: 700,
                fontSize: 20,
                color: T.coralDeep,
              }}
            >
              ¥
            </span>
            <input
              type="number"
              min="1"
              placeholder="0"
              value={amount_str}
              onChange={(e) => setAmountStr(e.target.value)}
              style={{
                border: "none",
                outline: "none",
                background: "transparent",
                fontFamily: "'DM Sans', sans-serif",
                fontWeight: 700,
                fontSize: 20,
                color: T.ink,
                width: "100%",
                padding: 0,
              }}
            />
          </div>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1.4 }}>
          <span style={{ fontSize: 12, color: T.inkSoft, fontWeight: 500 }}>項目名</span>
          <input
            type="text"
            placeholder="例：唐揚げ定食"
            value={item}
            onChange={(e) => setItem(e.target.value)}
            style={{ ...input_base }}
          />
        </label>
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: T.inkSoft, fontWeight: 500, marginBottom: 8 }}>
          大分類
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {groups.map((g) => {
            const active = String(g.id) === selected_group_id;
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => setSelectedGroupId(String(g.id))}
                style={{
                  border: `1.5px solid ${active ? T.coral : T.hair}`,
                  background: active ? T.coral : "#fff",
                  color: active ? "#fff" : T.ink,
                  padding: "10px 16px",
                  borderRadius: 999,
                  fontFamily: "inherit",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  transition: "background 0.15s, color 0.15s",
                }}
              >
                <span style={{ marginRight: 6 }}>{emojiForGroup(g.group_name)}</span>
                {g.group_name}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: T.inkSoft, fontWeight: 500, marginBottom: 8 }}>
          生活区分
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {filtered_categories.map((c) => {
            const active = String(c.id) === selected_category_id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedCategoryId(String(c.id))}
                style={{
                  border: `1.5px solid ${active ? T.mustard : T.hair}`,
                  background: active ? T.mustard : "#fff",
                  color: active ? T.ink : T.ink,
                  padding: "10px 16px",
                  borderRadius: 999,
                  fontFamily: "inherit",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  transition: "background 0.15s",
                }}
              >
                {c.category_name}
              </button>
            );
          })}
        </div>
      </div>

      {error_msg && (
        <div style={{ color: T.coralDeep, fontSize: 13, marginBottom: 12 }}>{error_msg}</div>
      )}

      <div
        style={{
          display: "flex",
          gap: 14,
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: 18,
        }}
      >
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            fontSize: 13,
            color: T.inkSoft,
            cursor: "pointer",
          }}
        >
          <span
            onClick={() => setIsExcluded(!is_excluded)}
            style={{
              width: 36,
              height: 22,
              borderRadius: 999,
              background: is_excluded ? T.coral : T.hair,
              position: "relative",
              display: "inline-block",
              transition: "background 0.2s",
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            <span
              style={{
                position: "absolute",
                left: is_excluded ? 16 : 2,
                top: 2,
                width: 18,
                height: 18,
                borderRadius: 999,
                background: "#fff",
                boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
                transition: "left 0.2s",
              }}
            />
          </span>
          集計から除外する <span style={{ fontSize: 11 }}>（記念日など）</span>
        </label>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button
            type="button"
            onClick={() => {
              setAmountStr("");
              setItem("");
              setIsExcluded(false);
              setTransactionDate(todayJST());
              setSelectedGroupId(groups.length > 0 ? String(groups[0].id) : "");
              setSelectedCategoryId("");
            }}
            style={{
              border: "none",
              background: "transparent",
              color: T.inkSoft,
              fontFamily: "inherit",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            キャンセル
          </button>
          <button
            type="submit"
            disabled={submitting}
            style={{
              border: "none",
              background: T.coral,
              color: "#fff",
              padding: "12px 28px",
              borderRadius: 999,
              fontFamily: "inherit",
              fontWeight: 700,
              fontSize: 15,
              cursor: submitting ? "default" : "pointer",
              boxShadow: `0 6px 0 ${T.coralDeep}`,
              opacity: submitting ? 0.7 : 1,
            }}
          >
            ＋ 記録する
          </button>
        </div>
      </div>
    </form>
  );
}

interface Props {
  refresh_token: number;
  onSuccess: () => void;
}

export function WebHome({ refresh_token, onSuccess }: Props) {
  const [cumulative, setCumulative] = useState<DailyCumulativeResponse | null>(null);
  const ym = currentMonthJST();
  const today = todayJST();
  const today_day = todayDayJST();
  const days_total = daysInMonth(ym);

  useEffect(() => {
    let cancelled = false;
    api
      .getDailyCumulative(ym)
      .then((res) => {
        if (!cancelled) setCumulative(res);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [ym, refresh_token]);

  const monthly_budget = cumulative?.variable_budget ?? 0;
  const last_actual = cumulative?.days
    ? [...cumulative.days].reverse().find((d) => d.is_actual)
    : null;
  const spent_so_far = last_actual?.total ?? 0;
  const remaining = Math.max(0, monthly_budget - spent_so_far);
  const remaining_pct = monthly_budget > 0 ? Math.round((remaining / monthly_budget) * 100) : 0;
  const spent_pct = 100 - remaining_pct;
  const days_left = Math.max(0, days_total - today_day);
  const daily_pace = today_day > 0 ? spent_so_far / today_day : 0;
  const projected_end = Math.round(daily_pace * days_total);
  const daily_left = days_left > 0 ? Math.round(remaining / days_left) : 0;
  const on_track = projected_end <= monthly_budget;
  const budget_pace_so_far = monthly_budget > 0 ? (monthly_budget / days_total) * today_day : 0;
  const margin = budget_pace_so_far - spent_so_far;

  const chart_days = cumulative?.days ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", gap: 24, alignItems: "stretch" }}>
        <div
          style={{
            flex: "0 0 360px",
            background: T.card,
            borderRadius: 28,
            padding: "24px 28px 28px",
            boxShadow: "0 4px 20px -12px rgba(80,40,10,0.14)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <div
            style={{
              width: "100%",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              marginBottom: 2,
            }}
          >
            <div style={{ fontSize: 12, color: T.inkSoft }}>{formatDateJP(today)}</div>
            <div
              style={{
                fontFamily: "'Zen Maru Gothic', 'M PLUS Rounded 1c', sans-serif",
                fontSize: 14,
                fontWeight: 700,
                color: T.inkSoft,
              }}
            >
              おかえりなさい！
            </div>
          </div>
          <div
            style={{
              fontSize: 13,
              color: T.inkSoft,
              fontWeight: 500,
              marginTop: 10,
              marginBottom: 8,
            }}
          >
            今月あといくら使える？
          </div>
          <DonutChart
            size={240}
            spent_pct={spent_pct}
            remaining={remaining}
            remaining_pct={remaining_pct}
            days_left={days_left}
          />
        </div>

        <div
          style={{
            flex: 1,
            background: T.card,
            borderRadius: 32,
            padding: 28,
            boxShadow: "0 8px 24px -16px rgba(80,40,10,0.18)",
            overflow: "hidden",
          }}
        >
          <div
            style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}
          >
            <div>
              <div
                style={{
                  fontFamily: "'Zen Maru Gothic', 'M PLUS Rounded 1c', sans-serif",
                  fontSize: 18,
                  fontWeight: 700,
                }}
              >
                変動費の累積
              </div>
              <div style={{ fontSize: 12, color: T.inkSoft, marginTop: 4 }}>
                このペースなら月末は{" "}
                <strong style={{ color: on_track ? T.sageDeep : T.coralDeep }}>
                  {yen(projected_end)}
                </strong>
                {on_track ? "。いいペース！" : "。少し抑えめに。"}
              </div>
            </div>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
              <LegendDot color={T.coral} label="合計" />
              <LegendDot color={T.mustard} label="食費" />
              <LegendDot color={T.sky} label="その他" />
              <LegendDot color={T.sage} label="基準" dashed />
            </div>
          </div>
          <div style={{ marginTop: 8, overflow: "hidden" }}>
            <AreaChart
              width={720}
              height={300}
              days={chart_days}
              monthly_budget={monthly_budget}
              today_day={today_day}
              days_in_month={days_total}
              spent_so_far={spent_so_far}
            />
          </div>
          {monthly_budget === 0 && (
            <p style={{ color: T.mustard, fontSize: 12, textAlign: "center", marginTop: 8 }}>
              予算を設定してください
            </p>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: 16 }}>
        <StatPill
          tone="coral"
          label="今日まで"
          value={yen(spent_so_far)}
          sub={margin >= 0 ? `基準より ${yen(margin)} 余裕` : `基準より ${yen(-margin)} オーバー`}
        />
        <StatPill
          tone="mustard"
          label="月末予測"
          value={yen(projected_end)}
          sub={on_track ? "予算内におさまりそう" : "あと少し気をつけて"}
        />
        <StatPill
          tone="sage"
          label="1日あたり"
          value={yen(monthly_budget > 0 ? Math.round(monthly_budget / days_total) : 0)}
          sub={`残り ${days_left} 日 × ${yen(daily_left)}`}
        />
      </div>

      <EntryForm onSuccess={onSuccess} />
    </div>
  );
}
