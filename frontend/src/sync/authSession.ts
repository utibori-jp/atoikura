import { SyncAuthError, SyncNetworkError } from "./errors";

// Token session for the sync API (docs/local-first/sync-api.yaml, /auth/*).
//
// The access token (1 hour) stays in memory only. The refresh token (90 days)
// has to survive restarts so that an offline-first app reopened days later can
// sync without a password, so it is kept in localStorage; the strict CSP is
// what protects it from injected scripts. Tokens travel only in the
// Authorization header or a JSON body, never in cookies.
//
// Refresh tokens rotate on every use, and presenting a used one revokes the
// whole family. Refreshes are therefore serialized across tabs with a Web Lock,
// and each one re-reads the stored token inside the lock, so two tabs never
// present the same refresh token.

const REFRESH_TOKEN_STORAGE_KEY = "atoikura.refresh_token";
const USER_ID_STORAGE_KEY = "atoikura.user_id";
const REFRESH_LOCK_NAME = "atoikura-auth-refresh";
// Refresh a little before expiry so a request doesn't start with a dying token.
const ACCESS_TOKEN_EXPIRY_MARGIN_MS = 60_000;

interface TokenPairResponse {
  access_token: string;
  access_token_expires_at: string;
  refresh_token: string;
  refresh_token_expires_at: string;
  user_id: number;
}

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type ExclusiveRunner = <TResult>(
  lock_name: string,
  task: () => Promise<TResult>
) => Promise<TResult>;

function runWithWebLock<TResult>(
  lock_name: string,
  task: () => Promise<TResult>
): Promise<TResult> {
  if (typeof navigator === "undefined" || !navigator.locks) return task();
  return navigator.locks.request(lock_name, task) as Promise<TResult>;
}

export interface AccessTokenProvider {
  getAccessToken(): Promise<string>;
  // Called after the server refused stale_access_token with 401.
  refreshAccessToken(stale_access_token: string): Promise<string>;
}

export interface AuthSessionOptions {
  api_base_url: string;
  fetch_fn?: typeof fetch;
  storage?: KeyValueStorage;
  runExclusive?: ExclusiveRunner;
  now?: () => number;
}

async function readErrorMessage(response: Response, fallback_message: string): Promise<string> {
  try {
    const error_body = (await response.json()) as { message?: unknown };
    return typeof error_body.message === "string" ? error_body.message : fallback_message;
  } catch {
    return fallback_message;
  }
}

export class AuthSession implements AccessTokenProvider {
  private readonly api_base_url: string;
  private readonly fetch_fn: typeof fetch;
  private readonly storage: KeyValueStorage;
  private readonly runExclusive: ExclusiveRunner;
  private readonly now: () => number;
  private access_token: string | null = null;
  private access_token_expires_ms = 0;
  private refresh_in_flight: Promise<string> | null = null;

  constructor(options: AuthSessionOptions) {
    this.api_base_url = options.api_base_url;
    this.fetch_fn = options.fetch_fn ?? ((input, init) => fetch(input, init));
    this.storage = options.storage ?? localStorage;
    this.runExclusive = options.runExclusive ?? runWithWebLock;
    this.now = options.now ?? Date.now;
  }

  get user_id(): number | null {
    const stored_user_id = this.storage.getItem(USER_ID_STORAGE_KEY);
    if (stored_user_id === null) return null;
    const parsed_user_id = Number(stored_user_id);
    return Number.isSafeInteger(parsed_user_id) ? parsed_user_id : null;
  }

  hasSession(): boolean {
    return this.storage.getItem(REFRESH_TOKEN_STORAGE_KEY) !== null && this.user_id !== null;
  }

  private async postJson(path: string, request_body: unknown): Promise<Response> {
    try {
      return await this.fetch_fn(`${this.api_base_url}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request_body),
      });
    } catch {
      throw new SyncNetworkError("サーバーに接続できません");
    }
  }

  private async storeTokenPair(response: Response): Promise<string> {
    const token_pair = (await response.json()) as TokenPairResponse;
    this.storage.setItem(REFRESH_TOKEN_STORAGE_KEY, token_pair.refresh_token);
    this.storage.setItem(USER_ID_STORAGE_KEY, String(token_pair.user_id));
    this.access_token = token_pair.access_token;
    this.access_token_expires_ms = Date.parse(token_pair.access_token_expires_at);
    return token_pair.access_token;
  }

  private clearSession(): void {
    this.storage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
    this.storage.removeItem(USER_ID_STORAGE_KEY);
    this.access_token = null;
    this.access_token_expires_ms = 0;
  }

  // Logs in and returns the user ID. A failed login keeps no session.
  async login(email: string, password: string, device_name?: string): Promise<number> {
    const response = await this.postJson("/auth/token", { email, password, device_name });
    if (response.status === 401 || response.status === 400) {
      throw new SyncAuthError(await readErrorMessage(response, "認証情報が不正です"));
    }
    if (!response.ok) {
      throw new SyncNetworkError(await readErrorMessage(response, "ログインに失敗しました"));
    }
    this.clearSession();
    await this.storeTokenPair(response);
    return this.user_id as number;
  }

  async getAccessToken(): Promise<string> {
    if (
      this.access_token !== null &&
      this.access_token_expires_ms - this.now() > ACCESS_TOKEN_EXPIRY_MARGIN_MS
    ) {
      return this.access_token;
    }
    return this.refresh(this.access_token);
  }

  refreshAccessToken(stale_access_token: string): Promise<string> {
    return this.refresh(stale_access_token);
  }

  private refresh(stale_access_token: string | null): Promise<string> {
    // Another request in this tab may already have replaced the stale token.
    if (this.access_token !== null && this.access_token !== stale_access_token) {
      return Promise.resolve(this.access_token);
    }
    this.refresh_in_flight ??= this.runExclusive(REFRESH_LOCK_NAME, () =>
      this.refreshUnderLock()
    ).finally(() => {
      this.refresh_in_flight = null;
    });
    return this.refresh_in_flight;
  }

  private async refreshUnderLock(): Promise<string> {
    const refresh_token = this.storage.getItem(REFRESH_TOKEN_STORAGE_KEY);
    if (refresh_token === null) {
      this.clearSession();
      throw new SyncAuthError();
    }
    const response = await this.postJson("/auth/refresh", { refresh_token });
    if (response.status === 401 || response.status === 400) {
      // Expired, revoked or reused: only a new login helps. Another tab may have
      // rotated the token meanwhile, so only clear it if it is still ours.
      if (this.storage.getItem(REFRESH_TOKEN_STORAGE_KEY) === refresh_token) this.clearSession();
      throw new SyncAuthError(await readErrorMessage(response, "再度ログインしてください"));
    }
    if (!response.ok) {
      throw new SyncNetworkError(
        await readErrorMessage(response, "サーバーでエラーが発生しました")
      );
    }
    return this.storeTokenPair(response);
  }

  // Revokes this device's refresh token family. The local session is cleared
  // even when the server can't be reached.
  async logout(): Promise<void> {
    const refresh_token = this.storage.getItem(REFRESH_TOKEN_STORAGE_KEY);
    this.clearSession();
    if (refresh_token === null) return;
    try {
      await this.postJson("/auth/logout", { refresh_token });
    } catch {
      // Offline: the token expires on its own.
    }
  }
}
