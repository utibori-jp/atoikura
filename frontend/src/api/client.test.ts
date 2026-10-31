import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SyncAuthError } from "../sync/errors";
import { AuthError, api, setApiAccessTokenProvider } from "./client";

describe("api requests", () => {
  let mock_fetch: ReturnType<typeof vi.fn>;
  const refresh_calls: string[] = [];

  beforeEach(() => {
    mock_fetch = vi.fn();
    vi.stubGlobal("fetch", mock_fetch);
    refresh_calls.length = 0;
    setApiAccessTokenProvider({
      getAccessToken: async () => "stored.jwt",
      refreshAccessToken: async (stale_access_token) => {
        refresh_calls.push(stale_access_token);
        return "refreshed.jwt";
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    setApiAccessTokenProvider(null);
  });

  function respond(body: unknown, status = 200): void {
    mock_fetch.mockResolvedValueOnce(
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      })
    );
  }

  function authorizationHeader(call_index: number): string | undefined {
    const [, init] = mock_fetch.mock.calls[call_index] as [string, RequestInit];
    return (init.headers as Record<string, string>)["Authorization"];
  }

  it("attaches the session's access token", async () => {
    respond({ id: 1, email: "a@b.com", display_name: null, last_login_at: null });

    await api.getCurrentUser();

    expect(authorizationHeader(0)).toBe("Bearer stored.jwt");
  });

  it("sends sign-up without a token", async () => {
    respond({ token: "t", id: 1, email: "a@b.com", display_name: null, last_login_at: null }, 201);

    await api.signup({ email: "a@b.com", password: "password123" });

    expect(authorizationHeader(0)).toBeUndefined();
  });

  it("retries once with a refreshed token after a 401", async () => {
    respond({ code: "UNAUTHORIZED", message: "認証情報が不正です" }, 401);
    respond({ id: 1, email: "a@b.com", display_name: null, last_login_at: null });

    await api.getCurrentUser();

    expect(refresh_calls).toEqual(["stored.jwt"]);
    expect(authorizationHeader(1)).toBe("Bearer refreshed.jwt");
  });

  it("throws AuthError when the refreshed token is refused too", async () => {
    respond({ code: "UNAUTHORIZED", message: "認証情報が不正です" }, 401);
    respond({ code: "UNAUTHORIZED", message: "認証情報が不正です" }, 401);

    await expect(api.getCurrentUser()).rejects.toBeInstanceOf(AuthError);
  });

  it("throws AuthError when there is no session", async () => {
    setApiAccessTokenProvider({
      getAccessToken: async () => {
        throw new SyncAuthError();
      },
      refreshAccessToken: async () => {
        throw new SyncAuthError();
      },
    });

    await expect(api.getCurrentUser()).rejects.toBeInstanceOf(AuthError);
    expect(mock_fetch).not.toHaveBeenCalled();
  });

  it("throws Error with server message on non-401 error", async () => {
    respond({ code: "BAD_REQUEST", message: "year_monthはYYYY-MM形式で指定してください" }, 400);

    await expect(api.getDailyCumulative("bad-format")).rejects.toThrow(
      "year_monthはYYYY-MM形式で指定してください"
    );
  });
});
