import { useState, type FormEvent } from "react";
import { api, AuthError, token_store } from "../api/client";
import { T, btnPrimary } from "../theme";
import type { components } from "../api/types";

type UserProfile = components["schemas"]["UserResponse"];
type Mode = "login" | "signup";

interface LoginScreenProps {
  onSuccess: (user: UserProfile) => void;
}

export function LoginScreen({ onSuccess }: LoginScreenProps) {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [display_name, setDisplayName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error_message, setErrorMessage] = useState<string | null>(null);

  function switchMode(next: Mode) {
    setMode(next);
    setErrorMessage(null);
    setPassword("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email || !password) {
      setErrorMessage("メールアドレスとパスワードを入力してください");
      return;
    }
    if (mode === "signup" && password.length < 8) {
      setErrorMessage("パスワードは8文字以上で入力してください");
      return;
    }
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const result =
        mode === "login"
          ? await api.login(email, password)
          : await api.signup({
              email,
              password,
              display_name: display_name.trim() || null,
            });
      token_store.save(result.token);
      const { token: _token, ...user } = result;
      onSuccess(user);
    } catch (err) {
      if (mode === "login" && err instanceof AuthError) {
        setErrorMessage("メールアドレスまたはパスワードが正しくありません");
      } else {
        setErrorMessage(
          err instanceof Error
            ? err.message
            : mode === "login"
              ? "ログインに失敗しました"
              : "登録に失敗しました",
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

  const is_signup = mode === "signup";

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
        <div style={{ textAlign: "center", marginBottom: 24 }}>
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
            {is_signup ? "アカウントを作成" : "ログインしてください"}
          </p>
        </div>

        {/* Mode toggle */}
        <div
          style={{
            display: "flex",
            gap: 4,
            background: T.bgSoft,
            borderRadius: 999,
            padding: 4,
            marginBottom: 24,
          }}
        >
          {(["login", "signup"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => switchMode(m)}
              style={{
                flex: 1,
                padding: "9px 0",
                borderRadius: 999,
                border: "none",
                background: mode === m ? T.card : "transparent",
                color: mode === m ? T.ink : T.inkSoft,
                fontWeight: 700,
                fontSize: 13,
                fontFamily: "inherit",
                cursor: "pointer",
                boxShadow: mode === m ? T.cardShadow : "none",
              }}
            >
              {m === "login" ? "ログイン" : "新規登録"}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={label_style} htmlFor="auth-email">
              メールアドレス
            </label>
            <input
              id="auth-email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={input_style}
              required
            />
          </div>

          {is_signup && (
            <div style={{ marginBottom: 16 }}>
              <label style={label_style} htmlFor="auth-display-name">
                表示名（任意）
              </label>
              <input
                id="auth-display-name"
                type="text"
                autoComplete="nickname"
                value={display_name}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={50}
                style={input_style}
              />
            </div>
          )}

          <div style={{ marginBottom: 20 }}>
            <label style={label_style} htmlFor="auth-password">
              パスワード{is_signup ? "（8文字以上）" : ""}
            </label>
            <input
              id="auth-password"
              type="password"
              autoComplete={is_signup ? "new-password" : "current-password"}
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
            {submitting
              ? is_signup
                ? "登録中…"
                : "ログイン中…"
              : is_signup
                ? "アカウント作成"
                : "ログイン"}
          </button>
        </form>
      </div>
    </div>
  );
}
