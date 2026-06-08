const EMOJI_BY_NAME: Record<string, string> = {
  "食費": "🍙",
  "日用品": "🧺",
  "趣味・娯楽": "🎈",
  "交際": "🍻",
  "交通": "🚃",
  "交通・車両費": "🚃",
  "美容・健康": "🌿",
  "医療・健康": "🌿",
  "自己投資": "📚",
  "固定費": "🏠",
  "経費精算": "🧾",
  "特別費": "🎁",
};

const EMOJI_BY_TYPE: Record<string, string> = {
  food: "🍙",
  other: "🎈",
  fixed: "🏠",
  excluded: "🧾",
};

export function emojiForGroup(group_name: string, type_code?: string): string {
  return EMOJI_BY_NAME[group_name] ?? (type_code ? EMOJI_BY_TYPE[type_code] : undefined) ?? "📌";
}
