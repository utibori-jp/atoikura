import { useEffect } from "react";
import type React from "react";
import { T } from "../theme";

interface ModalProps {
  /** Heading shown at the top of the dialog. */
  title: string;
  /** Called on backdrop click, Esc, or the close button. */
  onClose: () => void;
  /** Render the bottom-sheet variant (mobile) instead of the centered card. */
  is_mobile?: boolean;
  /** Max width of the centered card on web (ignored in the mobile sheet). */
  maxWidth?: number;
  children: React.ReactNode;
}

/**
 * A reusable dialog. On web it is a width-constrained, centered card; on mobile
 * (`is_mobile`) it is a bottom sheet. It closes on backdrop click, `Esc`, and an
 * explicit close button, and caps its height with an internal scroll so tall
 * content never fills the whole screen (#133). Content sizes the dialog; it does
 * not stretch to fill available space.
 */
export function Modal({ title, onClose, is_mobile = false, maxWidth = 440, children }: ModalProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const card_style: React.CSSProperties = is_mobile
    ? {
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        background: T.card,
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
        padding: "12px 20px",
        paddingBottom: "max(env(safe-area-inset-bottom, 0px), 28px)",
        boxShadow: "0 -20px 50px -20px rgba(0,0,0,0.3)",
        maxHeight: "90dvh",
        overflowY: "auto",
      }
    : {
        width: "100%",
        maxWidth,
        background: T.card,
        borderRadius: 28,
        padding: 24,
        boxShadow: T.cardShadow,
        maxHeight: "90dvh",
        overflowY: "auto",
      };

  return (
    <div
      data-testid="modal-backdrop"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: "rgba(42,37,32,0.45)",
        display: "flex",
        alignItems: is_mobile ? "flex-end" : "center",
        justifyContent: "center",
        padding: is_mobile ? 0 : 24,
        boxSizing: "border-box",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        style={card_style}
      >
        {is_mobile && (
          <div
            aria-hidden
            style={{
              width: 42,
              height: 5,
              borderRadius: 999,
              background: T.hair,
              margin: "0 auto 14px",
            }}
          />
        )}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 16,
          }}
        >
          <span
            style={{
              fontFamily: "'Zen Maru Gothic', 'M PLUS Rounded 1c', sans-serif",
              fontSize: 19,
              fontWeight: 900,
              color: T.ink,
            }}
          >
            {title}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            style={{
              width: 30,
              height: 30,
              minWidth: 44,
              minHeight: 44,
              borderRadius: 999,
              background: T.bgSoft,
              border: "none",
              cursor: "pointer",
              color: T.inkSoft,
              fontSize: 15,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
