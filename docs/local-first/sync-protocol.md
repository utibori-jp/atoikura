# Local-first sync protocol (push/pull)

Status: **draft for review** (issue #198). Data model and encryption:
[`design.md`](design.md). OpenAPI contract: [`sync-api.yaml`](sync-api.yaml).

---

## 1. Overview

```
 device                                     sync server (Go)
 ──────                                     ────────────────
 local write ─► SQLite + outbox
                 │  push (batch)  ───────►  validate envelope, LWW per field,
                 │                          assign seq, store ciphertext
                 │  ◄─────── results  ────  applied / rejected per change
                 │  pull since cursor ────►  records with seq > cursor, visible to caller
                 └  ◄─────── changes  ────  (paged)
 merge by HLC ─► SQLite, recompute derived values
```

- The server **orders** changes and **enforces access**. It never merges plaintext.
- Clients **merge** by field-level LWW using HLCs. Applying the same change
  twice has no further effect, so retries are always safe.

---

## 2. Server storage (Step 5)

These are new tables in the existing PostgreSQL database. The legacy tables are
not touched.

```
sync_records
  id            uuid        primary key
  collection    text        not null
  owner_id      integer     not null  -> users.id
  household_id  uuid        null      -> households.id
  key_epoch     integer     not null
  deleted       boolean     not null default false
  deleted_hlc   text        null
  seq           bigint      not null          -- seq of the latest accepted change to this record
  created_at    timestamptz not null default now()

sync_fields
  record_id     uuid        -> sync_records.id
  field         text
  value         text        not null          -- base64url ciphertext
  hlc           text        not null
  seq           bigint      not null
  primary key (record_id, field)

sync_seq        sequence (global)
```

Indexes:
- `(owner_id, seq) WHERE household_id IS NULL`, for personal pulls
- `(household_id, seq)`, for household pulls
- `(record_id, seq)` on `sync_fields`

---

## 3. Collection policy (server-side, in code)

| Collection | Scope | Write policy | Append-only | Fields |
|---|---|---|---|---|
| `category_groups` | personal | owner | no | `name`, `statement_type_code`, `description` |
| `expense_categories` | personal | owner | no | `group_id`, `name`, `category_code`, `description` |
| `journal_entries` | personal | owner | no | `transaction_date`, `item`, `amount`, `is_excluded`, `category_id`, `note`, `recurring_expense_id`, `recurring_year_month` |
| `recurring_expenses` | personal | owner | no | `name`, `emoji`, `billing_day`, `amount`, `type`, `category_id` |
| `savings_goals` | personal | owner | no | `name`, `emoji`, `monthly_amount`, `target_amount`, `deadline`, `memo` |
| `savings_postings` | personal | owner | no | `goal_id`, `year_month`, `amount`, `kind` |
| `income_records` | personal | owner | no | `transaction_date`, `amount`, `name`, `income_type`, `emoji`, `note` |
| `base_income_settings` | personal | owner | no | `amount` |
| `budgets` | personal | owner | no | `monthly_budget`, `goal_text`, `goal_amount` |
| `surplus_allocations` | personal | owner | **yes** | `year_month`, `amount`, `destination`, `savings_goal_id` |
| `daily_notes` | personal | owner | no | `note` |
| `monthly_review_notes` | personal | owner | no | `note` |
| `member_monthly_summaries` | household | **owner** | no | `year_month`, `food`, `other`, `fixed`, `excluded` |
| `household_budgets` | household | member | no | `monthly_budget` |
| `household_savings_goals` | household | member | no | `name`, `emoji`, `target_amount`, `deadline`, `memo` |
| `household_savings_contributions` | household | **owner** | no | `goal_id`, `date`, `amount`, `note` |

---

## 4. Push

`POST /sync/push`, with up to **500 changes** and a body of at most **2 MiB**.

Each change carries:
- `collection` and `id`
- `household_id` (household collections only) and `key_epoch`
- `fields`: a map of field name to `{ value, hlc }`
- optionally `deleted_hlc`, which turns the record into a tombstone

There is **no** `owner_id` in the request.

### 4.1 Validation (in this order; the first failure rejects the change)

| Check | Reason code |
|---|---|
| `collection` is on the allowlist | `UNKNOWN_COLLECTION` |
| every field name is on the collection's allowlist | `UNKNOWN_FIELD` |
| each `value` is ≤ 8 KiB, and the change has no more fields than the allowlist | `TOO_LARGE` |
| every HLC (fields and `deleted_hlc`) is well-formed and ≤ server now + 5 min | `CLOCK_SKEW` |
| **New record:** personal scope requires `household_id` to be null. Household scope requires `household_id` to be one of the **token user's active memberships**, and `key_epoch` to exist for that household. `owner_id` is set to the token user. | `FORBIDDEN` |
| **Existing record:** `collection` and `household_id` match what is stored | `IMMUTABLE` |
| **Existing record:** the caller may write it. Owner policy requires caller = `owner_id`. Member policy requires the caller to be an active member of the stored `household_id` (personal records always use the owner policy). | `FORBIDDEN` |
| **Existing record**, append-only collection: no field updates | `IMMUTABLE` |

`FORBIDDEN` is also returned when the ID belongs to a record the caller cannot
see. The response does not say whether such a record exists.

### 4.2 Applying a valid change (one transaction per change)

1. If `deleted_hlc` is present and the record is not yet deleted, set
   `deleted = true` and `deleted_hlc`.
2. If the record is a tombstone, ignore every field write. These fields are
   reported as `superseded`.
3. For each field, store it if `incoming.hlc > stored.hlc` (or nothing is
   stored yet). Otherwise report it as `superseded`.
4. If anything changed, take `nextval(sync_seq)` and set it as the record's
   `seq` and the `seq` of each stored field.

The result for each change is either
`{ id, status: "applied", seq?, superseded: [...] }` or
`{ id, status: "rejected", reason }`.

- Being superseded is **not** an error. The client receives the winning value
  on its next pull.
- One rejected change does not fail the other changes in the batch.
- Errors in the whole request (bad JSON, over the size limits) return `400` or
  `413`, and nothing is applied.

---

## 5. Pull

`GET /sync/pull?scope=personal&since=<seq>&limit=<n>`
`GET /sync/pull?scope=household&household_id=<uuid>&since=<seq>&limit=<n>`

- **Visibility is derived from the token.**
  - `personal` returns the records where `owner_id` is the token user and
    `household_id` is null.
  - `household` requires the token user to be an active member of
    `household_id`, now. Otherwise the server returns `404`.
- The response lists the records with `seq > since`, ordered by `seq`. For each
  record it includes the envelope and only the fields with `seq > since`.
  Tombstones include `deleted_hlc`.
- The response includes `next_since` (the largest `seq` returned) and
  `has_more`. `limit` defaults to 500 and is capped at 1000.
- Cursors are kept **per scope**. A device that joins a household pulls that
  scope from `since=0`.

`GET /sync/scopes` lists the scopes the caller can pull: `personal`, plus each
active household with its current key epoch and the caller's key state. A
household where the caller's key state is `pending` has no key yet; the device
waits until another member wraps one for it (design §5.3).

---

## 6. Client engine (Step 6)

Local tables:
- one table per collection, holding plaintext columns
- `_field_clock (collection, id, field, hlc)`: the HLC of each field's current
  value
- `_shadow (collection, id, field, value, hlc)`: the last server-confirmed
  value of each field that has a pending local change
- `_outbox (collection, id, field | '__deleted', hlc)`: pending changes. Rows
  are coalesced per record and field, so only the latest local write is kept.
- `_cursor (scope, since)`: the pull cursor of each scope
- `_device (device_id)`: a random ID per install, used in HLCs

The sync loop runs on start, when the device comes back online, when the app
returns to the foreground, every N minutes while open, and after local writes
(debounced):

1. **Push** the outbox in batches.
   - `applied`: remove the entries from the outbox and drop their shadows.
   - `rejected`: revert each field to its shadow (or delete a record that the
     server never accepted), drop the outbox entry, and show the reason to the
     user.
2. **Pull** every scope until `has_more` is false, and merge each field:
   - **No local pending change:** apply the remote value if `remote.hlc >
     local.hlc`.
   - **Local pending change:** keep whichever HLC is higher. Fields with a
     custom merge (`daily_notes.note`) merge the two values and enqueue the
     result with a new HLC.
3. **Recompute** the derived values for the touched months. If the user belongs
   to a household, update their own `member_monthly_summaries` rows for those
   months; those updates are pushed on the next cycle.

Retries:
- Network errors and `5xx` responses back off exponentially (capped, with
  jitter).
- `401` triggers re-authentication.
- A `400` or `413` for the whole request is a client bug: the engine stops and
  reports it.

---

## 7. Security test matrix (Step 5, required)

For both push and pull:

| Case | Expected |
|---|---|
| User B pushes a change to a record of user A (personal) | `FORBIDDEN`; A's record is unchanged |
| User B tombstones A's record | `FORBIDDEN` |
| User B creates a record with an `id` already used by A | `FORBIDDEN`; A's record is unchanged |
| A non-member pushes to household H, or a forged `household_id` | `FORBIDDEN` |
| A member pushes to another member's `member_monthly_summaries` or contribution | `FORBIDDEN` |
| A change moves an existing record to another household, or to the personal scope | `IMMUTABLE` |
| A non-member pulls household H | `404` |
| User B pulls the personal scope | gets only B's records |
| A removed member pulls H | `404` |
| An oversized value, an unknown field or collection, or an HLC far in the future | rejected with the matching reason |
| Body too large or too many changes | `413` / `400`; nothing applied |
