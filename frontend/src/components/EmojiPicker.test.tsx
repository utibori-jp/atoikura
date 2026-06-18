import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { EmojiPicker } from "./EmojiPicker";
import { T } from "../theme";

describe("EmojiPicker", () => {
  it("renders one button per option", () => {
    render(
      <EmojiPicker
        value=""
        onSelect={() => {}}
        options={["🏢", "💼"]}
        accent={T.sage}
        accentSoft={T.sageSoft}
      />
    );
    expect(screen.getByRole("button", { name: "🏢" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "💼" })).toBeInTheDocument();
  });

  it("calls onSelect with the clicked emoji", () => {
    const onSelect = vi.fn();
    render(
      <EmojiPicker
        value=""
        onSelect={onSelect}
        options={["🏢", "💼"]}
        accent={T.sage}
        accentSoft={T.sageSoft}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "💼" }));
    expect(onSelect).toHaveBeenCalledWith("💼");
  });

  it("marks the current value as pressed", () => {
    render(
      <EmojiPicker
        value="💼"
        onSelect={() => {}}
        options={["🏢", "💼"]}
        accent={T.sage}
        accentSoft={T.sageSoft}
      />
    );
    expect(screen.getByRole("button", { name: "💼" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "🏢" })).toHaveAttribute("aria-pressed", "false");
  });
});
