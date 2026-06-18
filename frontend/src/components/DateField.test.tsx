import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { DateField } from "./DateField";

describe("DateField", () => {
  it("displays the ISO value formatted as YYYY/MM/DD", () => {
    render(<DateField value="2026-06-25" onChange={() => {}} />);
    expect(screen.getByText("2026/06/25")).toBeInTheDocument();
    // ...regardless of the browser's locale (the value is rendered by us, not
    // by the native control).
    expect(screen.queryByText("06/25/2026")).not.toBeInTheDocument();
  });

  it("keeps the underlying control value in ISO form for submission", () => {
    render(<DateField value="2026-06-25" onChange={() => {}} />);
    expect(screen.getByDisplayValue("2026-06-25")).toBeInTheDocument();
  });

  it("emits an ISO YYYY-MM-DD string on change", () => {
    const onChange = vi.fn();
    render(<DateField value="2026-06-25" onChange={onChange} ariaLabel="日付" />);
    fireEvent.change(screen.getByLabelText("日付"), { target: { value: "2026-07-01" } });
    expect(onChange).toHaveBeenCalledWith("2026-07-01");
  });

  it("shows a YYYY/MM/DD placeholder when empty", () => {
    render(<DateField value="" onChange={() => {}} />);
    expect(screen.getByText("YYYY/MM/DD")).toBeInTheDocument();
  });
});
