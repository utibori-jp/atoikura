import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { useEntityForm } from "./useEntityForm";

interface DemoForm {
  id: number | null;
  name: string;
  amount: string;
}

interface DemoEntity {
  id: number;
  name: string;
  amount: number;
}

const blank = (): DemoForm => ({ id: null, name: "", amount: "" });
const fromEntity = (e: DemoEntity): DemoForm => ({
  id: e.id,
  name: e.name,
  amount: String(e.amount),
});

describe("useEntityForm", () => {
  it("starts with no form open", () => {
    const { result } = renderHook(() =>
      useEntityForm<DemoForm, DemoEntity>({ blank, fromEntity, onSubmit: vi.fn() })
    );
    expect(result.current.form).toBeNull();
  });

  it("openCreate opens a blank form in create mode", () => {
    const { result } = renderHook(() =>
      useEntityForm<DemoForm, DemoEntity>({ blank, fromEntity, onSubmit: vi.fn() })
    );
    act(() => result.current.openCreate());
    expect(result.current.form).toEqual({ id: null, name: "", amount: "" });
    expect(result.current.isEdit).toBe(false);
  });

  it("openEdit opens a form mapped from the entity in edit mode", () => {
    const { result } = renderHook(() =>
      useEntityForm<DemoForm, DemoEntity>({ blank, fromEntity, onSubmit: vi.fn() })
    );
    act(() => result.current.openEdit({ id: 7, name: "rent", amount: 80000 }));
    expect(result.current.form).toEqual({ id: 7, name: "rent", amount: "80000" });
    expect(result.current.isEdit).toBe(true);
  });

  it("setField updates a single field", () => {
    const { result } = renderHook(() =>
      useEntityForm<DemoForm, DemoEntity>({ blank, fromEntity, onSubmit: vi.fn() })
    );
    act(() => result.current.openCreate());
    act(() => result.current.setField("name", "phone"));
    expect(result.current.form?.name).toBe("phone");
  });

  it("submits the current form and closes on success", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useEntityForm<DemoForm, DemoEntity>({ blank, fromEntity, onSubmit })
    );
    act(() => result.current.openCreate());
    act(() => result.current.setField("name", "phone"));
    await act(async () => {
      await result.current.submit();
    });
    expect(onSubmit).toHaveBeenCalledWith({ id: null, name: "phone", amount: "" });
    expect(result.current.form).toBeNull();
    expect(result.current.error).toBe("");
  });

  it("blocks submission and sets the error when validate fails", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useEntityForm<DemoForm, DemoEntity>({
        blank,
        fromEntity,
        onSubmit,
        validate: (f) => (f.name.trim() ? null : "名前を入力してください"),
      })
    );
    act(() => result.current.openCreate());
    await act(async () => {
      await result.current.submit();
    });
    expect(onSubmit).not.toHaveBeenCalled();
    expect(result.current.error).toBe("名前を入力してください");
    expect(result.current.form).not.toBeNull();
  });

  it("keeps the form open and surfaces the message when onSubmit throws", async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error("サーバーエラー"));
    const { result } = renderHook(() =>
      useEntityForm<DemoForm, DemoEntity>({ blank, fromEntity, onSubmit })
    );
    act(() => result.current.openCreate());
    await act(async () => {
      await result.current.submit();
    });
    expect(result.current.error).toBe("サーバーエラー");
    expect(result.current.form).not.toBeNull();
    expect(result.current.submitting).toBe(false);
  });

  it("exposes submitting while the submit is in flight", async () => {
    let resolve_submit: () => void = () => {};
    const onSubmit = vi.fn(
      () =>
        new Promise<void>((res) => {
          resolve_submit = res;
        })
    );
    const { result } = renderHook(() =>
      useEntityForm<DemoForm, DemoEntity>({ blank, fromEntity, onSubmit })
    );
    act(() => result.current.openCreate());
    let submission: Promise<void>;
    act(() => {
      submission = result.current.submit();
    });
    await waitFor(() => expect(result.current.submitting).toBe(true));
    await act(async () => {
      resolve_submit();
      await submission;
    });
    expect(result.current.submitting).toBe(false);
  });
});
