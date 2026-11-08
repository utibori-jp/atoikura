import { createContext, useContext } from "react";
import type React from "react";

/**
 * Context + hooks for the app-wide confirm / alert dialogs rendered through the
 * in-app Modal instead of the browser-native `window.confirm` / `alert` (#166).
 * The provider that supplies this context lives in {@link ./dialogs}.
 */

export interface ConfirmOptions {
  /** Heading shown at the top of the dialog. */
  title: string;
  /** Optional body copy explaining the consequence of confirming. */
  message?: React.ReactNode;
  /** Label for the confirm button (default "OK"). */
  confirmLabel?: string;
  /** Label for the cancel button (default "キャンセル"). */
  cancelLabel?: string;
  /** Style the confirm button as destructive (red) — e.g. deletions. */
  danger?: boolean;
}

export interface AlertOptions {
  /** Heading shown at the top of the dialog (default "エラー"). */
  title?: string;
}

export interface DialogApi {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  alert: (message: React.ReactNode, options?: AlertOptions) => Promise<void>;
}

export const DialogContext = createContext<DialogApi | null>(null);

function useDialog(): DialogApi {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error("useConfirm/useAlert must be used within a <DialogProvider>");
  return ctx;
}

/** Returns an async `confirm({...})` — an in-app replacement for `window.confirm`. */
export function useConfirm(): DialogApi["confirm"] {
  return useDialog().confirm;
}

/** Returns an async `alert(message)` — an in-app replacement for `window.alert`. */
export function useAlert(): DialogApi["alert"] {
  return useDialog().alert;
}
