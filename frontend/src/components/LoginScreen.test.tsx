import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AuthError } from "../api/client";
import { LoginScreen } from "./LoginScreen";

function getSubmitButton() {
  return screen.getAllByRole("button").find((btn) => btn.getAttribute("type") === "submit")!;
}

describe("LoginScreen", () => {
  const onLogin = vi.fn<(email: string, password: string) => Promise<void>>();
  const onSignup =
    vi.fn<(email: string, password: string, display_name: string | null) => Promise<void>>();

  beforeEach(() => {
    onLogin.mockReset().mockResolvedValue();
    onSignup.mockReset().mockResolvedValue();
  });

  it("renders email and password inputs in login mode", () => {
    render(<LoginScreen onLogin={onLogin} onSignup={onSignup} />);
    expect(screen.getByLabelText(/メールアドレス/)).toBeInTheDocument();
    expect(screen.getByLabelText(/パスワード/)).toBeInTheDocument();
    expect(getSubmitButton()).toBeInTheDocument();
  });

  it("shows error when submitting with empty fields", async () => {
    render(<LoginScreen onLogin={onLogin} onSignup={onSignup} />);
    // Use fireEvent.submit to bypass HTML5 required validation in jsdom
    fireEvent.submit(getSubmitButton().closest("form")!);
    await waitFor(() => {
      expect(screen.getByText("メールアドレスとパスワードを入力してください")).toBeInTheDocument();
    });
  });

  it("switches to signup mode and shows display name field", async () => {
    render(<LoginScreen onLogin={onLogin} onSignup={onSignup} />);
    fireEvent.click(screen.getByRole("button", { name: /新規登録/ }));
    await waitFor(() => {
      expect(screen.getByLabelText(/表示名/)).toBeInTheDocument();
    });
  });

  it("shows error when signup password is too short", async () => {
    render(<LoginScreen onLogin={onLogin} onSignup={onSignup} />);
    fireEvent.click(screen.getByRole("button", { name: /新規登録/ }));

    fireEvent.change(screen.getByLabelText(/メールアドレス/), {
      target: { value: "test@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/パスワード/), {
      target: { value: "short" },
    });
    fireEvent.click(getSubmitButton());

    await waitFor(() => {
      expect(screen.getByText("パスワードは8文字以上で入力してください")).toBeInTheDocument();
    });
  });

  it("passes the credentials to onLogin", async () => {
    render(<LoginScreen onLogin={onLogin} onSignup={onSignup} />);
    fireEvent.change(screen.getByLabelText(/メールアドレス/), {
      target: { value: "dev@atoikura.local" },
    });
    fireEvent.change(screen.getByLabelText(/パスワード/), {
      target: { value: "password123" },
    });
    fireEvent.click(getSubmitButton());

    await waitFor(() => {
      expect(onLogin).toHaveBeenCalledWith("dev@atoikura.local", "password123");
    });
  });

  it("says the credentials are wrong when login is refused", async () => {
    onLogin.mockRejectedValue(new AuthError("認証情報が不正です"));
    render(<LoginScreen onLogin={onLogin} onSignup={onSignup} />);
    fireEvent.change(screen.getByLabelText(/メールアドレス/), {
      target: { value: "dev@atoikura.local" },
    });
    fireEvent.change(screen.getByLabelText(/パスワード/), { target: { value: "wrong" } });
    fireEvent.click(getSubmitButton());

    expect(
      await screen.findByText("メールアドレスまたはパスワードが正しくありません")
    ).toBeInTheDocument();
  });

  it("shows why the user was signed out", () => {
    render(<LoginScreen onLogin={onLogin} onSignup={onSignup} notice="再度ログインしてください" />);
    expect(screen.getByRole("alert")).toHaveTextContent("再度ログインしてください");
  });
});
