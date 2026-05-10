export const T = {
  bg: "#FFF4E8",
  bgSoft: "#FFFAF2",
  card: "#FFFFFF",
  ink: "#2A2520",
  inkSoft: "#7A6B5E",
  hair: "#F2E4D2",
  coral: "#FF8A5C",
  coralDeep: "#F26B3F",
  mustard: "#FFC247",
  sage: "#7BC4A4",
  sageDeep: "#4FA481",
  sky: "#A6C9E2",
  excluded: "#C9B7A1",
  cardShadow: "0 8px 24px -16px rgba(80,40,10,0.18)",
} as const;

export const card: React.CSSProperties = {
  background: T.card,
  borderRadius: 28,
  padding: 24,
  boxShadow: T.cardShadow,
};

export const btnPrimary: React.CSSProperties = {
  border: "none",
  background: T.coral,
  color: "#fff",
  padding: "11px 24px",
  borderRadius: 999,
  fontFamily: "inherit",
  fontWeight: 700,
  fontSize: 14,
  cursor: "pointer",
  boxShadow: `0 4px 0 ${T.coralDeep}`,
};

export const btnGhost: React.CSSProperties = {
  background: "transparent",
  border: `1.5px solid ${T.hair}`,
  borderRadius: 999,
  color: T.inkSoft,
  padding: "9px 18px",
  fontSize: 13,
  cursor: "pointer",
};
