import { T } from "../../theme";

interface FormActionsProps {
  onSubmit: () => void;
  onCancel: () => void;
  submitting?: boolean;
  submitLabel?: string;
  submittingLabel?: string;
  cancelLabel?: string;
}

/** Save / cancel button pair shared by the entity forms. */
export function FormActions({
  onSubmit,
  onCancel,
  submitting = false,
  submitLabel = "保存",
  submittingLabel = "保存中…",
  cancelLabel = "キャンセル",
}: FormActionsProps) {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <button
        type="button"
        onClick={onSubmit}
        disabled={submitting}
        style={{
          border: "none",
          background: T.coral,
          color: "#fff",
          padding: "9px 20px",
          borderRadius: 999,
          fontFamily: "inherit",
          fontWeight: 700,
          cursor: submitting ? "default" : "pointer",
          boxShadow: `0 3px 0 ${T.coralDeep}`,
        }}
      >
        {submitting ? submittingLabel : submitLabel}
      </button>
      <button
        type="button"
        onClick={onCancel}
        style={{
          border: `1px solid ${T.hair}`,
          background: "#fff",
          color: T.inkSoft,
          padding: "9px 20px",
          borderRadius: 999,
          fontFamily: "inherit",
          cursor: "pointer",
        }}
      >
        {cancelLabel}
      </button>
    </div>
  );
}
