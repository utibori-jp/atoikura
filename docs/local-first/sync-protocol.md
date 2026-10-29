# Local-first sync protocol (push/pull)

Status: **draft for review** (issue #198). Data model: [`design.md`](design.md).
OpenAPI contract: [`sync-api.yaml`](sync-api.yaml).

---

## 1. Overview

```
 device                                     server (Go)
 ──────                                     ───────────
 offline write ─► SQLite + outbox
                   │ push (batch)  ───────►  authorize, validate, LWW per field, assign seq
                   │ ◄────── results  ─────  applied / rejected per change
 online edit ─────────── REST command ────►  validate, commit, assign seq   (online-only data)
                   │ pull since cursor ────►  every visible row with seq > cursor
                   └ ◄────── changes  ─────  (paged; offline-writable data and cache of online-only data)
 merge by HLC ─► SQLite, recompute derived values
```

- **Push** carries offline-writable collections only: `journal_entries`,
  `daily_notes` and `monthly_review_notes`.
- **REST commands** write online-only collections. Their contracts are defined
  in Step 5, as ledger-scoped versions of today's endpoints.
- **Pull** returns both kinds. A single cursor per device covers everything the
  user may see.

---

## 2. Sequencing (Step 5)

- There is one global sequence, `sync_seq`. Every insert, update or tombstone of
  a synced row, whether it comes from push, a REST command or server-side
  posting, sets `seq = nextval('sync_seq')` in the same transaction.
- Each synced table has an index on `(ledger_id, seq)`.
- Computed views (`allowance_totals`) get a `seq` whenever they are recomputed.
- **Commit-order caveat:** a transaction can take a lower `seq` but commit after
  a higher one. A pull in between would then skip it forever. To prevent this,
  pull may only return rows with `seq ≤` the **safe watermark**: the highest `seq`
  below which no transaction is still in flight.
- **Chosen approach (Step 5a):** the watermark is enforced on the write side.
  Every writer takes a transaction-level advisory lock
  (`pg_advisory_xact_lock`) right before `nextval('lf.sync_seq')` and holds it
  until commit. Seq allocation and commit are therefore serialized, so commit
  order equals seq order, and every committed row is below the watermark. Pull
  needs no extra filter. The lock covers only the tail of each write transaction
  (allocate seq, write, commit); validation and loading happen before it. All
  writers must allocate seq through the same helper
  (`repository.txAllocator.allocateSeq`). The integration test
  `TestPull_WatermarkUnderConcurrentWriters` pulls while concurrent writers push,
  and it fails when the lock is removed. REST commands (Step 5b), monthly
  postings and `allowance_totals` recomputation allocate seq the same way.

---

## 3. Push

`POST /sync/push`, with up to **500 changes** and a body of at most **1 MiB**.

Each change carries:
- `collection` and `id`
- `fields`: a map of field name to `{ value, hlc }`, where `value` is plain JSON
- optionally `deleted_hlc`, which turns the record into a tombstone

There is **no** `owner_id` or `ledger_id` in the request. Both are derived from
the token.

### 3.1 Validation (in this order; the first failure rejects the change)

| Check | Reason code |
|---|---|
| `collection` is pushable | `UNKNOWN_COLLECTION` |
| every field name is on the collection's allowlist | `UNKNOWN_FIELD` |
| each change is ≤ 16 KiB as encoded JSON | `TOO_LARGE` |
| every HLC is well-formed and ≤ server now + 5 min | `CLOCK_SKEW` |
| the record (`id`) exists and the caller is not allowed to write it: it is not the caller's, and it is not a shared-ledger recurring posting in the caller's ledger | `FORBIDDEN` |
| the field values pass content validation (formats, positive amounts; `wallet` ∈ {ledger, allowance}, with `allowance` only in household mode; `category_id` belongs to the caller's ledger, and may be deleted) | `INVALID` |
| `wallet` changes on an existing record (moving an entry between the shared ledger and an allowance) | `IMMUTABLE` |
| a new record omits a required field (for journal entries: `wallet`, `transaction_date`, `amount`, `is_excluded`, `category_id`) | `INVALID` |

String length limits (`item` ≤ 100 characters, notes ≤ 500 characters) are content
validation, so they return `INVALID` with the same Japanese message as the client.
A change also carries the UUID `id`; a malformed `id` is `INVALID`.

`FORBIDDEN` does not reveal whether the record exists.

### 3.2 Applying a valid change (one transaction per change)

1. If the record is new, insert it with `owner_id` and `ledger_id` taken from
   the token.
   - If this would create a second daily note (or monthly review note) for the
     same natural key, merge the change into the existing row instead: the
     texts are concatenated, and the result reports `merged_into: <existing
     id>`.
2. If `deleted_hlc` is present and the record is not yet deleted, tombstone it.
3. If the record is a tombstone, ignore every field write and report those
   fields as `superseded`.
4. For each field, store it if `incoming.hlc > field_hlc[field]`. Otherwise
   report it as `superseded`.
5. If anything changed, assign a new `seq`. If the change touched an allowance
   entry, recompute that member's `allowance_totals` for the affected months.

The result for each change is
`{ id, status: "applied" | "rejected", seq?, superseded?, merged_into?, reason? }`.

- Being superseded is **not** an error. The winning value arrives on the next
  pull.
- One rejected change does not fail the other changes in the batch.
- Errors in the whole request return `400` or `413`, and nothing is applied.

---

## 4. Pull

`GET /sync/pull?since=<seq>&limit=<n>`

- **Visibility is derived from the token**: the caller's current ledger, and
  within it, these rows:
  - every online-only row, except allowance-wallet `recurring_expenses` rows
    that belong to other members
  - `journal_entries` where `wallet = 'ledger'`, or the caller is the owner
  - notes the caller owns
  - `allowance_totals` for every member
- The response lists the rows with `since < seq ≤ watermark`, ordered by `seq`.
  Each row is complete (all fields, plus `field_hlc` for offline-writable
  collections). Tombstones are included.
- The response includes `next_since` and `has_more`. `limit` defaults to 500
  and is capped at 1000.
- It also includes `ledger_id`. If it differs from the one the device has stored
  (the user joined or left a household), the device **resets its cursor to 0**,
  clears the cached data of the old ledger, and pulls again.
  Its pending outbox entries are pushed first.

---

## 5. Client engine (Step 6)

Local tables:
- one table per synced collection, holding plain columns plus `field_hlc`
- `_shadow (collection, id, field, value, hlc)`: the last server-confirmed
  value of each field that has a pending local change
- `_outbox (collection, id, field | '__deleted', hlc)`: pending changes,
  coalesced per record and field
- `_sync_state (ledger_id, since, device_id)`

The sync loop runs on start, when the device comes back online, when the app
returns to the foreground, every N minutes while open, and after local writes
(debounced):

1. **Push** the outbox in batches.
   - `applied`: drop the outbox entries and their shadows. If `merged_into` is
     present, re-key the local row to that ID.
   - `rejected`: revert each field to its shadow (or remove a record the server
     never accepted), drop the outbox entry, and show the reason to the user.
2. **Pull** until `has_more` is false. For each row:
   - Online-only collections: replace the cached row.
   - Offline-writable collections: for each field, keep the local value if it
     has a pending change with a higher HLC; otherwise take the remote value.
3. **Recompute** the derived values ("あといくら", charts, breakdowns) for the
   touched months.

Online-only edits call REST. On success, the device pulls immediately so that
its cache reflects the change. While offline, these controls are disabled.

Retries:
- Network errors and `5xx` responses back off exponentially (capped, with
  jitter).
- `401` triggers re-authentication.
- A `400` or `413` for the whole request is a client bug: the engine stops and
  reports it.

### 5.1 Implementation notes (Step 6, `frontend/src/sync/`)

- **Atomic steps.** Each local write, each set of push results and each pull
  page is one SQLite transaction. A pull page and its new cursor commit
  together, so an interrupted pull resumes from the last applied page.
- **In-flight edits.** An outbox entry is dropped only if it still holds the HLC
  that was sent. A field edited again while its push was in flight stays
  pending, and its shadow becomes the value the server accepted.
- **Lost responses.** If the push response never arrives, the next sync sends
  the same changes again. The server finds them already stored (equal HLCs are
  superseded), so nothing is duplicated.
- **Rejections** are written to `_sync_rejections` (schema v2) and stay there
  until the user dismisses them. A rejected record the server never accepted
  (`seq` is null) is removed. Otherwise each rejected field is restored from
  its shadow, and a rejected deletion brings the record back.
- **`merged_into`.** The local record takes the existing ID, together with its
  outbox and shadow entries. If a row with that ID is already on the device,
  the local duplicate is dropped.
- **Pull merge.** A field keeps its local value only while it has a pending
  change whose HLC is greater than the pulled `field_hlc`. That pulled value
  becomes the field's shadow. A pulled tombstone always wins.
- **Ledger and user changes.** `_sync_state.user_id` (schema v2) binds the
  database to one user. If another user signs in, everything is wiped. If the
  ledger changes, the engine pushes the outbox, clears the synced tables and
  pulls from 0.
- **Tokens.** The access token stays in memory. The refresh token and the user
  ID are kept in `localStorage`, so the app can sync after a restart without the
  password; the strict CSP is what protects them. Refreshes are serialized
  across tabs with the Web Lock `atoikura-auth-refresh`, and each refresh
  re-reads the stored token inside the lock. Two tabs therefore never present
  the same rotated token, which would trip reuse detection.
- **Reset and re-sync.** If a migration fails, or the database is newer than
  the app, the worker keeps the old database open as a recoverable handle
  (`MIGRATION_FAILED` / `SCHEMA_TOO_NEW`). The app pushes the outbox, recreates
  the database, and pulls everything again. If the push fails, nothing is
  deleted.

---

## 6. Security test matrix (Step 5, required)

| Case | Expected |
|---|---|
| B pushes a change to A's journal entry, or tombstones it | `FORBIDDEN`; A's entry is unchanged |
| B pushes a new record with an `id` already used by A | `FORBIDDEN` |
| B pushes an entry with a `category_id` from another ledger | `INVALID` |
| A change that contains `owner_id` or `ledger_id` among its fields | `UNKNOWN_FIELD` (they are not on the allowlist); ownership always comes from the token |
| A household member pushes into another member's allowance entry | `FORBIDDEN` |
| B pulls, where B is not in A's ledger | none of A's rows are returned |
| A household member pulls | other members' allowance entries and allowance recurring expenses are absent; `allowance_totals` are present |
| A member left the household | the next pull returns their new ledger only |
| An oversized value, an unknown field or collection, an HLC far in the future, or invalid contents | rejected with the matching reason |
| Body too large or too many changes | `413` / `400`; nothing applied |
| Concurrent writers (push and REST) | no row is skipped by pull (watermark test) |
