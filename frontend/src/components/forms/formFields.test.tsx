import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { FormField } from "./FormField";
import { AmountField } from "./AmountField";
import { SelectField } from "./SelectField";
import { EmojiField } from "./EmojiField";
import { FormError } from "./FormError";
import { FormActions } from "./FormActions";

describe("FormField", () => {
  it("renders the label and value and emits the new string on change", () => {
    const onChange = vi.fn();
    render(<FormField label="名前" value="家賃" onChange={onChange} />);
    const input = screen.getByLabelText("名前");
    expect(input).toHaveValue("家賃");
    fireEvent.change(input, { target: { value: "電気" } });
    expect(onChange).toHaveBeenCalledWith("電気");
  });

  it("supports a numeric type", () => {
    render(<FormField label="日" value="25" onChange={() => {}} type="number" />);
    expect(screen.getByLabelText("日")).toHaveAttribute("type", "number");
  });
});

describe("AmountField", () => {
  it("renders a numeric input and emits the string on change", () => {
    const onChange = vi.fn();
    render(<AmountField label="金額" value="" onChange={onChange} />);
    const input = screen.getByLabelText("金額");
    expect(input).toHaveAttribute("type", "number");
    fireEvent.change(input, { target: { value: "80000" } });
    expect(onChange).toHaveBeenCalledWith("80000");
  });
});

describe("SelectField", () => {
  it("renders options plus an optional placeholder and emits the chosen value", () => {
    const onChange = vi.fn();
    render(
      <SelectField
        label="カテゴリ"
        value=""
        onChange={onChange}
        placeholder="選択してください"
        options={[
          { value: "1", label: "食費" },
          { value: "2", label: "光熱費" },
        ]}
      />
    );
    expect(screen.getByText("選択してください")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("カテゴリ"), { target: { value: "2" } });
    expect(onChange).toHaveBeenCalledWith("2");
  });
});

describe("EmojiField", () => {
  it("emits a typed emoji and a picked emoji", () => {
    const onChange = vi.fn();
    render(<EmojiField value="🏠" onChange={onChange} options={["🏠", "📱"]} />);
    fireEvent.change(screen.getByLabelText("絵文字"), { target: { value: "🚗" } });
    expect(onChange).toHaveBeenCalledWith("🚗");
    fireEvent.click(screen.getByRole("button", { name: "📱" }));
    expect(onChange).toHaveBeenCalledWith("📱");
  });
});

describe("FormError", () => {
  it("renders the message when present", () => {
    render(<FormError message="名前を入力してください" />);
    expect(screen.getByText("名前を入力してください")).toBeInTheDocument();
  });

  it("renders nothing when the message is empty", () => {
    const { container } = render(<FormError message="" />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("FormActions", () => {
  it("invokes submit and cancel handlers", () => {
    const onSubmit = vi.fn();
    const onCancel = vi.fn();
    render(<FormActions onSubmit={onSubmit} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("shows the submitting label and disables submit while submitting", () => {
    render(<FormActions onSubmit={() => {}} onCancel={() => {}} submitting />);
    const submit = screen.getByRole("button", { name: "保存中…" });
    expect(submit).toBeDisabled();
  });
});
