import { AuthSession, type KeyValueStorage } from "./authSession";
import { SyncAuthError } from "./errors";

const API_BASE_URL = "http://api.test";
const NOW_MS = Date.UTC(2026, 9, 30, 12);

function memoryStorage(): KeyValueStorage & { entries: Map<string, string> } {
  const entries = new Map<string, string>();
  return {
    entries,
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => void entries.set(key, value),
    removeItem: (key) => void entries.delete(key),
  };
}

function tokenPairResponse(token_suffix: string, access_lifetime_ms = 3_600_000): Response {
  return new Response(
    JSON.stringify({
      access_token: `access-${token_suffix}`,
      access_token_expires_at: new Date(NOW_MS + access_lifetime_ms).toISOString(),
      refresh_token: `refresh-${token_suffix}`,
      refresh_token_expires_at: new Date(NOW_MS + 90 * 86_400_000).toISOString(),
      user_id: 7,
    }),
    { status: 200 }
  );
}

function createSession(fetch_fn: typeof fetch, storage = memoryStorage()) {
  const lock_calls: string[] = [];
  const auth_session = new AuthSession({
    api_base_url: API_BASE_URL,
    fetch_fn,
    storage,
    now: () => NOW_MS,
    runExclusive: (lock_name, task) => {
      lock_calls.push(lock_name);
      return task();
    },
  });
  return { auth_session, storage, lock_calls };
}

describe("AuthSession", () => {
  it("keeps the refresh token in storage and the access token in memory only", async () => {
    const fetch_fn = vi.fn<typeof fetch>().mockResolvedValue(tokenPairResponse("1"));
    const { auth_session, storage } = createSession(fetch_fn);

    expect(await auth_session.login("a@example.com", "pw")).toBe(7);

    expect([...storage.entries.values()]).not.toContain("access-1");
    expect(storage.entries.get("atoikura.refresh_token")).toBe("refresh-1");
    expect(await auth_session.getAccessToken()).toBe("access-1");
    expect(fetch_fn).toHaveBeenCalledTimes(1);
    const [login_url, login_init] = fetch_fn.mock.calls[0];
    expect(login_url).toBe(`${API_BASE_URL}/auth/token`);
    expect(login_init?.credentials).toBeUndefined();
  });

  it("refreshes once for concurrent callers, under the cross-tab lock", async () => {
    const storage = memoryStorage();
    storage.setItem("atoikura.refresh_token", "refresh-old");
    storage.setItem("atoikura.user_id", "7");
    const fetch_fn = vi.fn<typeof fetch>().mockResolvedValue(tokenPairResponse("2"));
    const { auth_session, lock_calls } = createSession(fetch_fn, storage);

    const access_tokens = await Promise.all([
      auth_session.getAccessToken(),
      auth_session.getAccessToken(),
      auth_session.refreshAccessToken("stale"),
    ]);

    expect(access_tokens).toEqual(["access-2", "access-2", "access-2"]);
    expect(fetch_fn).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetch_fn.mock.calls[0][1]?.body))).toEqual({
      refresh_token: "refresh-old",
    });
    expect(lock_calls).toEqual(["atoikura-auth-refresh"]);
    expect(storage.entries.get("atoikura.refresh_token")).toBe("refresh-2");
  });

  it("refreshes an access token that is about to expire", async () => {
    const fetch_fn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(tokenPairResponse("1", 30_000))
      .mockResolvedValueOnce(tokenPairResponse("2"));
    const { auth_session } = createSession(fetch_fn);
    await auth_session.login("a@example.com", "pw");

    expect(await auth_session.getAccessToken()).toBe("access-2");
  });

  it("drops the session when the refresh token is refused", async () => {
    const storage = memoryStorage();
    storage.setItem("atoikura.refresh_token", "refresh-revoked");
    storage.setItem("atoikura.user_id", "7");
    const fetch_fn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ code: "UNAUTHORIZED", message: "再度ログインしてください" }),
          { status: 401 }
        )
      );
    const { auth_session } = createSession(fetch_fn, storage);

    await expect(auth_session.getAccessToken()).rejects.toBeInstanceOf(SyncAuthError);
    expect(auth_session.hasSession()).toBe(false);
  });

  it("clears the local session on logout even when offline", async () => {
    const storage = memoryStorage();
    storage.setItem("atoikura.refresh_token", "refresh-1");
    storage.setItem("atoikura.user_id", "7");
    const fetch_fn = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("offline"));
    const { auth_session } = createSession(fetch_fn, storage);

    await auth_session.logout();

    expect(storage.entries.size).toBe(0);
    expect(JSON.parse(String(fetch_fn.mock.calls[0][1]?.body))).toEqual({
      refresh_token: "refresh-1",
    });
  });
});
