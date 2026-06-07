import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { LoginScreen } from "./LoginScreen";

function getSubmitButton() {
  return screen.getAllByRole("button").find((btn) => btn.getAttribute("type") === "submit")!;
}

describe("LoginScreen", () => {
  const onSuccess = vi.fn();

  beforeEach(() => {
    onSuccess.mockReset();
  });

  it("renders email and password inputs in login mode", () => {
    render(<LoginScreen onSuccess={onSuccess} />);
    expect(screen.getByLabelText(/メールアドレス/)).toBeInTheDocument();
    expect(screen.getByLabelText(/パスワード/)).toBeInTheDocument();
    expect(getSubmitButton()).toBeInTheDocument();
  });

  it("shows error when submitting with empty fields", async () => {
    render(<LoginScreen onSuccess={onSuccess} />);
    // Use fireEvent.submit to bypass HTML5 required validation in jsdom
    fireEvent.submit(getSubmitButton().closest("form")!);
    await waitFor(() => {
      expect(screen.getByText("メールアドレスとパスワードを入力してください")).toBeInTheDocument();
    });
  });

  it("switches to signup mode and shows display name field", async () => {
    render(<LoginScreen onSuccess={onSuccess} />);
    fireEvent.click(screen.getByRole("button", { name: /新規登録/ }));
    await waitFor(() => {
      expect(screen.getByLabelText(/表示名/)).toBeInTheDocument();
    });
  });

  it("shows error when signup password is too short", async () => {
    render(<LoginScreen onSuccess={onSuccess} />);
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

  it("calls onSuccess after successful login", async () => {
    render(<LoginScreen onSuccess={onSuccess} />);
    fireEvent.change(screen.getByLabelText(/メールアドレス/), {
      target: { value: "dev@atoikura.local" },
    });
    fireEvent.change(screen.getByLabelText(/パスワード/), {
      target: { value: "password123" },
    });
    fireEvent.click(getSubmitButton());

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });
  });
});
