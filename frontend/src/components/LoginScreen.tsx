import { useState, type FormEvent } from "react";
import { api, AuthError, credentials_store } from "../api/client";
import { T, btnPrimary } from "../theme";
import type { components } from "../api/types";

type UserProfile = components["schemas"]["UserResponse"];

interface LoginScreenProps {
  onSuccess: (user: UserProfile) => void;
}

export function LoginScreen({ onSuccess }: LoginScreenProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error_message, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email || !password) {
      setErrorMessage("メールアドレスとパスワードを入力してください");
      return;
    }
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const user = await api.login(email, password);
      credentials_store.save(email, password);
      onSuccess(user);
    } catch (err) {
      if (err instanceof AuthError) {
        setErrorMessage("メールアドレスまたはパスワードが正しくありません");
      } else {
        setErrorMessage(
          err instanceof Error ? err.message : "ログインに失敗しました",
        );
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
        minHeight: "100vh",
        background: T.bg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 400,
          background: T.card,
          borderRadius: 28,
          padding: "36px 32px",
          boxShadow: T.cardShadow,
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 18,
              background: T.coral,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: `0 4px 0 ${T.coralDeep}`,
              marginBottom: 14,
            }}
          >
            <svg width="32" height="32" viewBox="0 0 26 26" fill="none">
              <circle
                cx="13"
                cy="13"
                r="9"
                fill={T.mustard}
                stroke="#fff"
                strokeWidth="2"
              />
              <circle cx="10" cy="11" r="1.4" fill={T.coralDeep} />
              <circle cx="16" cy="11" r="1.4" fill={T.coralDeep} />
              <path
                d="M10 15.5 Q13 18 16 15.5"
                stroke={T.coralDeep}
                strokeWidth="1.6"
                strokeLinecap="round"
                fill="none"
              />
            </svg>
          </div>
          <h1
            style={{
              fontFamily:
                "'Zen Maru Gothic', 'M PLUS Rounded 1c', sans-serif",
              fontWeight: 900,
              fontSize: 26,
              letterSpacing: "-0.01em",
              color: T.ink,
              margin: 0,
            }}
          >
            Atoikura
          </h1>
          <p
            style={{
              color: T.inkSoft,
              fontSize: 13,
              marginTop: 6,
              marginBottom: 0,
            }}
          >
            ログインしてください
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={label_style} htmlFor="login-email">
              メールアドレス
            </label>
            <input
              id="login-email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={input_style}
              required
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={label_style} htmlFor="login-password">
              パスワード
            </label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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

          <button
            type="submit"
            disabled={submitting}
            style={{
              ...btnPrimary,
              width: "100%",
              padding: "14px 24px",
              fontSize: 15,
              opacity: submitting ? 0.6 : 1,
              cursor: submitting ? "default" : "pointer",
            }}
          >
            {submitting ? "ログイン中…" : "ログイン"}
          </button>
        </form>
      </div>
    </div>
  );
}
