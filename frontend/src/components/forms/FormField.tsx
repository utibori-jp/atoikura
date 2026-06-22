import type React from "react";
import { inputStyle, labelStyle } from "./formStyles";

interface FormFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "number";
  placeholder?: string;
  min?: number;
  max?: number;
  /** Extra styles merged onto the input (e.g. centered emoji input). */
  style?: React.CSSProperties;
}

/** A labelled text/number input. The label doubles as the input's aria-label. */
export function FormField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  min,
  max,
  style,
}: FormFieldProps) {
  return (
    <div>
      <div style={labelStyle}>{label}</div>
      <input
        type={type}
        aria-label={label}
        value={value}
        placeholder={placeholder}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value)}
        style={{ ...inputStyle, ...style }}
      />
    </div>
  );
}
