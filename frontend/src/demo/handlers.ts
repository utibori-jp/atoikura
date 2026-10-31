// MSW handlers backing the static GitHub Pages demo (#142). The app runs as it
// does against the real backend — local DB, sync engine, ledger commands — and
// these handlers stand in for the server: the account endpoints answer for one
// fixed demo user, and sync and ledger commands go to the in-browser
// DemoLedgerServer (#201). None of this is bundled unless VITE_DEMO=true.

import { http, HttpResponse } from "msw";
import type { components } from "../api/types";
import { todayInJst } from "../logic";
import type { PushChange } from "../sync/wire";
import { DemoLedgerServer } from "./demoLedgerServer";
import { DEMO_USER_ID } from "./demoSeed";

// MSW matches on the same origin the API client targets (VITE_API_URL). In the
// demo build that origin never actually exists; MSW intercepts before any fetch.
const API_BASE = import.meta.env.VITE_API_URL;

const user: components["schemas"]["UserResponse"] = {
  id: DEMO_USER_ID,
  email: "demo@atoikura.app",
  display_name: "デモユーザー",
  last_login_at: new Date().toISOString(),
};

function demoStorage(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

const demo_ledger_server = new DemoLedgerServer(demoStorage(), todayInJst());

function demoTokenPair() {
  const expires_at = new Date(Date.now() + 3_600_000).toISOString();
  return {
    access_token: "demo",
    access_token_expires_at: expires_at,
    refresh_token: "demo",
    refresh_token_expires_at: expires_at,
    user_id: user.id,
  };
}

// Signs the demo in, as if it had logged in before.
export function seedDemoSession(): void {
  localStorage.setItem("atoikura.refresh_token", "demo");
  localStorage.setItem("atoikura.user_id", String(user.id));
}

export const demoHandlers = [
  // auth / user
  http.get(`${API_BASE}/users/me`, () => HttpResponse.json(user)),
  http.post(`${API_BASE}/auth/token`, () => HttpResponse.json(demoTokenPair())),
  http.post(`${API_BASE}/auth/refresh`, () => HttpResponse.json(demoTokenPair())),
  http.post(`${API_BASE}/auth/logout`, () => new HttpResponse(null, { status: 204 })),
  http.post(`${API_BASE}/auth/signup`, () =>
    HttpResponse.json({ token: "demo", ...user }, { status: 201 })
  ),
  http.put(`${API_BASE}/users/me/password`, () => new HttpResponse(null, { status: 204 })),

  // sync
  http.get(`${API_BASE}/sync/pull`, ({ request }) => {
    const query = new URL(request.url).searchParams;
    return HttpResponse.json(
      demo_ledger_server.pull(
        Number(query.get("since") ?? "0"),
        Number(query.get("limit") ?? "500")
      )
    );
  }),
  http.post(`${API_BASE}/sync/push`, async ({ request }) => {
    const push_body = (await request.json()) as { changes: PushChange[] };
    return HttpResponse.json({ results: demo_ledger_server.push(push_body.changes) });
  }),

  // online-only ledger commands
  http.all(`${API_BASE}/ledger/*`, async ({ request }) => {
    const command_path = decodeURIComponent(
      new URL(request.url).pathname.replace(/^\/ledger\//, "")
    );
    const request_body =
      request.method === "DELETE" ? {} : ((await request.json()) as Record<string, unknown>);
    const command_result = demo_ledger_server.runCommand(
      request.method,
      command_path,
      request_body
    );
    return HttpResponse.json(command_result.body, { status: command_result.http_status });
  }),
];
