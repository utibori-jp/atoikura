import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { LogoutResult } from "../session/sessionController";
import { UserInfo } from "./UserInfo";

const TEST_USER = {
  id: 1,
  email: "dev@atoikura.local",
  display_name: "Dev User",
  last_login_at: null,
};

describe("UserInfo logout", () => {
  it("asks before discarding unsent changes, and signs out only when confirmed", async () => {
    const logout_requests: { discard_pending_changes?: boolean }[] = [];
    const onLogout = async (
      options: { discard_pending_changes?: boolean } = {}
    ): Promise<LogoutResult> => {
      logout_requests.push(options);
      return options.discard_pending_changes
        ? { outcome: "signed_out" }
        : { outcome: "pending_changes", pending_count: 3 };
    };
    render(<UserInfo user={TEST_USER} onLogout={onLogout} />);

    fireEvent.click(screen.getByRole("button", { name: "ログアウト" }));

    expect(await screen.findByText(/送信できていない変更が3/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));
    await waitFor(() => expect(screen.queryByText(/送信できていない変更/)).not.toBeInTheDocument());
    expect(logout_requests).toEqual([{ discard_pending_changes: false }]);

    fireEvent.click(screen.getByRole("button", { name: "ログアウト" }));
    fireEvent.click(await screen.findByRole("button", { name: "変更を破棄してログアウト" }));

    await waitFor(() =>
      expect(logout_requests).toEqual([
        { discard_pending_changes: false },
        { discard_pending_changes: false },
        { discard_pending_changes: true },
      ])
    );
  });
});
