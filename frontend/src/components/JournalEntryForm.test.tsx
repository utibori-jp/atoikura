import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { JournalEntryForm } from "./JournalEntryForm";

describe("JournalEntryForm", () => {
  const onSuccess = vi.fn();

  beforeEach(() => {
    onSuccess.mockReset();
  });

  it("renders date, amount, and item fields", () => {
    render(<JournalEntryForm onSuccess={onSuccess} />);
    expect(screen.getByPlaceholderText("¥0")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("例: コンビニ弁当")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /記録する/ })).toBeInTheDocument();
  });

  it("shows error when submitting without selecting a category", async () => {
    render(<JournalEntryForm onSuccess={onSuccess} />);
    fireEvent.change(screen.getByPlaceholderText("¥0"), {
      target: { value: "500" },
    });
    fireEvent.click(screen.getByRole("button", { name: /記録する/ }));

    await waitFor(() => {
      expect(screen.getByText("生活区分を選択してください")).toBeInTheDocument();
    });
  });

  it("shows error when amount is empty after category selected", async () => {
    render(<JournalEntryForm onSuccess={onSuccess} />);

    await waitFor(() => {
      expect(screen.getByText("食費")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("食費"));

    await waitFor(() => {
      expect(screen.getByText("スーパー")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("スーパー"));

    // Leave amount empty — use fireEvent.submit to bypass HTML5 required validation in jsdom
    fireEvent.submit(screen.getByRole("button", { name: /記録する/ }).closest("form")!);

    await waitFor(() => {
      expect(screen.getByText("金額は1以上の整数を入力してください")).toBeInTheDocument();
    });
  });

  it("calls onSuccess after successful submit", async () => {
    render(<JournalEntryForm onSuccess={onSuccess} />);

    await waitFor(() => {
      expect(screen.getByText("食費")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("食費"));

    await waitFor(() => {
      expect(screen.getByText("スーパー")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("スーパー"));
    fireEvent.change(screen.getByPlaceholderText("¥0"), {
      target: { value: "500" },
    });
    fireEvent.click(screen.getByRole("button", { name: /記録する/ }));

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });
  });
});
