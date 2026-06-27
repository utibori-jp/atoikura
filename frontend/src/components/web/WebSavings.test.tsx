import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import type { ReactElement } from "react";
import { http, HttpResponse } from "msw";
import { server } from "../../test/server";
import { WebSavings } from "./WebSavings";
import { DialogProvider } from "../dialogs";
import type { components } from "../../api/types";

// WebSavings consumes the confirm dialog via context (#166).
function renderWithDialogs(ui: ReactElement) {
  return render(<DialogProvider>{ui}</DialogProvider>);
}

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

// Helper: wait until the page subtitle is present (always rendered, unique text).
async function waitForReady() {
  await waitFor(() => {
    expect(screen.getByText("目的別に積み立てて、着実に前進")).toBeInTheDocument();
  });
}

// --- tests ---

describe("WebSavings — create form", () => {
  it("opens the create form when ＋ 貯金目標を追加 is clicked", async () => {
    server.use(http.get(`${API_BASE}/savings-goals`, () => HttpResponse.json(makeGoalList([]))));

    renderWithDialogs(<WebSavings onBack={() => {}} />);
    await waitForReady();

    fireEvent.click(screen.getByRole("button", { name: /貯金目標を追加/ }));

    // Form title "貯金目標を追加" (inside the inline form div, not the button)
    expect(screen.getByText("貯金目標を追加")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("旅行積立")).toBeInTheDocument();
  });

  it("calls POST /savings-goals and refreshes list on submit", async () => {
    const created_goal = makeGoal({ id: 99, name: "新目標", emoji: "🎯", monthly_amount: 5000 });

    let post_called = false;
    server.use(
      http.get(`${API_BASE}/savings-goals`, () => {
        // Return the new goal only after POST has been called (simulates refresh)
        if (post_called) {
          return HttpResponse.json(makeGoalList([created_goal]));
        }
        return HttpResponse.json(makeGoalList([]));
      }),
      http.post(`${API_BASE}/savings-goals`, async () => {
        post_called = true;
        return HttpResponse.json(created_goal, { status: 201 });
      })
    );

    renderWithDialogs(<WebSavings onBack={() => {}} />);
    await waitForReady();

    // Open create form
    fireEvent.click(screen.getByRole("button", { name: /貯金目標を追加/ }));

    // Fill required fields
    fireEvent.change(screen.getByPlaceholderText("旅行積立"), { target: { value: "新目標" } });
    fireEvent.change(screen.getByPlaceholderText("📷"), { target: { value: "🎯" } });
    fireEvent.change(screen.getByPlaceholderText("20000"), { target: { value: "5000" } });

    // Submit
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    // After save, form heading should close and goal card title should appear
    await waitFor(() => {
      // The card header uses font-size 16px — use getAllByText since hero badge
      // also shows the name
      const matches = screen.getAllByText("新目標");
      expect(matches.length).toBeGreaterThan(0);
    });

    // Form heading should no longer be visible
    expect(screen.queryByText("貯金目標を追加")).not.toBeInTheDocument();
  });

  it("submits the default emoji when the emoji field is untouched", async () => {
    let posted_body: components["schemas"]["SavingsGoalRequest"] | null = null;
    server.use(
      http.get(`${API_BASE}/savings-goals`, () => HttpResponse.json(makeGoalList([]))),
      http.post(`${API_BASE}/savings-goals`, async ({ request }) => {
        posted_body = (await request.json()) as components["schemas"]["SavingsGoalRequest"];
        return HttpResponse.json(makeGoal({ id: 99 }), { status: 201 });
      })
    );

    renderWithDialogs(<WebSavings onBack={() => {}} />);
    await waitForReady();

    fireEvent.click(screen.getByRole("button", { name: /貯金目標を追加/ }));

    // Fill only the non-emoji required fields, then submit.
    fireEvent.change(screen.getByPlaceholderText("旅行積立"), { target: { value: "新目標" } });
    fireEvent.change(screen.getByPlaceholderText("20000"), { target: { value: "5000" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(posted_body).not.toBeNull());
    expect(posted_body).toMatchObject({ emoji: "📷" });
  });

  it("lets the user pick a different emoji from the list", async () => {
    let posted_body: components["schemas"]["SavingsGoalRequest"] | null = null;
    server.use(
      http.get(`${API_BASE}/savings-goals`, () => HttpResponse.json(makeGoalList([]))),
      http.post(`${API_BASE}/savings-goals`, async ({ request }) => {
        posted_body = (await request.json()) as components["schemas"]["SavingsGoalRequest"];
        return HttpResponse.json(makeGoal({ id: 99 }), { status: 201 });
      })
    );

    renderWithDialogs(<WebSavings onBack={() => {}} />);
    await waitForReady();

    fireEvent.click(screen.getByRole("button", { name: /貯金目標を追加/ }));

    fireEvent.change(screen.getByPlaceholderText("旅行積立"), { target: { value: "新目標" } });
    fireEvent.change(screen.getByPlaceholderText("20000"), { target: { value: "5000" } });
    // Choose a non-default emoji from the picker.
    fireEvent.click(screen.getByRole("button", { name: "🎁" }));
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(posted_body).not.toBeNull());
    expect(posted_body).toMatchObject({ emoji: "🎁" });
  });

  it("shows validation error when name is empty", async () => {
    server.use(http.get(`${API_BASE}/savings-goals`, () => HttpResponse.json(makeGoalList([]))));

    renderWithDialogs(<WebSavings onBack={() => {}} />);
    await waitForReady();

    fireEvent.click(screen.getByRole("button", { name: /貯金目標を追加/ }));

    // Submit without filling name
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(screen.getByText("名前を入力してください")).toBeInTheDocument();
  });

  it("closes the form when キャンセル is clicked", async () => {
    server.use(http.get(`${API_BASE}/savings-goals`, () => HttpResponse.json(makeGoalList([]))));

    renderWithDialogs(<WebSavings onBack={() => {}} />);
    await waitForReady();

    fireEvent.click(screen.getByRole("button", { name: /貯金目標を追加/ }));
    expect(screen.getByText("貯金目標を追加")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));
    expect(screen.queryByText("貯金目標を追加")).not.toBeInTheDocument();
  });
});

describe("WebSavings — edit form", () => {
  it("opens the edit form pre-filled when ✎ is clicked", async () => {
    const existing_goal = makeGoal();

    server.use(
      http.get(`${API_BASE}/savings-goals`, () => HttpResponse.json(makeGoalList([existing_goal])))
    );

    renderWithDialogs(<WebSavings onBack={() => {}} />);

    // Wait for goal card to render
    await waitFor(() => {
      // Goal name appears in hero badge and card
      expect(screen.getAllByText("旅行積立").length).toBeGreaterThan(0);
    });

    // Click the edit icon (✎) for the goal
    fireEvent.click(screen.getByText("✎"));

    expect(screen.getByText("貯金目標を編集")).toBeInTheDocument();

    // Name input should be pre-filled with existing value
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

    renderWithDialogs(<WebSavings onBack={() => {}} />);

    await waitFor(() => {
      expect(screen.getAllByText("旅行積立").length).toBeGreaterThan(0);
    });

    // Open edit form
    fireEvent.click(screen.getByText("✎"));

    await waitFor(() => {
      expect(screen.getByText("貯金目標を編集")).toBeInTheDocument();
    });

    // Change name via the pre-filled input
    const name_input = screen.getByDisplayValue("旅行積立");
    fireEvent.change(name_input, { target: { value: "更新済み目標" } });

    // Submit
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    // After save, updated goal name should appear and form should close
    await waitFor(() => {
      expect(screen.getAllByText("更新済み目標").length).toBeGreaterThan(0);
    });

    expect(screen.queryByText("貯金目標を編集")).not.toBeInTheDocument();
  });
});
