import type { AccessTokenProvider } from "./authSession";
import {
  CommandRejectedError,
  SyncAuthError,
  SyncClientError,
  SyncNetworkError,
  SyncUpdateRequiredError,
} from "./errors";
import { createLedgerCommands } from "./ledgerCommands";
import { HttpSyncTransport } from "./transport";

const API_BASE_URL = "http://api.test";

function jsonResponse(response_body: unknown, status = 200): Response {
  return new Response(JSON.stringify(response_body), { status });
}

function fakeAuth(): AccessTokenProvider & { refresh_calls: string[] } {
  const refresh_calls: string[] = [];
  return {
    refresh_calls,
    getAccessToken: async () => "access-1",
    refreshAccessToken: async (stale_access_token) => {
      refresh_calls.push(stale_access_token);
      return "access-2";
    },
  };
}

function requestHeaders(fetch_fn: ReturnType<typeof vi.fn<typeof fetch>>, call_index: number) {
  return fetch_fn.mock.calls[call_index][1]?.headers as Record<string, string>;
}

describe("HttpSyncTransport", () => {
  it("sends the bearer token and the protocol version with every request", async () => {
    const fetch_fn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        jsonResponse({ ledger_id: "l1", rows: [], next_since: 4, has_more: false })
      );
    const transport = new HttpSyncTransport({
      api_base_url: API_BASE_URL,
      auth: fakeAuth(),
      fetch_fn,
    });

    const pull_page = await transport.pull(4, 500);

    expect(pull_page.next_since).toBe(4);
    expect(fetch_fn.mock.calls[0][0]).toBe(`${API_BASE_URL}/sync/pull?since=4&limit=500`);
    expect(requestHeaders(fetch_fn, 0)).toEqual({
      Authorization: "Bearer access-1",
      "X-Atoikura-Sync-Protocol": "1",
    });
  });

  it("retries once with a refreshed token after a 401", async () => {
    const fetch_fn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ code: "UNAUTHORIZED", message: "x" }, 401))
      .mockResolvedValueOnce(jsonResponse({ results: [{ id: "r1", status: "applied", seq: 9 }] }));
    const auth = fakeAuth();
    const transport = new HttpSyncTransport({ api_base_url: API_BASE_URL, auth, fetch_fn });

    const push_results = await transport.push([
      { collection: "daily_notes", id: "r1", fields: {} },
    ]);

    expect(push_results).toEqual([{ id: "r1", status: "applied", seq: 9 }]);
    expect(auth.refresh_calls).toEqual(["access-1"]);
    expect(requestHeaders(fetch_fn, 1).Authorization).toBe("Bearer access-2");
  });

  it("maps statuses to the errors the engine acts on", async () => {
    const cases: [Response | Error, unknown][] = [
      [jsonResponse({ code: "UNAUTHORIZED", message: "x" }, 401), SyncAuthError],
      [
        jsonResponse({ code: "UPDATE_REQUIRED", message: "アプリを最新版に更新してください" }, 426),
        SyncUpdateRequiredError,
      ],
      [jsonResponse({ code: "PAYLOAD_TOO_LARGE", message: "too large" }, 413), SyncClientError],
      [jsonResponse({ code: "INTERNAL_SERVER_ERROR", message: "boom" }, 503), SyncNetworkError],
      [new TypeError("Failed to fetch"), SyncNetworkError],
    ];
    for (const [fetch_outcome, expected_error] of cases) {
      const fetch_fn = vi.fn<typeof fetch>(async () => {
        if (fetch_outcome instanceof Error) throw fetch_outcome;
        return fetch_outcome.clone();
      });
      const transport = new HttpSyncTransport({
        api_base_url: API_BASE_URL,
        auth: fakeAuth(),
        fetch_fn,
      });
      await expect(transport.push([])).rejects.toBeInstanceOf(expected_error);
    }
  });

  it("reports a refused ledger command with the server's message", async () => {
    const fetch_fn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        jsonResponse({ code: "CONFLICT", message: "同名の大分類が既に存在します" }, 409)
      );
    const transport = new HttpSyncTransport({
      api_base_url: API_BASE_URL,
      auth: fakeAuth(),
      fetch_fn,
    });
    const ledger_commands = createLedgerCommands((method, path, request_body) =>
      transport.sendCommand(method, path, request_body)
    );

    const command_error = await ledger_commands
      .createCategoryGroup({ name: "食費", statement_type_code: "food" })
      .catch((caught_error: unknown) => caught_error);

    expect(command_error).toBeInstanceOf(CommandRejectedError);
    expect(command_error).toMatchObject({
      http_status: 409,
      error_code: "CONFLICT",
      message: "同名の大分類が既に存在します",
    });
    expect(fetch_fn.mock.calls[0][0]).toBe(`${API_BASE_URL}/ledger/category-groups`);
    expect(JSON.parse(String(fetch_fn.mock.calls[0][1]?.body))).toEqual({
      name: "食費",
      statement_type_code: "food",
    });
  });

  it("encodes record IDs in command paths", async () => {
    const fetch_fn = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        collection: "savings_goals",
        id: "g",
        owner_id: 7,
        seq: 3,
        deleted: true,
        data: {},
      })
    );
    const transport = new HttpSyncTransport({
      api_base_url: API_BASE_URL,
      auth: fakeAuth(),
      fetch_fn,
    });
    const ledger_commands = createLedgerCommands((method, path, request_body) =>
      transport.sendCommand(method, path, request_body)
    );

    await ledger_commands.deleteSavingsGoal("../budget?x=1");

    expect(fetch_fn.mock.calls[0][0]).toBe(
      `${API_BASE_URL}/ledger/savings-goals/..%2Fbudget%3Fx%3D1`
    );
    expect(fetch_fn.mock.calls[0][1]?.method).toBe("DELETE");
  });
});
