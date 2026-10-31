import { fireEvent, render, screen } from "@testing-library/react";
import { addMonths, todayInJst } from "../logic";
import { MonthSwitcher } from "./MonthSwitcher";

describe("MonthSwitcher", () => {
  it("shows the month and moves to the previous and next month", () => {
    const onYearMonthChange = vi.fn();
    render(<MonthSwitcher year_month="2025-01" onYearMonthChange={onYearMonthChange} />);

    expect(screen.getByText("2025年1月")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "前の月" }));
    fireEvent.click(screen.getByRole("button", { name: "次の月" }));

    expect(onYearMonthChange.mock.calls).toEqual([["2024-12"], ["2025-02"]]);
  });

  it("cannot move past the current month", () => {
    const current_month = todayInJst().slice(0, 7);
    render(<MonthSwitcher year_month={current_month} onYearMonthChange={() => {}} />);

    expect(screen.getByRole("button", { name: "次の月" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "前の月" })).toBeEnabled();
    expect(addMonths(current_month, -1) < current_month).toBe(true);
  });
});
