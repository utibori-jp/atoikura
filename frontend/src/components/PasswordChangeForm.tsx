import { useState, type FormEvent } from "react";
import { api, AuthError } from "../api/client";
import { T, btnPrimary, btnGhost } from "../theme";

export function PasswordChangeForm() {
  const [open, setOpen] = useState(false);
  const [current_password, setCurrentPassword] = useState("");
  const [new_password, setNewPassword] = useState("");
  const [confirm_password, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error_message, setErrorMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function reset() {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setErrorMessage(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSuccess(false);
    if (new_password.length < 8) {
      setErrorMessage("新しいパスワードは8文字以上で入力してください");
      return;
    }
    if (new_password !== confirm_password) {
      setErrorMessage("新しいパスワードが一致しません");
      return;
    }
    setSubmitting(true);
    setErrorMessage(null);
    try {
      await api.changePassword({
        current_password,
        new_password,
      });
      reset();
      setOpen(false);
      setSuccess(true);
    } catch (err) {
      if (err instanceof AuthError) {
        setErrorMessage("認証に失敗しました。再ログインしてください");
      } else {
        setErrorMessage(err instanceof Error ? err.message : "パスワードの変更に失敗しました");
      }
    } finally {
      setSubmitting(false);
    }
  }

  const input_style: React.CSSProperties = {
    width: "100%",
    padding: "12px 16px",
    borderRadius: 16,
    border: `1.5px solid ${T.hair}`,
    background: T.bgSoft,
    fontSize: 15,
    fontFamily: "inherit",
    color: T.ink,
    outline: "none",
    boxSizing: "border-box",
  };
  const label_style: React.CSSProperties = {
    display: "block",
    fontSize: 13,
    fontWeight: 600,
    color: T.inkSoft,
    marginBottom: 6,
  };

  return (
    <div
      style={{
        background: T.card,
        borderRadius: 28,
        padding: 32,
        boxShadow: T.cardShadow,
        marginTop: 20,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <h2
          style={{
            fontFamily: "'Zen Maru Gothic', 'M PLUS Rounded 1c', sans-serif",
            fontWeight: 800,
            fontSize: 18,
            color: T.ink,
            margin: 0,
          }}
        >
          パスワード変更
        </h2>
        {!open && (
          <button
            type="button"
            onClick={() => {
              setOpen(true);
              setSuccess(false);
            }}
            style={btnGhost}
          >
            変更する
          </button>
        )}
      </div>

      {success && (
        <div
          role="status"
          style={{
            background: "#E6F5EE",
            color: T.sageDeep,
            padding: "10px 14px",
            borderRadius: 14,
            fontSize: 13,
            marginTop: 16,
          }}
        >
          パスワードを変更しました
        </div>
      )}

      {open && (
        <form onSubmit={handleSubmit} style={{ marginTop: 20 }}>
          <div style={{ marginBottom: 16 }}>
            <label style={label_style} htmlFor="current-password">
              現在のパスワード
            </label>
            <input
              id="current-password"
              type="password"
              autoComplete="current-password"
              value={current_password}
              onChange={(e) => setCurrentPassword(e.target.value)}
              style={input_style}
              required
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={label_style} htmlFor="new-password">
              新しいパスワード（8文字以上）
            </label>
            <input
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={new_password}
              onChange={(e) => setNewPassword(e.target.value)}
              style={input_style}
              required
            />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={label_style} htmlFor="confirm-password">
              新しいパスワード（確認）
            </label>
            <input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirm_password}
              onChange={(e) => setConfirmPassword(e.target.value)}
              style={input_style}
              required
            />
          </div>

          {error_message && (
            <div
              role="alert"
              style={{
                background: "#FFE9E0",
                color: T.coralDeep,
                padding: "10px 14px",
                borderRadius: 14,
                fontSize: 13,
                marginBottom: 16,
              }}
            >
              {error_message}
            </div>
          )}

          <div style={{ display: "flex", gap: 10 }}>
            <button
              type="submit"
              disabled={submitting}
              style={{
                ...btnPrimary,
                flex: 1,
                padding: "12px 24px",
                opacity: submitting ? 0.6 : 1,
                cursor: submitting ? "default" : "pointer",
              }}
            >
              {submitting ? "変更中…" : "変更を保存"}
            </button>
            <button
              type="button"
              onClick={() => {
                reset();
                setOpen(false);
              }}
              style={btnGhost}
            >
              キャンセル
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
