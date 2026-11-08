// Errors raised by the sync layer. The engine maps them to its status; screens
// show their Japanese messages.

// The request didn't reach the server or the server failed (5xx). Retried with backoff.
export class SyncNetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SyncNetworkError";
  }
}

// No valid session: the user has to log in again.
export class SyncAuthError extends Error {
  constructor(message = "再度ログインしてください") {
    super(message);
    this.name = "SyncAuthError";
  }
}

// The server no longer speaks this app's sync protocol (426).
export class SyncUpdateRequiredError extends Error {
  constructor(message = "アプリを最新版に更新してください") {
    super(message);
    this.name = "SyncUpdateRequiredError";
  }
}

// The server refused a whole push or pull request (400/413). This is a client
// bug, so the engine stops instead of retrying.
export class SyncClientError extends Error {
  readonly http_status: number;
  constructor(http_status: number, message: string) {
    super(message);
    this.name = "SyncClientError";
    this.http_status = http_status;
  }
}

// A ledger command the server refused (400/403/404/409), with a message for the user.
export class CommandRejectedError extends Error {
  readonly http_status: number;
  readonly error_code: string;
  constructor(http_status: number, error_code: string, message: string) {
    super(message);
    this.name = "CommandRejectedError";
    this.http_status = http_status;
    this.error_code = error_code;
  }
}

// A local write before the first sync told the device which ledger it belongs to.
export class SyncNotReadyError extends Error {
  constructor(message = "初回の同期が完了していません") {
    super(message);
    this.name = "SyncNotReadyError";
  }
}

// An online-only edit attempted while offline.
export class OfflineError extends Error {
  constructor(message = "オフラインのため変更できません") {
    super(message);
    this.name = "OfflineError";
  }
}
