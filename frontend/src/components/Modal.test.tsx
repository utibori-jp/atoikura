import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { Modal } from "./Modal";

describe("Modal", () => {
  it("renders the title and children", () => {
    render(
      <Modal title="収入を追加" onClose={() => {}}>
        <p>body content</p>
      </Modal>
    );
    expect(screen.getByText("収入を追加")).toBeInTheDocument();
    expect(screen.getByText("body content")).toBeInTheDocument();
  });

  it("calls onClose when the backdrop is clicked", () => {
    const onClose = vi.fn();
    render(
      <Modal title="t" onClose={onClose}>
        <p>body</p>
      </Modal>
    );
    fireEvent.click(screen.getByTestId("modal-backdrop"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not call onClose when the content card is clicked", () => {
    const onClose = vi.fn();
    render(
      <Modal title="t" onClose={onClose}>
        <p>body</p>
      </Modal>
    );
    fireEvent.click(screen.getByText("body"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("calls onClose when Escape is pressed", () => {
    const onClose = vi.fn();
    render(
      <Modal title="t" onClose={onClose}>
        <p>body</p>
      </Modal>
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when the close button is clicked", () => {
    const onClose = vi.fn();
    render(
      <Modal title="t" onClose={onClose}>
        <p>body</p>
      </Modal>
    );
    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
