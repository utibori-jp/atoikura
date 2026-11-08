import type { AccessTokenProvider } from "./authSession";
import {
  CommandRejectedError,
  SyncAuthError,
  SyncClientError,
  SyncNetworkError,
  SyncUpdateRequiredError,
} from "./errors";
import type { PullPage, PulledRow, PushChange, PushResult } from "./wire";

// HTTP side of the sync engine: push, pull and the online-only ledger commands.
// Every request carries the access token in the Authorization header and the
// sync protocol version; a 401 is retried once with a refreshed token.

export const SYNC_PROTOCOL_HEADER = "X-Atoikura-Sync-Protocol";
export const SYNC_PROTOCOL_VERSION = 2;

export type CommandMethod = "POST" | "PUT" | "DELETE";
export type JsonMethod = CommandMethod | "GET";

export interface SyncTransport {
  push(changes: PushChange[]): Promise<PushResult[]>;
  pull(since: number, limit: number): Promise<PullPage>;
  // Sends a ledger command and returns the row it wrote.
  sendCommand(method: CommandMethod, path: string, request_body?: unknown): Promise<PulledRow>;
  // Sends an online-only request (the household commands) and returns its JSON
  // body, or null for 204 No Content.
  sendJson(method: JsonMethod, path: string, request_body?: unknown): Promise<unknown>;
}

export interface HttpSyncTransportOptions {
  api_base_url: string;
  auth: AccessTokenProvider;
  fetch_fn?: typeof fetch;
}

interface ErrorBody {
  code: string;
  message: string;
}

async function readErrorBody(response: Response): Promise<ErrorBody> {
  try {
    const error_body = (await response.json()) as { code?: unknown; message?: unknown };
    return {
      code: typeof error_body.code === "string" ? error_body.code : "UNKNOWN",
      message:
        typeof error_body.message === "string"
          ? error_body.message
          : `サーバーがエラーを返しました (${response.status})`,
    };
  } catch {
    return { code: "UNKNOWN", message: `サーバーがエラーを返しました (${response.status})` };
  }
}

export class HttpSyncTransport implements SyncTransport {
  private readonly api_base_url: string;
  private readonly auth: AccessTokenProvider;
  private readonly fetch_fn: typeof fetch;

  constructor(options: HttpSyncTransportOptions) {
    this.api_base_url = options.api_base_url;
    this.auth = options.auth;
    this.fetch_fn = options.fetch_fn ?? ((input, init) => fetch(input, init));
  }

  private async sendOnce(
    method: string,
    path: string,
    access_token: string,
    request_body: unknown
  ): Promise<Response> {
    const request_headers: Record<string, string> = {
      Authorization: `Bearer ${access_token}`,
      [SYNC_PROTOCOL_HEADER]: String(SYNC_PROTOCOL_VERSION),
    };
    if (request_body !== undefined) request_headers["Content-Type"] = "application/json";
    try {
      return await this.fetch_fn(`${this.api_base_url}${path}`, {
        method,
        headers: request_headers,
        body: request_body === undefined ? undefined : JSON.stringify(request_body),
      });
    } catch {
      throw new SyncNetworkError("サーバーに接続できません");
    }
  }

  // Sends an authorized request. Auth and protocol failures become errors here;
  // other statuses are left to the caller.
  private async request(method: string, path: string, request_body?: unknown): Promise<Response> {
    const access_token = await this.auth.getAccessToken();
    let response = await this.sendOnce(method, path, access_token, request_body);
    if (response.status === 401) {
      const refreshed_access_token = await this.auth.refreshAccessToken(access_token);
      response = await this.sendOnce(method, path, refreshed_access_token, request_body);
      if (response.status === 401) throw new SyncAuthError();
    }
    if (response.status === 426) {
      throw new SyncUpdateRequiredError((await readErrorBody(response)).message);
    }
    if (response.status >= 500) {
      throw new SyncNetworkError((await readErrorBody(response)).message);
    }
    return response;
  }

  private async requireSyncSuccess(response: Response): Promise<void> {
    if (response.ok) return;
    // 400 and 413 for a whole push or pull mean the client sent something it
    // shouldn't have; retrying won't help.
    throw new SyncClientError(response.status, (await readErrorBody(response)).message);
  }

  async push(changes: PushChange[]): Promise<PushResult[]> {
    const response = await this.request("POST", "/sync/push", { changes });
    await this.requireSyncSuccess(response);
    const push_body = (await response.json()) as { results: PushResult[] };
    return push_body.results;
  }

  async pull(since: number, limit: number): Promise<PullPage> {
    const query = new URLSearchParams({ since: String(since), limit: String(limit) });
    const response = await this.request("GET", `/sync/pull?${query.toString()}`);
    await this.requireSyncSuccess(response);
    return (await response.json()) as PullPage;
  }

  async sendCommand(
    method: CommandMethod,
    path: string,
    request_body?: unknown
  ): Promise<PulledRow> {
    const response = await this.request(method, path, request_body);
    if (!response.ok) {
      const error_body = await readErrorBody(response);
      throw new CommandRejectedError(response.status, error_body.code, error_body.message);
    }
    return (await response.json()) as PulledRow;
  }

  async sendJson(method: JsonMethod, path: string, request_body?: unknown): Promise<unknown> {
    const response = await this.request(method, path, request_body);
    if (!response.ok) {
      const error_body = await readErrorBody(response);
      throw new CommandRejectedError(response.status, error_body.code, error_body.message);
    }
    if (response.status === 204) return null;
    return response.json();
  }
}
