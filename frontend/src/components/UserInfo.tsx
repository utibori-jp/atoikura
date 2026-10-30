import { useState } from "react";
import { T, btnGhost, btnPrimary } from "../theme";
import type { components } from "../api/types";
import type { LogoutResult } from "../session/sessionController";
import { Modal } from "./Modal";
import { PasswordChangeForm } from "./PasswordChangeForm";

type UserProfile = components["schemas"]["UserResponse"];

interface UserInfoProps {
  user: UserProfile;
  // Resolves "pending_changes" when unsent changes stopped the sign-out.
  onLogout: (options?: { discard_pending_changes?: boolean }) => Promise<LogoutResult>;
}

function formatLastLogin(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function UserInfo({ user, onLogout }: UserInfoProps) {
  const display_name = user.display_name?.trim() || user.email;
  const initial = display_name.slice(0, 1).toUpperCase();
  const [logging_out, setLoggingOut] = useState(false);
  // Unsent changes that would be lost; the confirmation is open while set.
  const [unsent_change_count, setUnsentChangeCount] = useState<number | null>(null);

  async function requestLogout(discard_pending_changes: boolean) {
    setLoggingOut(true);
    try {
      const logout_result = await onLogout({ discard_pending_changes });
      if (logout_result.outcome === "pending_changes") {
        setUnsentChangeCount(logout_result.pending_count);
      }
    } finally {
      setLoggingOut(false);
    }
  }

  const row_style: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "16px 0",
    borderBottom: `1px solid ${T.hair}`,
  };
  const label_style: React.CSSProperties = {
    fontSize: 13,
    color: T.inkSoft,
    fontWeight: 600,
  };
  const value_style: React.CSSProperties = {
    fontSize: 15,
    color: T.ink,
    fontWeight: 500,
    textAlign: "right",
  };

  return (
    <div style={{ maxWidth: 520, margin: "0 auto" }}>
      <div
        style={{
          background: T.card,
          borderRadius: 28,
          padding: 32,
          boxShadow: T.cardShadow,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            marginBottom: 24,
          }}
        >
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 20,
              background: T.coral,
              boxShadow: `0 4px 0 ${T.coralDeep}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontWeight: 800,
              fontSize: 26,
              fontFamily: "'Zen Maru Gothic', 'M PLUS Rounded 1c', sans-serif",
            }}
          >
            {initial}
          </div>
          <div>
            <div
              style={{
                fontFamily: "'Zen Maru Gothic', 'M PLUS Rounded 1c', sans-serif",
                fontWeight: 800,
                fontSize: 22,
                color: T.ink,
              }}
            >
              {display_name}
            </div>
            <div style={{ fontSize: 13, color: T.inkSoft, marginTop: 2 }}>{user.email}</div>
          </div>
        </div>

        <div>
          <div style={row_style}>
            <span style={label_style}>ユーザーID</span>
            <span style={value_style}>{user.id}</span>
          </div>
          <div style={row_style}>
            <span style={label_style}>メールアドレス</span>
            <span style={value_style}>{user.email}</span>
          </div>
          <div style={row_style}>
            <span style={label_style}>表示名</span>
            <span style={value_style}>{user.display_name ?? "（未設定）"}</span>
          </div>
          <div style={{ ...row_style, borderBottom: "none" }}>
            <span style={label_style}>最終ログイン</span>
            <span style={value_style}>{formatLastLogin(user.last_login_at)}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void requestLogout(false)}
          disabled={logging_out}
          style={{
            ...btnPrimary,
            width: "100%",
            marginTop: 24,
            padding: "14px 24px",
            opacity: logging_out ? 0.6 : 1,
          }}
        >
          {logging_out ? "ログアウト中…" : "ログアウト"}
        </button>
      </div>

      <PasswordChangeForm />

      {unsent_change_count !== null && (
        <Modal title="未送信の変更があります" onClose={() => setUnsentChangeCount(null)}>
          <p style={{ fontSize: 14, color: T.ink, lineHeight: 1.7, margin: 0 }}>
            サーバーに送信できていない変更が{unsent_change_count}
            件あります。ログアウトするとこの端末のデータは削除され、これらの変更は失われます。
          </p>
          <p style={{ fontSize: 13, color: T.inkSoft, lineHeight: 1.7, margin: "8px 0 0" }}>
            オンラインに戻ってから再度ログアウトすると、送信してから削除します。
          </p>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
            <button
              type="button"
              onClick={() => setUnsentChangeCount(null)}
              disabled={logging_out}
              style={btnGhost}
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={() => void requestLogout(true)}
              disabled={logging_out}
              style={btnPrimary}
            >
              変更を破棄してログアウト
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
