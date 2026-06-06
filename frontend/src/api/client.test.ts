import { beforeEach, describe, expect, it, vi } from "vitest";
import { token_store, AuthError, api } from "./client";

beforeEach(() => {
  sessionStorage.clear();
});

describe("token_store", () => {
  it("save stores the token and load retrieves it", () => {
    token_store.save("my.jwt.token");
    expect(token_store.load()).toBe("my.jwt.token");
  });

  it("load returns null when nothing is stored", () => {
    expect(token_store.load()).toBeNull();
  });

  it("clear removes the stored token", () => {
    token_store.save("some.token");
    token_store.clear();
    expect(token_store.load()).toBeNull();
  });

  it("second save overwrites the first", () => {
    token_store.save("first.token");
    token_store.save("second.token");
    expect(token_store.load()).toBe("second.token");
  });
});

describe("api requests", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("attaches Bearer token when one is stored", async () => {
    token_store.save("stored.jwt");
    const mock_fetch = vi.mocked(fetch);
    mock_fetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 1, email: "a@b.com", display_name: null, last_login_at: null }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await api.getCurrentUser();

    const [, init] = mock_fetch.mock.calls[0];
    const headers = init?.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer stored.jwt");
  });

  it("sends no Authorization header when no token is stored", async () => {
    const mock_fetch = vi.mocked(fetch);
    mock_fetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ token: "t", id: 1, email: "a@b.com", display_name: null, last_login_at: null }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await api.login("a@b.com", "password");

    const [, init] = mock_fetch.mock.calls[0];
    const headers = init?.headers as Record<string, string>;
    expect(headers["Authorization"]).toBeUndefined();
  });

  it("throws AuthError on 401", async () => {
    token_store.save("expired.jwt");
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ code: "UNAUTHORIZED", message: "認証情報が不正です" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(api.getCurrentUser()).rejects.toBeInstanceOf(AuthError);
  });

  it("throws Error with server message on non-401 error", async () => {
    token_store.save("valid.jwt");
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ code: "BAD_REQUEST", message: "year_monthはYYYY-MM形式で指定してください" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(api.getDailyCumulative("bad-format")).rejects.toThrow(
      "year_monthはYYYY-MM形式で指定してください",
    );
  });

  it("login sends email and password as JSON body", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ token: "jwt.token.here", id: 1, email: "u@example.com", display_name: null, last_login_at: null }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await api.login("u@example.com", "mypassword");

    const [, init] = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse(init?.body as string);
    expect(body).toEqual({ email: "u@example.com", password: "mypassword" });
    expect(init?.method).toBe("POST");
  });
});
