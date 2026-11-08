import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import type { RegisterSWOptions } from "virtual:pwa-register/react";
import { checkForAppUpdate, setAppServiceWorkerRegistration } from "./appUpdate";
import { UpdateNotice } from "./UpdateNotice";

const register_state = vi.hoisted(() => ({
  options: null as RegisterSWOptions | null,
  updateServiceWorker: vi.fn(),
  show_update: null as ((is_update_ready: boolean) => void) | null,
}));

vi.mock("virtual:pwa-register/react", () => ({
  useRegisterSW(options: RegisterSWOptions) {
    register_state.options = options;
    const [is_update_ready, setIsUpdateReady] = useState(false);
    register_state.show_update = setIsUpdateReady;
    return {
      needRefresh: [is_update_ready, setIsUpdateReady],
      offlineReady: [false, () => {}],
      updateServiceWorker: register_state.updateServiceWorker,
    };
  },
}));

describe("UpdateNotice", () => {
  afterEach(() => {
    setAppServiceWorkerRegistration(null);
    register_state.updateServiceWorker.mockReset();
  });

  it("stays hidden until a new version is installed", () => {
    render(<UpdateNotice />);

    expect(screen.queryByText("新しいバージョンがあります")).not.toBeInTheDocument();
  });

  it("reloads into the new version when the user accepts", () => {
    render(<UpdateNotice />);
    act(() => register_state.show_update?.(true));

    fireEvent.click(screen.getByRole("button", { name: "更新する" }));

    expect(register_state.updateServiceWorker).toHaveBeenCalledWith(true);
  });

  it("can be put off until the next start", () => {
    render(<UpdateNotice />);
    act(() => register_state.show_update?.(true));

    fireEvent.click(screen.getByRole("button", { name: "あとで" }));

    expect(screen.queryByText("新しいバージョンがあります")).not.toBeInTheDocument();
    expect(register_state.updateServiceWorker).not.toHaveBeenCalled();
  });

  it("keeps the registration so an update can be looked for on demand", () => {
    vi.useFakeTimers();
    try {
      render(<UpdateNotice />);
      const update = vi.fn().mockResolvedValue(undefined);
      register_state.options?.onRegisteredSW?.("/sw.js", {
        update,
      } as unknown as ServiceWorkerRegistration);

      checkForAppUpdate();
      vi.advanceTimersByTime(60 * 60 * 1000);

      expect(update).toHaveBeenCalledTimes(2);
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });
});
