import { useCallback, useState } from "react";
import type React from "react";
import { Modal } from "./Modal";
import { DialogContext, type ConfirmOptions, type AlertOptions } from "./dialogContext";
import { T } from "../theme";

/**
 * One {@link DialogProvider} lives at the app root and renders a single in-app
 * confirm / alert {@link Modal} at a time, queueing any overlapping requests.
 * Consume it via `useConfirm` / `useAlert` from {@link ./dialogContext}.
 */

interface DialogRequest {
  kind: "confirm" | "alert";
  title: string;
  message?: React.ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  danger: boolean;
  resolve: (confirmed: boolean) => void;
}

export function DialogProvider({
  is_mobile = false,
  children,
}: {
  is_mobile?: boolean;
  children: React.ReactNode;
}) {
  // FIFO queue; only the head is rendered. Overlapping requests wait their turn.
  const [queue, setQueue] = useState<DialogRequest[]>([]);
  const current = queue[0] ?? null;

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setQueue((pending) => [
          ...pending,
          {
            kind: "confirm",
            title: options.title,
            message: options.message,
            confirmLabel: options.confirmLabel ?? "OK",
            cancelLabel: options.cancelLabel ?? "キャンセル",
            danger: options.danger ?? false,
            resolve,
          },
        ]);
      }),
    []
  );

  const alert = useCallback(
    (message: React.ReactNode, options?: AlertOptions) =>
      new Promise<void>((resolve) => {
        setQueue((pending) => [
          ...pending,
          {
            kind: "alert",
            title: options?.title ?? "エラー",
            message,
            confirmLabel: "OK",
            cancelLabel: "",
            danger: false,
            resolve: () => resolve(),
          },
        ]);
      }),
    []
  );

  const settle = useCallback((confirmed: boolean) => {
    setQueue((pending) => {
      const [head, ...rest] = pending;
      head?.resolve(confirmed);
      return rest;
    });
  }, []);

  return (
    <DialogContext.Provider value={{ confirm, alert }}>
      {children}
      {current && (
        // Backdrop / Esc / close button dismiss without confirming.
        <Modal
          title={current.title}
          onClose={() => settle(false)}
          is_mobile={is_mobile}
          maxWidth={400}
        >
          {current.message && (
            <p
              style={{
                margin: "0 0 20px",
                fontSize: 14,
                lineHeight: 1.6,
                color: T.inkSoft,
                whiteSpace: "pre-wrap",
              }}
            >
              {current.message}
            </p>
          )}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            {current.kind === "confirm" && (
              <button
                type="button"
                onClick={() => settle(false)}
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
                {current.cancelLabel}
              </button>
            )}
            <button
              type="button"
              onClick={() => settle(true)}
              style={{
                border: "none",
                background: current.danger ? T.danger : T.coral,
                color: "#fff",
                padding: "9px 20px",
                borderRadius: 999,
                fontFamily: "inherit",
                fontWeight: 700,
                cursor: "pointer",
                boxShadow: `0 3px 0 ${current.danger ? T.dangerDeep : T.coralDeep}`,
              }}
            >
              {current.confirmLabel}
            </button>
          </div>
        </Modal>
      )}
    </DialogContext.Provider>
  );
}
