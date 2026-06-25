import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "../../test/server";
import { WebMaster } from "./WebMaster";
import type { components } from "../../api/types";

const API_BASE = "http://localhost:8080";

function makeGroups(): components["schemas"]["CategoryGroupListResponse"] {
  return {
    category_groups: [
      {
        id: 1,
        group_name: "食費",
        statement_type: { id: 1, type_code: "food", statement_type_name: "食費（変動費）" },
        description: null,
      },
    ],
  };
}

function makeCategories(): components["schemas"]["ExpenseCategoryListResponse"] {
  return {
    expense_categories: [
      {
        id: 1,
        category_name: "スーパー",
        category_code: "food_super",
        group_id: 1,
        group_name: "食費",
        description: null,
      },
    ],
  };
}

function makeStatementTypes() {
  return {
    statement_types: [{ id: 1, type_code: "food", statement_type_name: "食費（変動費）" }],
  };
}

function useDefaultHandlers() {
  server.use(
    http.get(`${API_BASE}/category-groups`, () => HttpResponse.json(makeGroups())),
    http.get(`${API_BASE}/expense-categories`, () => HttpResponse.json(makeCategories())),
    http.get(`${API_BASE}/statement-types`, () => HttpResponse.json(makeStatementTypes()))
  );
}

async function waitForReady() {
  // Wait for the loaded group count, not just the static "大分類（" label, so the
  // fetched groups/categories have actually rendered before assertions run.
  await waitFor(() => expect(screen.getByText("大分類（1件）")).toBeInTheDocument());
}

describe("WebMaster — forms as modals (#130)", () => {
  it("no longer renders the redundant top-right ＋ 生活区分を追加 button", async () => {
    useDefaultHandlers();
    render(<WebMaster />);
    await waitForReady();

    // Switch to the 生活区分 tab where the removed button used to live.
    fireEvent.click(screen.getByRole("button", { name: "生活区分" }));

    expect(screen.queryByRole("button", { name: /生活区分を追加/ })).not.toBeInTheDocument();
    // The per-group add path still exists.
    expect(screen.getAllByRole("button").some((b) => b.textContent?.trim() === "＋ 追加")).toBe(
      true
    );
  });

  it("opens the 大分類 create form as a dialog from ＋ 大分類を追加", async () => {
    useDefaultHandlers();
    render(<WebMaster />);
    await waitForReady();

    fireEvent.click(screen.getByRole("button", { name: /大分類を追加/ }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("大分類を追加")).toBeInTheDocument();
    // Closes via the Modal close button.
    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("opens the 生活区分 create form as a dialog from a per-group ＋ 追加", async () => {
    useDefaultHandlers();
    render(<WebMaster />);
    await waitForReady();

    // The per-group ＋ 追加 button lives on the 生活区分 tab.
    fireEvent.click(screen.getByRole("button", { name: "生活区分" }));
    const per_group_add = screen
      .getAllByRole("button")
      .find((b) => b.textContent?.trim() === "＋ 追加");
    expect(per_group_add).toBeDefined();
    fireEvent.click(per_group_add!);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("生活区分を追加")).toBeInTheDocument();
  });
});
