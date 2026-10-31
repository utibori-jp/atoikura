import { addMonths, todayInJst } from "../logic";
import { T } from "../theme";

interface MonthSwitcherProps {
  year_month: string;
  onYearMonthChange: (year_month: string) => void;
  is_mobile?: boolean;
}

function formatMonthJP(year_month: string): string {
  const [year, month] = year_month.split("-").map(Number);
  return `${year}年${month}月`;
}

// The month shown on the journal screen, with buttons to the previous and next
// month. Months after the current one have no entries to show.
export function MonthSwitcher({
  year_month,
  onYearMonthChange,
  is_mobile = false,
}: MonthSwitcherProps) {
  const is_current_month = year_month >= todayInJst().slice(0, 7);
  const button_size = is_mobile ? 44 : 32;
  const arrowButtonStyle = (is_disabled: boolean) => ({
    width: button_size,
    height: button_size,
    borderRadius: 999,
    border: `1.5px solid ${T.hair}`,
    background: T.card,
    color: is_disabled ? T.hair : T.inkSoft,
    fontSize: is_mobile ? 16 : 13,
    cursor: is_disabled ? "default" : "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  });

  return (
    <div style={{ display: "flex", alignItems: "center", gap: is_mobile ? 8 : 6 }}>
      <button
        aria-label="前の月"
        onClick={() => onYearMonthChange(addMonths(year_month, -1))}
        style={arrowButtonStyle(false)}
      >
        ‹
      </button>
      <span
        style={{
          padding: is_mobile ? "10px 20px" : "6px 16px",
          borderRadius: 999,
          border: `1.5px solid ${T.hair}`,
          background: T.card,
          fontSize: is_mobile ? 14 : 13,
          fontWeight: 600,
          color: T.ink,
          whiteSpace: "nowrap",
        }}
      >
        {formatMonthJP(year_month)}
      </span>
      <button
        aria-label="次の月"
        onClick={() => onYearMonthChange(addMonths(year_month, 1))}
        disabled={is_current_month}
        style={arrowButtonStyle(is_current_month)}
      >
        ›
      </button>
    </div>
  );
}
