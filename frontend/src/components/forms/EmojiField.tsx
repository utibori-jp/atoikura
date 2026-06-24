import { T } from "../../theme";
import { EmojiPicker } from "../EmojiPicker";
import { inputStyle, labelStyle } from "./formStyles";

interface EmojiFieldProps {
  value: string;
  onChange: (emoji: string) => void;
  /** Quick-pick emoji options shown below the input. */
  options: string[];
  label?: string;
  placeholder?: string;
  accent?: string;
  accentSoft?: string;
}

/** A labelled emoji text input paired with a quick {@link EmojiPicker}. */
export function EmojiField({
  value,
  onChange,
  options,
  label = "絵文字",
  placeholder,
  accent = T.coral,
  accentSoft = T.coralSoft,
}: EmojiFieldProps) {
  return (
    <div>
      <div style={labelStyle}>{label}</div>
      <input
        type="text"
        aria-label={label}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        style={{ ...inputStyle, textAlign: "center", fontSize: 20 }}
      />
      <div style={{ marginTop: 8 }}>
        <EmojiPicker
          value={value}
          onSelect={onChange}
          options={options}
          accent={accent}
          accentSoft={accentSoft}
        />
      </div>
    </div>
  );
}
