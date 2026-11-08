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
  ledger_id: string;
  owner_id: number;
  seq: number;
  deleted: boolean;
  data: Record<string, unknown>;
  field_hlc?: Record<string, string>;
}

// A pull page names the ledgers it covers: the personal ledger, the attached
// household (null when none) and archives, all in ledger_ids.
export interface PullPage {
  ledger_ids: string[];
  personal_ledger_id: string;
  household_ledger_id: string | null;
  rows: PulledRow[];
  next_since: number;
  has_more: boolean;
}

export const MAX_CHANGES_PER_PUSH = 500;
// The server accepts 1 MiB; the margin covers the request envelope.
export const MAX_PUSH_BODY_BYTES = 900 * 1024;
