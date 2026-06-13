import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "../../test/server";
import { MobileSavings } from "./MobileSavings";
import type { components } from "../../api/types";

const API_BASE = "http://localhost:8080";

// --- fixture helpers ---

function makeGoal(
  overrides: Partial<components["schemas"]["SavingsGoal"]> = {}
): components["schemas"]["SavingsGoal"] {
  return {
    id: 1,
    name: "旅行積立",
    emoji: "✈️",
    monthly_amount: 20000,
    target_amount: 250000,
    accumulated_amount: 170000,
    deadline: "2027/03",
    memo: "北海道旅行",
    is_posted_this_month: false,
    ...overrides,
  };
}

function makeGoalList(
  goals: components["schemas"]["SavingsGoal"][]
): components["schemas"]["SavingsGoalListResponse"] {
  return { savings_goals: goals };
}

// Helper: wait until the subtitle is rendered (always present after load).
async function waitForReady() {
  await waitFor(() => {
    expect(screen.getByText("目的別に積み上げる")).toBeInTheDocument();
  });
}

// --- tests ---

describe("MobileSavings — create form", () => {
  it("opens the create sheet when ＋ 貯金目標を追加 is clicked", async () => {
    server.use(http.get(`${API_BASE}/savings-goals`, () => HttpResponse.json(makeGoalList([]))));

    render(<MobileSavings onBack={() => {}} />);
    await waitForReady();

    fireEvent.click(screen.getByRole("button", { name: /貯金目標を追加/ }));

    expect(screen.getByText("貯金目標を追加")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("例：新しいカメラ")).toBeInTheDocument();
  });

  it("calls POST /savings-goals and refreshes list on submit", async () => {
    const created_goal = makeGoal({ id: 99, name: "新目標", emoji: "🎯", monthly_amount: 5000 });

    let post_called = false;
    server.use(
      http.get(`${API_BASE}/savings-goals`, () => {
        if (post_called) return HttpResponse.json(makeGoalList([created_goal]));
        return HttpResponse.json(makeGoalList([]));
      }),
      http.post(`${API_BASE}/savings-goals`, async () => {
        post_called = true;
        return HttpResponse.json(created_goal, { status: 201 });
      })
    );

    render(<MobileSavings onBack={() => {}} />);
    await waitForReady();

    // Open create sheet
    fireEvent.click(screen.getByRole("button", { name: /貯金目標を追加/ }));

    // Fill required fields
    fireEvent.change(screen.getByPlaceholderText("例：新しいカメラ"), {
      target: { value: "新目標" },
    });
    fireEvent.change(screen.getByPlaceholderText("20000"), { target: { value: "5000" } });

    // Submit
    fireEvent.click(screen.getByRole("button", { name: "保存する" }));

    // After save, goal card should appear and sheet should close
    await waitFor(() => {
      expect(screen.getByText("新目標")).toBeInTheDocument();
    });

    // Sheet title should no longer be visible
    expect(screen.queryByText("貯金目標を追加")).not.toBeInTheDocument();
  });

  it("shows validation error when name is empty", async () => {
    server.use(http.get(`${API_BASE}/savings-goals`, () => HttpResponse.json(makeGoalList([]))));

    render(<MobileSavings onBack={() => {}} />);
    await waitForReady();

    fireEvent.click(screen.getByRole("button", { name: /貯金目標を追加/ }));

    // Submit without filling name
    fireEvent.click(screen.getByRole("button", { name: "保存する" }));

    expect(screen.getByText("名前を入力してください")).toBeInTheDocument();
  });

  it("closes the sheet when ✕ is clicked", async () => {
    server.use(http.get(`${API_BASE}/savings-goals`, () => HttpResponse.json(makeGoalList([]))));

    render(<MobileSavings onBack={() => {}} />);
    await waitForReady();

    fireEvent.click(screen.getByRole("button", { name: /貯金目標を追加/ }));
    expect(screen.getByText("貯金目標を追加")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "✕" }));
    expect(screen.queryByText("貯金目標を追加")).not.toBeInTheDocument();
  });
});

describe("MobileSavings — edit form", () => {
  it("opens the edit sheet pre-filled when 編集 is clicked", async () => {
    const existing_goal = makeGoal();

    server.use(
      http.get(`${API_BASE}/savings-goals`, () => HttpResponse.json(makeGoalList([existing_goal])))
    );

    render(<MobileSavings onBack={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText("旅行積立")).toBeInTheDocument();
    });

    // Click the edit button
    fireEvent.click(screen.getByRole("button", { name: "編集" }));

    expect(screen.getByText("貯金目標を編集")).toBeInTheDocument();
    // Name input should be pre-filled
    expect(screen.getByDisplayValue("旅行積立")).toBeInTheDocument();
  });

  it("calls PUT /savings-goals/:id and refreshes list on submit", async () => {
    const existing_goal = makeGoal();
    const updated_goal = makeGoal({ name: "更新済み目標", monthly_amount: 30000 });

    let put_called = false;
    server.use(
      http.get(`${API_BASE}/savings-goals`, () => {
        if (put_called) return HttpResponse.json(makeGoalList([updated_goal]));
        return HttpResponse.json(makeGoalList([existing_goal]));
      }),
      http.put(`${API_BASE}/savings-goals/1`, async () => {
        put_called = true;
        return HttpResponse.json(updated_goal);
      })
    );

    render(<MobileSavings onBack={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText("旅行積立")).toBeInTheDocument();
    });

    // Open edit sheet
    fireEvent.click(screen.getByRole("button", { name: "編集" }));

    await waitFor(() => {
      expect(screen.getByText("貯金目標を編集")).toBeInTheDocument();
    });

    // Change name in the pre-filled input
    const name_input = screen.getByDisplayValue("旅行積立");
    fireEvent.change(name_input, { target: { value: "更新済み目標" } });

    // Submit
    fireEvent.click(screen.getByRole("button", { name: "保存する" }));

    // After save, updated name should appear and sheet should close
    await waitFor(() => {
      expect(screen.getByText("更新済み目標")).toBeInTheDocument();
    });

    expect(screen.queryByText("貯金目標を編集")).not.toBeInTheDocument();
  });
});

describe("MobileSavings — delete", () => {
  it("calls DELETE /savings-goals/:id and removes the card after confirmation", async () => {
    const existing_goal = makeGoal();

    let delete_called = false;
    server.use(
      http.get(`${API_BASE}/savings-goals`, () => HttpResponse.json(makeGoalList([existing_goal]))),
      http.delete(`${API_BASE}/savings-goals/1`, () => {
        delete_called = true;
        return new HttpResponse(null, { status: 204 });
      })
    );

    // Mock window.confirm to return true
    const original_confirm = window.confirm;
    window.confirm = () => true;

    render(<MobileSavings onBack={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText("旅行積立")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "削除" }));

    await waitFor(() => {
      expect(delete_called).toBe(true);
      expect(screen.queryByText("旅行積立")).not.toBeInTheDocument();
    });

    window.confirm = original_confirm;
  });

  it("does not delete when confirmation is cancelled", async () => {
    const existing_goal = makeGoal();

    let delete_called = false;
    server.use(
      http.get(`${API_BASE}/savings-goals`, () => HttpResponse.json(makeGoalList([existing_goal]))),
      http.delete(`${API_BASE}/savings-goals/1`, () => {
        delete_called = true;
        return new HttpResponse(null, { status: 204 });
      })
    );

    // Mock window.confirm to return false (cancel)
    const original_confirm = window.confirm;
    window.confirm = () => false;

    render(<MobileSavings onBack={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText("旅行積立")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "削除" }));

    // Goal card should still be visible since delete was cancelled
    expect(delete_called).toBe(false);
    expect(screen.getByText("旅行積立")).toBeInTheDocument();

    window.confirm = original_confirm;
  });
});

describe("MobileSavings — post-monthly", () => {
  it("shows 今月分を記録する when not yet posted and calls post-monthly on click", async () => {
    const unposted_goal = makeGoal({ is_posted_this_month: false });
    const posted_goal = makeGoal({ is_posted_this_month: true });

    let post_monthly_called = false;
    server.use(
      http.get(`${API_BASE}/savings-goals`, () => {
        if (post_monthly_called) return HttpResponse.json(makeGoalList([posted_goal]));
        return HttpResponse.json(makeGoalList([unposted_goal]));
      }),
      http.post(`${API_BASE}/savings-goals/1/post-monthly`, async () => {
        post_monthly_called = true;
        return HttpResponse.json(posted_goal);
      })
    );

    render(<MobileSavings onBack={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText("旅行積立")).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: "今月分を記録する" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "今月分を記録する" }));

    await waitFor(() => {
      expect(post_monthly_called).toBe(true);
      // After refresh, the button should be gone and ✅ 今月済 badge should appear
      expect(screen.queryByRole("button", { name: "今月分を記録する" })).not.toBeInTheDocument();
      expect(screen.getByText("✅ 今月済")).toBeInTheDocument();
    });
  });

  it("does not show 今月分を記録する when already posted", async () => {
    const posted_goal = makeGoal({ is_posted_this_month: true });

    server.use(
      http.get(`${API_BASE}/savings-goals`, () => HttpResponse.json(makeGoalList([posted_goal])))
    );

    render(<MobileSavings onBack={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText("旅行積立")).toBeInTheDocument();
    });

    expect(screen.queryByRole("button", { name: "今月分を記録する" })).not.toBeInTheDocument();
    expect(screen.getByText("✅ 今月済")).toBeInTheDocument();
  });
});
