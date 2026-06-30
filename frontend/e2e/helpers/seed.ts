/**
 * Seeding helpers for visual-regression tests.
 *
 * Each test run signs up a fresh user (unique email) so runs are isolated.
 * The CONTENT of the seed data (amounts, names, billing days) is fixed so
 * screenshots are stable across runs on the same day.
 *
 * What is seeded:
 *   - base income: ¥300,000
 *   - 1 fixed recurring expense: 家賃 ¥80,000 (billing_day 25)
 *   - 1 savings goal: 旅行積立 ¥20,000/month, target ¥250,000
 *   - 1 income record for the current month: ¥280,000 給与 (day 15)
 *
 * Intentionally NOT seeded:
 *   - journal entries  → home screen shows ¥0 spending (stable ring / stats)
 *   - surplus allocations
 *
 * variable_budget = base_income − recurring − savings = ¥200,000 (stable).
 */

import type { APIRequestContext } from "@playwright/test";

const API_BASE = "http://localhost:8080";

/**
 * Fixed reference date for all date-bearing seed data and the browser clock
 * (see helpers/auth.ts `freezeClock`).  Pinning to a constant — rather than the
 * real "today" — is what makes the screenshots deterministic across runs and
 * across calendar boundaries (month/weekday rollovers).  Any change here must
 * be matched by re-baselining the snapshots.
 */
export const FIXED_MONTH = "2026-06";
export const FIXED_NOW = new Date("2026-06-15T09:00:00+09:00");

export interface SeedResult {
  token: string;
  /** Fixed reference month in YYYY-MM format used to seed date-based records. */
  seedMonth: string;
}

export async function seedUser(request: APIRequestContext): Promise<SeedResult> {
  // Unique email per run. Date.now() alone collides when the per-project
  // beforeAll hooks run in parallel workers within the same millisecond, which
  // surfaced as a flaky 409 EMAIL_TAKEN; the random suffix removes the race.
  const email = `vr-${Date.now()}-${Math.floor(Math.random() * 1e9)}@seed.test`;
  const password = "VRseedPass1";

  // Fixed reference month (NOT the real current month) so seeded dates and the
  // frozen browser clock agree, keeping date-derived UI stable across runs.
  const seedMonth = FIXED_MONTH;

  // ── 1. Sign up (auto-seeds default category groups + categories) ────────
  const signupRes = await request.post(`${API_BASE}/auth/signup`, {
    data: { email, password, display_name: "VR Seed User" },
  });
  if (!signupRes.ok()) {
    throw new Error(`signup failed: ${signupRes.status()} ${await signupRes.text()}`);
  }
  const { token } = (await signupRes.json()) as { token: string };

  const headers = { Authorization: `Bearer ${token}` };

  // ── 2. Fetch auto-seeded category groups to find the 固定費 group ───────
  const groupsRes = await request.get(`${API_BASE}/category-groups`, { headers });
  const { category_groups } = (await groupsRes.json()) as {
    category_groups: Array<{
      id: number;
      group_name: string;
      statement_type: { type_code: string };
    }>;
  };

  const fixedGroup = category_groups.find((g) => g.statement_type.type_code === "fixed");
  if (!fixedGroup) throw new Error("No fixed category group found after signup");

  // ── 3. Fetch expense categories; pick 家賃 under 固定費 ─────────────────
  const catsRes = await request.get(`${API_BASE}/expense-categories`, { headers });
  const { expense_categories } = (await catsRes.json()) as {
    expense_categories: Array<{ id: number; category_name: string; group_id: number }>;
  };

  const rentCategory = expense_categories.find(
    (c) => c.group_id === fixedGroup.id && c.category_name === "家賃"
  );
  if (!rentCategory) throw new Error("家賃 category not found under 固定費");

  // ── 4. Set base income ───────────────────────────────────────────────────
  await request.put(`${API_BASE}/base-income`, {
    headers,
    data: { amount: 300000 },
  });

  // ── 5. Create recurring expense (fixed) ─────────────────────────────────
  await request.post(`${API_BASE}/recurring-expenses`, {
    headers,
    data: {
      name: "家賃",
      emoji: "🏠",
      billing_day: 25,
      amount: 80000,
      type: "fixed",
      category_id: rentCategory.id,
    },
  });

  // ── 6. Create savings goal ───────────────────────────────────────────────
  await request.post(`${API_BASE}/savings-goals`, {
    headers,
    data: {
      name: "旅行積立",
      emoji: "✈️",
      monthly_amount: 20000,
      target_amount: 250000,
      deadline: "2027/03",
      memo: "北海道旅行",
    },
  });

  // ── 7. Create income record for current month (day 15 is always valid) ──
  await request.post(`${API_BASE}/income-records`, {
    headers,
    data: {
      transaction_date: `${seedMonth}-15`,
      amount: 280000,
      name: "給与",
      income_type: "salary",
      emoji: "🏢",
      note: "",
    },
  });

  return { token, seedMonth };
}
