// Sample ledger of the static demo (#142, #201): the rows the demo ledger server
// starts with. Dates are anchored to the month of the first visit so the home
// screen, charts and "today" markers line up with the real calendar.
import { addMonths, daysInMonth } from "../logic";

export const DEMO_USER_ID = 1;
export const DEMO_LEDGER_ID = "01920000-0000-7000-8000-00000000de30";

export interface DemoSeedRow {
  collection: string;
  id: string;
  data: Record<string, unknown>;
}

// Fixed IDs of the master rows the other rows point at.
const FOOD_GROUP_ID = "01920000-0000-7000-8000-de3000000101";
const OTHER_GROUP_ID = "01920000-0000-7000-8000-de3000000102";
const FIXED_GROUP_ID = "01920000-0000-7000-8000-de3000000103";
const SUPERMARKET_CATEGORY_ID = "01920000-0000-7000-8000-de3000000201";
const EATING_OUT_CATEGORY_ID = "01920000-0000-7000-8000-de3000000202";
const CAFE_CATEGORY_ID = "01920000-0000-7000-8000-de3000000203";
const DAILY_GOODS_CATEGORY_ID = "01920000-0000-7000-8000-de3000000204";
const LEISURE_CATEGORY_ID = "01920000-0000-7000-8000-de3000000205";
const RENT_CATEGORY_ID = "01920000-0000-7000-8000-de3000000206";
const TELECOM_CATEGORY_ID = "01920000-0000-7000-8000-de3000000207";
const UTILITY_CATEGORY_ID = "01920000-0000-7000-8000-de3000000208";
const ELECTRICITY_RECURRING_ID = "01920000-0000-7000-8000-de3000000304";
const WATER_RECURRING_ID = "01920000-0000-7000-8000-de3000000305";
const TRAVEL_GOAL_ID = "01920000-0000-7000-8000-de3000000401";
const PC_GOAL_ID = "01920000-0000-7000-8000-de3000000402";

interface DemoSpend {
  item: string;
  category_id: string;
  amount: number;
  note?: string;
}

// One week-ish cycle of everyday spending, repeated through each month.
const DAILY_SPENDING_CYCLE: DemoSpend[][] = [
  [{ item: "スーパー", category_id: SUPERMARKET_CATEGORY_ID, amount: 3280 }],
  [
    { item: "ランチ", category_id: EATING_OUT_CATEGORY_ID, amount: 980 },
    { item: "コンビニ", category_id: SUPERMARKET_CATEGORY_ID, amount: 540 },
  ],
  [
    { item: "カフェ作業", category_id: CAFE_CATEGORY_ID, amount: 620, note: "打ち合わせ" },
    { item: "ドラッグストア", category_id: DAILY_GOODS_CATEGORY_ID, amount: 1860 },
  ],
  [{ item: "スーパー まとめ買い", category_id: SUPERMARKET_CATEGORY_ID, amount: 6280 }],
  [{ item: "居酒屋", category_id: EATING_OUT_CATEGORY_ID, amount: 4600, note: "友人と" }],
  [
    { item: "映画", category_id: LEISURE_CATEGORY_ID, amount: 1900 },
    { item: "ランチ", category_id: EATING_OUT_CATEGORY_ID, amount: 1200 },
  ],
  [
    { item: "スーパー", category_id: SUPERMARKET_CATEGORY_ID, amount: 4120 },
    { item: "本", category_id: LEISURE_CATEGORY_ID, amount: 1650 },
  ],
  [
    { item: "日用品", category_id: DAILY_GOODS_CATEGORY_ID, amount: 980 },
    { item: "ディナー", category_id: EATING_OUT_CATEGORY_ID, amount: 3800 },
  ],
];

// Past months spend more than this one, so the budget history shows one month
// over budget and one under.
const SPENDING_SCALE_BY_MONTH_OFFSET: Record<number, number> = { [-2]: 1.55, [-1]: 1.3, 0: 1 };

const SERVER_CREATED_AT = "2026-01-01T00:00:00Z";

function dateInMonth(year_month: string, day_of_month: number): string {
  const clamped_day = Math.min(day_of_month, daysInMonth(year_month));
  return `${year_month}-${String(clamped_day).padStart(2, "0")}`;
}

export function buildDemoSeedRows(today_jst: string): DemoSeedRow[] {
  const current_month = today_jst.slice(0, 7);
  const today_day = Number(today_jst.slice(8, 10));
  const previous_month = addMonths(current_month, -1);
  const seed_rows: DemoSeedRow[] = [];
  let next_row_number = 1;
  const nextRowId = () =>
    `01920000-0000-7000-8000-de31${String(next_row_number++).padStart(8, "0")}`;
  const addRow = (collection: string, id: string, data: Record<string, unknown>) => {
    seed_rows.push({ collection, id, data: { created_at: SERVER_CREATED_AT, ...data } });
  };

  addRow("ledgers", DEMO_LEDGER_ID, { kind: "personal", name: null });
  addRow("ledger_members", nextRowId(), {
    user_id: DEMO_USER_ID,
    display_name: "デモユーザー",
    role: "owner",
    joined_at: SERVER_CREATED_AT,
    left_at: null,
  });

  const category_groups: [string, string, string][] = [
    [FOOD_GROUP_ID, "食費", "food"],
    [OTHER_GROUP_ID, "日用品・娯楽", "other"],
    [FIXED_GROUP_ID, "固定費", "fixed"],
  ];
  for (const [group_id, group_name, statement_type_code] of category_groups) {
    addRow("category_groups", group_id, {
      name: group_name,
      statement_type_code,
      description: null,
    });
  }
  const expense_categories: [string, string, string][] = [
    [SUPERMARKET_CATEGORY_ID, FOOD_GROUP_ID, "スーパー"],
    [EATING_OUT_CATEGORY_ID, FOOD_GROUP_ID, "外食"],
    [CAFE_CATEGORY_ID, FOOD_GROUP_ID, "カフェ"],
    [DAILY_GOODS_CATEGORY_ID, OTHER_GROUP_ID, "日用品"],
    [LEISURE_CATEGORY_ID, OTHER_GROUP_ID, "娯楽"],
    [RENT_CATEGORY_ID, FIXED_GROUP_ID, "家賃"],
    [TELECOM_CATEGORY_ID, FIXED_GROUP_ID, "通信費"],
    [UTILITY_CATEGORY_ID, FIXED_GROUP_ID, "水道光熱費"],
  ];
  for (const [category_id, group_id, category_name] of expense_categories) {
    addRow("expense_categories", category_id, {
      group_id,
      name: category_name,
      category_code: null,
      description: null,
    });
  }

  addRow("base_incomes", nextRowId(), { member_id: DEMO_USER_ID, amount: 320000 });
  for (const month_offset of [-2, -1, 0]) {
    addRow("income_records", nextRowId(), {
      earner_id: DEMO_USER_ID,
      transaction_date: dateInMonth(addMonths(current_month, month_offset), 25),
      amount: 320000,
      name: "給与",
      income_type: "salary",
      emoji: "🏢",
      note: null,
    });
  }
  addRow("income_records", nextRowId(), {
    earner_id: DEMO_USER_ID,
    transaction_date: dateInMonth(current_month, 15),
    amount: 24000,
    name: "副業（記事執筆）",
    income_type: "side",
    emoji: "✍️",
    note: null,
  });

  const recurring_expenses: [string, string, string, number, number | null, string, string][] = [
    [nextRowId(), "家賃", "🏠", 27, 78000, "fixed", RENT_CATEGORY_ID],
    [nextRowId(), "モバイル回線", "📱", 10, 3480, "fixed", TELECOM_CATEGORY_ID],
    [nextRowId(), "動画サブスク", "🎬", 5, 1500, "fixed", TELECOM_CATEGORY_ID],
    [ELECTRICITY_RECURRING_ID, "電気代", "💡", 18, 8200, "variable", UTILITY_CATEGORY_ID],
    [WATER_RECURRING_ID, "水道代", "🚿", 20, 3500, "variable", UTILITY_CATEGORY_ID],
  ];
  for (const [
    recurring_id,
    name,
    emoji,
    billing_day,
    amount,
    type,
    category_id,
  ] of recurring_expenses) {
    addRow("recurring_expenses", recurring_id, {
      wallet: "ledger",
      name,
      emoji,
      billing_day,
      amount,
      type,
      category_id,
    });
  }

  addRow("savings_goals", TRAVEL_GOAL_ID, {
    name: "北海道旅行",
    emoji: "✈️",
    monthly_amount: 25000,
    target_amount: 250000,
    deadline: `${Number(current_month.slice(0, 4)) + 1}/03`,
    memo: "新幹線とホテル代",
  });
  addRow("savings_goals", PC_GOAL_ID, {
    name: "新しいPC",
    emoji: "💻",
    monthly_amount: 20000,
    target_amount: 240000,
    deadline: null,
    memo: "開発用に買い替え",
  });
  // The travel goal is posted through this month; the PC goal still waits for it.
  for (const month_offset of [-6, -5, -4, -3, -2, -1, 0]) {
    addRow("savings_postings", nextRowId(), {
      goal_id: TRAVEL_GOAL_ID,
      year_month: addMonths(current_month, month_offset),
      amount: 25000,
      kind: "auto",
    });
  }
  for (const month_offset of [-4, -3, -2, -1]) {
    addRow("savings_postings", nextRowId(), {
      goal_id: PC_GOAL_ID,
      year_month: addMonths(current_month, month_offset),
      amount: 20000,
      kind: "auto",
    });
  }
  addRow("surplus_allocations", nextRowId(), {
    year_month: previous_month,
    amount: 24000,
    destination: "savings",
    savings_goal_id: TRAVEL_GOAL_ID,
  });

  const addJournalEntry = (entry_values: Record<string, unknown>) =>
    addRow("journal_entries", nextRowId(), {
      wallet: "ledger",
      is_excluded: false,
      note: null,
      recurring_expense_id: null,
      recurring_year_month: null,
      ...entry_values,
    });
  for (const month_offset of [-2, -1, 0]) {
    const entry_month = addMonths(current_month, month_offset);
    const last_day = month_offset === 0 ? today_day : daysInMonth(entry_month);
    const spending_scale = SPENDING_SCALE_BY_MONTH_OFFSET[month_offset];
    for (let day_of_month = 1; day_of_month <= last_day; day_of_month++) {
      for (const demo_spend of DAILY_SPENDING_CYCLE[day_of_month % DAILY_SPENDING_CYCLE.length]) {
        addJournalEntry({
          transaction_date: dateInMonth(entry_month, day_of_month),
          item: demo_spend.item,
          amount: Math.round((demo_spend.amount * spending_scale) / 10) * 10,
          category_id: demo_spend.category_id,
          note: demo_spend.note ?? null,
        });
      }
    }
  }
  // Last month's variable bills were posted; this month's are still pending.
  for (const [recurring_id, item, billing_day, amount] of [
    [ELECTRICITY_RECURRING_ID, "電気代", 18, 8200],
    [WATER_RECURRING_ID, "水道代", 20, 3500],
  ] as const) {
    addJournalEntry({
      transaction_date: dateInMonth(previous_month, billing_day),
      item,
      amount,
      category_id: UTILITY_CATEGORY_ID,
      recurring_expense_id: recurring_id,
      recurring_year_month: previous_month,
    });
  }

  const noted_days = [Math.max(today_day - 3, 1), Math.max(today_day - 8, 1)];
  addRow("daily_notes", nextRowId(), {
    date: dateInMonth(current_month, noted_days[0]),
    note: "映画デー🎬 出費多め",
  });
  if (noted_days[1] !== noted_days[0]) {
    addRow("daily_notes", nextRowId(), {
      date: dateInMonth(current_month, noted_days[1]),
      note: "飲み会あり",
    });
  }
  addRow("monthly_review_notes", nextRowId(), {
    year_month: current_month,
    category_id: SUPERMARKET_CATEGORY_ID,
    note: "週末のまとめ買いで単価は抑えられた。",
  });
  addRow("monthly_review_notes", nextRowId(), {
    year_month: current_month,
    category_id: EATING_OUT_CATEGORY_ID,
    note: "外食が少し多め。来月は週1に。",
  });

  return seed_rows;
}
