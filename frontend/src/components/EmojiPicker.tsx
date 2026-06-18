import { T } from "../theme";

interface EmojiPickerProps {
  /** Currently selected emoji. */
  value: string;
  /** Called with the chosen emoji when an option is clicked. */
  onSelect: (emoji: string) => void;
  /** Fixed list of emoji to choose from. */
  options: string[];
  /** Border colour for the selected option. */
  accent: string;
  /** Background colour for the selected option. */
  accentSoft: string;
}

/**
 * A small fixed-list emoji picker rendered as a row of selectable chips. Used by
 * the income and recurring-expense forms so a sensible default can be pre-filled
 * and optionally changed by selecting from the list (#107). Matches the inline
 * style + `T` theme tokens used across the v2 screens; no external dependency.
 */
export function EmojiPicker({ value, onSelect, options, accent, accentSoft }: EmojiPickerProps) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {options.map((emoji_option) => {
        const selected = value === emoji_option;
        return (
          <button
            key={emoji_option}
            type="button"
            aria-pressed={selected}
            onClick={() => onSelect(emoji_option)}
            style={{
              width: 38,
              height: 38,
              borderRadius: 11,
              border: `1.5px solid ${selected ? accent : T.hair}`,
              background: selected ? accentSoft : "#fff",
              fontSize: 18,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {emoji_option}
          </button>
        );
      })}
    </div>
  );
}
