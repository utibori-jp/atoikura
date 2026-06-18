import type React from "react";
import { T } from "../theme";

// Default box styling, matching the global `input[type="date"]` rules in
// index.css. Used to align the formatted overlay with inputs that rely on the
// global stylesheet (i.e. call sites that pass no `style`).
const CANONICAL_BOX: React.CSSProperties = {
  width: "100%",
  background: T.bgSoft,
  border: `1.5px solid ${T.hair}`,
  borderRadius: 12,
  padding: "10px 14px",
  fontSize: 14,
  fontFamily: "inherit",
  boxSizing: "border-box",
};

/** Convert ISO `YYYY-MM-DD` to display `YYYY/MM/DD` (pass other values through). */
function toDisplay(iso: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.replaceAll("-", "/") : iso;
}

interface DateFieldProps {
  /** ISO `YYYY-MM-DD` value (may be empty). */
  value: string;
  /** Called with the ISO `YYYY-MM-DD` string on change. */
  onChange: (iso: string) => void;
  required?: boolean;
  ariaLabel?: string;
  /** Style applied to the native input (matched onto the formatted overlay). */
  style?: React.CSSProperties;
  /** Style applied to the positioning wrapper. */
  wrapperStyle?: React.CSSProperties;
}

/**
 * A date field that always displays `YYYY/MM/DD` regardless of the browser's
 * locale (#109). It keeps the native `<input type="date">` — so the calendar
 * picker and ISO value are preserved for submission — but hides the control's
 * locale-formatted text (`color: transparent`) and renders a `YYYY/MM/DD`
 * overlay on top. The overlay reuses the input's box styling so it lines up
 * with where the native text would sit.
 */
export function DateField({
  value,
  onChange,
  required,
  ariaLabel,
  style,
  wrapperStyle,
}: DateFieldProps) {
  const overlay_box = style ?? CANONICAL_BOX;
  return (
    <div style={{ position: "relative", width: "100%", ...wrapperStyle }}>
      <input
        type="date"
        aria-label={ariaLabel}
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        style={style ? { ...style, color: "transparent" } : { color: "transparent" }}
      />
      <span
        aria-hidden
        style={{
          ...overlay_box,
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          pointerEvents: "none",
          background: "transparent",
          borderColor: "transparent",
          color: value ? T.ink : T.inkSoft,
        }}
      >
        {value ? toDisplay(value) : "YYYY/MM/DD"}
      </span>
    </div>
  );
}
