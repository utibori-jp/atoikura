// JSON shapes of the sync API (docs/local-first/sync-api.yaml).

export interface PushFieldValue {
  value: unknown;
  hlc: string;
}

export interface PushChange {
  collection: string;
  id: string;
  fields: Record<string, PushFieldValue>;
  deleted_hlc?: string;
}

export interface PushResult {
  id: string;
  status: "applied" | "rejected";
  seq?: number;
  superseded?: string[];
  merged_into?: string;
  reason?: string;
  message?: string;
}

export interface PulledRow {
  collection: string;
  id: string;
  owner_id: number;
  seq: number;
  deleted: boolean;
  data: Record<string, unknown>;
  field_hlc?: Record<string, string>;
}

export interface PullPage {
  ledger_id: string;
  rows: PulledRow[];
  next_since: number;
  has_more: boolean;
}

export const MAX_CHANGES_PER_PUSH = 500;
// The server accepts 1 MiB; the margin covers the request envelope.
export const MAX_PUSH_BODY_BYTES = 900 * 1024;
