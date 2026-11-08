import type React from "react";
import { useSyncStatus } from "../session/sessionHooks";
import { T } from "../theme";
import { LedgerDataContext, useLoadedLedgerData } from "./ledgerData";

// Renders the app once the device knows its ledger. A fresh device (or one that
// just signed out, which deletes the local data) has to sync once before any
// screen has data to show.
export function LedgerDataProvider({ children }: { children: React.ReactNode }) {
  const ledger_data = useLoadedLedgerData();
  const sync_status = useSyncStatus();

  if (!ledger_data) {
    const waiting_message =
      ledger_data === undefined
        ? "読み込み中…"
        : sync_status.phase === "offline"
          ? "はじめての同期にはインターネット接続が必要です。オンラインに戻ると自動で続きます。"
          : sync_status.phase === "error"
            ? `データを取得できませんでした: ${sync_status.last_error ?? "不明なエラー"}`
            : "データを取得しています…";
    return (
      <div
        role="status"
        style={{
          padding: "64px 24px",
          textAlign: "center",
          color: T.inkSoft,
          fontSize: 14,
          lineHeight: 1.7,
        }}
      >
        {waiting_message}
      </div>
    );
  }

  return <LedgerDataContext.Provider value={ledger_data}>{children}</LedgerDataContext.Provider>;
}
