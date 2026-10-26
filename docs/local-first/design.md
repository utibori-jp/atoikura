# Local-first design: data model, encryption, household

Status: **draft for review** (issue #198, milestone `local-first-refactor`).

This document defines the data model that every later local-first step builds on.
The sync wire protocol is in [`sync-protocol.md`](sync-protocol.md), and its
OpenAPI contract is in [`sync-api.yaml`](sync-api.yaml).

The baseline is the **current code** (migrations `000001`–`000018`, 45 routes in
`backend/cmd/server/main.go`). `docs/spec.md` and `docs/atoikura.dbml` predate
recurring expenses, savings, income and surplus, so they are not used as the
baseline.

---

## 1. Goals and constraints

- The on-device database (SQLite WASM + OPFS) is the source of truth, on both
  phone and browser. Every screen works offline.
- The server is a **sync relay**. It orders changes, enforces who may see and
  write which records, and stores ciphertext. It cannot read personal or
  household content (see §5).
- Two sync scopes:
  - **personal**: the user's own devices only.
  - **household**: every member of one household.
- Household members share goals and per-statement-type totals. They never see
  journal details, income or personal savings.
- The legacy REST API and its tables stay untouched until Step 7b is done.

### Decisions already made (owner)

| # | Decision |
|---|---|
| D1 | IDs are client-generated UUIDv7. Natural-key rows use deterministic IDs instead (§3.2). |
| D2 | Every delete is a tombstone. Nothing is physically deleted. |
| D3 | Masters are referenced by stable identifiers. The global `statement_types` master is referenced by `type_code`. |
| D4 | Conflicts are resolved by field-level last-writer-wins (LWW). |
| D5 | Only the owner can edit a journal entry (this falls out of the personal scope). |
| D6 | Derived values ("あといくら", savings accumulated, budget summary) are not synced. They are recomputed on device. The only exception is the household summary rows. |
| D7 | Invariants that cannot be enforced offline become **warnings**, not errors. |
| D8 | Every record has `owner_id`. Household records also have `household_id`. |
| D9 | Household sharing granularity: **per statement type** (`food` / `other` / `fixed` / `excluded`). No household category master. |
| D10 | Household summaries contain **spending only**. Income, personal budgets and personal savings are not shared. |
| D11 | The household can hold a **shared savings goal** and a **shared monthly budget**. |
| D12 | Personal data is end-to-end encrypted. Household data is encrypted with a shared household key (option X). |
| D13 | Cross-device uniqueness is decided per table (§4). Daily notes are merged. |
| D14 | Savings accumulated is recomputed from records. Monthly fixed expenses are deduplicated so that only one row per month survives on the server. |

---

## 2. Record envelope

Every synced record has the same envelope. The server only sees the envelope.
The content (the "fields") is ciphertext.

| Envelope attribute | Visible to server | Set by | Notes |
|---|---|---|---|
| `collection` | yes | client | Must be on the server's allowlist (§4). |
| `id` | yes | client | UUID (§3). |
| `owner_id` | yes | **server**, from the token on first push | Immutable. Never accepted from the request body. |
| `household_id` | yes | client, **verified by server** against the token user's memberships | `null` for personal collections. Immutable after creation. |
| `key_epoch` | yes | client | Which key encrypted the fields. Always `0` for personal records (§5). |
| `deleted` / `deleted_hlc` | yes | client | Tombstone. Delete wins: once deleted, a record never comes back (§3.4). |
| `seq` | yes | **server** | Global, monotonically increasing. Assigned on every accepted change. |
| fields | name and HLC: yes; value: **ciphertext only** | client | Field-level LWW unit (§3.3). |

Field names are visible to the server, so it can enforce a per-collection field
allowlist and run LWW without decrypting anything. The names are already public
in the source code, so this leaks only which fields changed and when.

---

## 3. Identity, clocks, deletion

### 3.1 Random IDs

Records without a natural key use **UUIDv7**, generated on the client.

### 3.2 Deterministic IDs for natural-key rows

Some rows have a natural key (for example "one daily note per date"). If two
offline devices each created such a row with a random ID, the server would end
up with duplicates. For these rows the ID is derived from the natural key:

```
id = UUIDv8( HMAC-SHA256( K_id, "<collection>|<natural key>" )[0:16] )
```

- `K_id` is a secret ID-derivation key. Personal rows use one derived from the
  user's data key (§5.1). Household rows use the household's stable ID key
  (§5.3).
- Because the key is secret, the server cannot work out the natural key (for
  example the date) from the ID.
- Two devices that create the same natural-key row therefore produce the **same
  ID**. The server's primary key makes the row unique, and field-level LWW
  merges the contents. This is the server-side deduplication the owner asked
  for (D14). The server never needs to understand the natural key.

### 3.3 Hybrid logical clocks (HLC)

Device wall clocks are not reliable enough for LWW, so every field write is
stamped with an HLC string:

```
<unix_ms, 13 digits>-<counter, 4 hex digits>-<device_id>
e.g. 1793000000000-0000-01J9Z3...
```

- The format is lexicographically ordered, so `>` on strings is `>` on clocks.
  The device ID breaks ties.
- Clients advance their HLC past every HLC they pull.
- The server rejects a change whose HLC is more than 5 minutes ahead of the
  server clock (`CLOCK_SKEW`), so that one bad clock cannot win every future
  conflict.

### 3.4 Tombstones

- Deletion sets `deleted = true` with an HLC.
- **Delete wins**: once a record is a tombstone, the server ignores later field
  writes to it. "Undo delete" in the UI creates a new record.
- Tombstones are kept forever. They are small, and journal entries keep
  referencing deleted masters (as today, where deleted categories still render
  past entries).

---

## 4. Collections

### 4.1 Personal scope (`household_id = null`)

| Collection | Fields (all encrypted) | ID | Write | Cross-device uniqueness / invariants |
|---|---|---|---|---|
| `category_groups` | `name`, `statement_type_code`, `description` | v7 | owner | Duplicate names: **warning** after sync; the user renames or deletes. Deleting a group that still has active categories: **warning** (D7). |
| `expense_categories` | `group_id`, `name`, `category_code`, `description` | v7 (defaults: keyed by `category_code`) | owner | Duplicate names within a group: **warning**. The signup defaults use keyed IDs, so two devices seeding defaults converge on the same rows. |
| `journal_entries` | `transaction_date`, `item`, `amount`, `is_excluded`, `category_id`, `note`, `recurring_expense_id`, `recurring_year_month` | v7, or keyed by `(recurring_expense_id, year_month)` for recurring postings | owner | Each recurring posting is one row per month (§4.3). |
| `recurring_expenses` | `name`, `emoji`, `billing_day`, `amount`, `type`, `category_id` | v7 | owner | — |
| `savings_goals` | `name`, `emoji`, `monthly_amount`, `target_amount`, `deadline`, `memo` | v7 | owner | `accumulated_amount` and `last_posted_month` are **removed**. They are derived (§4.4). |
| `savings_postings` *(new)* | `goal_id`, `year_month`, `amount`, `kind` (`auto` / `manual`) | keyed by `(goal_id, year_month)` for `auto`; v7 for `manual` | owner | One auto posting per goal per month. |
| `income_records` | `transaction_date`, `amount`, `name`, `income_type`, `emoji`, `note` | v7 | owner | — |
| `base_income_settings` | `amount` | keyed singleton | owner | One per user. |
| `budgets` | `monthly_budget`, `goal_text`, `goal_amount` | keyed singleton | owner | One per user. |
| `surplus_allocations` | `year_month`, `amount`, `destination`, `savings_goal_id` | v7 | owner, **append-only** | Exceeding the allocatable surplus is a **warning** (D7). The server rejects field updates after creation (`IMMUTABLE`). |
| `daily_notes` | `note` | keyed by `date` | owner | One per date. Concurrent edits are **merged** (§4.5). An empty note becomes a tombstone. |
| `monthly_review_notes` *(reshaped)* | `note` | keyed by `(year_month, category_id)` | owner | Replaces the JSONB map in `monthly_reviews`. One row per category per month, so edits to different categories never conflict. |

Not synced:

- `statement_types`: a global fixed master. It ships as an app constant and is
  referenced by `type_code` (D3).
- `accounts` / `account_transactions`: unused Ver2 tables. They are left out
  until Ver2 needs them.

### 4.2 Household scope (`household_id` set)

| Collection | Fields (encrypted with the household key) | ID | Write | Notes |
|---|---|---|---|---|
| `member_monthly_summaries` | `year_month`, `food`, `other`, `fixed`, `excluded` | keyed by `(owner user, year_month)` | **owner only** | The owner's device recomputes this row from local journal entries whenever that month changes (D6 exception). It holds spending only (D10). |
| `household_budgets` | `monthly_budget` | keyed singleton per household | any member | Compared with the members' summed spending. Going over is a **warning** (D7). |
| `household_savings_goals` | `name`, `emoji`, `target_amount`, `deadline`, `memo` | v7 | any member | Progress is the sum of the contributions. |
| `household_savings_contributions` | `goal_id`, `date`, `amount`, `note` | v7 | **owner only** | An explicit "I put ¥N into the shared goal". Personal savings stay private (D10). |

Server-only (not records, never synced as records): `users`, `households`,
`household_memberships`, invitations, key material (§5), refresh tokens and
devices.

### 4.3 Recurring postings (fixed auto-posting and variable confirmation)

Today the server auto-posts fixed recurring expenses on the first
`GET /budget-summary` of a month, under an advisory lock. In the local-first
design:

- Any device posts the month's fixed recurring expenses when the app opens in a
  new month. A variable recurring expense is posted when the user confirms it.
  Both write a `journal_entries` row whose ID is keyed by
  `(recurring_expense_id, year_month)`.
- If two devices both post the same month, they produce the same ID, and the
  server keeps exactly one row. If the amounts differ (for example two
  confirmations), LWW keeps the later one.
- The date logic is unchanged: the billing day, clamped to the end of the month.

### 4.4 Savings accumulated (derived)

```
accumulated(goal) = Σ savings_postings.amount            (goal_id = goal, not deleted)
                  + Σ surplus_allocations.amount         (destination = 'savings', savings_goal_id = goal)
```

- `auto` postings are keyed by `(goal_id, year_month)`, so concurrent
  auto-posting on two devices cannot double-count.
- There is no stored counter, so there is nothing for LWW to lose.

### 4.5 Merging daily notes

`daily_notes.note` uses a **client-side merge** instead of plain LWW.

- When a pull would overwrite a note that still has an unpushed local edit, the
  client keeps both texts. It concatenates them (`local + "\n" + remote`, or
  just one when they are identical), stamps the result with a new HLC, and
  pushes it.
- The server stays generic: it only sees ciphertext and HLCs.

Every other field uses plain LWW.

### 4.6 Time zone

Month and day boundaries keep using `Asia/Tokyo`, matching
`jstLocation()` in the current server code. `users.timezone` already exists
(default `Asia/Tokyo`). Making it user-selectable is out of scope.

---

## 5. End-to-end encryption

### 5.1 Threat model

| Protected against | Not protected against |
|---|---|
| Server DB, disk or backup leak | A compromised client device |
| Anyone who terminates TLS in front of the server, which matters after the Cloudflare move (Step 10) | An actively malicious server that substitutes public keys during household joins. Optional fingerprint check, §5.3. |
| A curious operator reading the DB | Metadata: record counts, sizes, timing, which fields changed |

### 5.2 Personal keys

```
password ──KDF(salt)──► master_key ─┬─ HKDF "auth"  ──► auth_key    (sent at login; server stores a hash of it)
                                    └─ HKDF "wrap"  ──► wrap_key    (never leaves the device)

UDK (User Data Key, random 256-bit, generated at signup, never rotated)
  ├─ stored on the server wrapped by wrap_key
  ├─ stored on the server wrapped by recovery_key (128-bit, shown once at signup)
  ├─ HKDF "data/v1" ──► AES-256-GCM key for personal fields
  └─ HKDF "id/v1"   ──► K_id for personal deterministic IDs (§3.2)
```

- **The raw password never leaves the device.** Login sends `auth_key`, so the
  server, or anything terminating TLS, cannot derive `wrap_key`. This changes
  the login protocol; it is implemented in Step 5.
- KDF: Argon2id (via WASM) is recommended. PBKDF2-SHA256 at 600k iterations
  (native WebCrypto) is the fallback. See open question Q5.
- The KDF salt and parameters come from a pre-login endpoint. For unknown
  emails it returns a deterministic fake salt, so it cannot be used to
  enumerate accounts.
- A password change re-wraps the UDK. No data is re-encrypted.
- **Without the password and the recovery code, the encrypted data is
  unrecoverable.** The UI must say this clearly when it shows the recovery
  code.
- Each user also has an ECDH P-256 key pair (P-256 rather than X25519 because
  every target browser supports it). The private key is stored on the server
  wrapped by the UDK. It is used to receive household keys.

### 5.3 Household keys

- **HK** (household key, AES-256-GCM, per epoch) encrypts household fields.
- **HIK** (household ID key) is stable for the household's lifetime. It is used
  only for household deterministic IDs, so that rotating HK does not change
  those IDs.
- For each member, the key material is wrapped to that member's public key
  (ephemeral ECDH + HKDF + AES-GCM) and stored on the server as an envelope:
  `(household_id, epoch, member_user_id, envelope)`.
- **Join** (Step 8): the server confirms the membership; the new member is then
  in a *pending key* state. The next time any existing member's device is
  online, it wraps HK and HIK for the new member. Optionally, it first shows a
  fingerprint of the new member's public key so the two people can compare it.
- **Removal**: the server cuts off the removed member's access immediately. The
  next device of a remaining member rotates to a new HK epoch and wraps it for
  the remaining members. Old records stay at their old epoch, and nothing is
  re-encrypted. A removed member may keep data they had already synced; this is
  accepted.

### 5.4 Field encryption

```
plaintext  = JSON encoding of the field value
key        = personal data key, or HK[key_epoch]
nonce      = 96-bit random
aad        = "atoikura/v1|" + collection + "|" + id + "|" + field + "|" + key_epoch
wire value = base64url(nonce || ciphertext || tag)
```

The AAD binds each ciphertext to its record and field, so the server cannot
move a value into another record or field.

### 5.5 Consequences for server-side validation

The server cannot see amounts, dates or text. It validates everything it can
see:

- ownership and membership (derived from the token)
- the collection and field allowlists
- size limits
- the HLC skew bound
- immutability (owner, household, append-only collections, tombstones)
- the write policy (owner-only vs. any member)

Content validation (positive amounts, date formats, length limits) runs on the
client, in the Step 3 logic. **A tampered client can only corrupt its own
data**, or, for household collections, records it is allowed to write anyway.

### 5.6 Consequence for data migration (Step 7b)

The server cannot produce ciphertext for users. The migration from the legacy
data therefore has to run **on a client**:

1. The client reads the user's data through the legacy API.
2. It converts the data (integer IDs → UUIDs, `accumulated_amount` →
   `savings_postings`, the monthly-review JSONB → `monthly_review_notes`).
3. It encrypts the data and pushes it.

---

## 6. Open questions for review

| # | Question | Recommendation |
|---|---|---|
| Q1 | Today a manual "post monthly" can run several times in a month, and it suppresses that month's auto-posting (`last_posted_month`). Should manual postings stay as **extra contributions** that no longer suppress the auto-posting? | Yes. "Suppress if a manual posting exists" cannot be made safe offline. |
| Q2 | Which statement types count against the **household budget**? | `food` + `other` (variable spending), matching the core value. `fixed` and `excluded` are shown but not counted. |
| Q3 | Household savings contributions are visible to every member (amount, date, note). Is that acceptable? | Yes. They are explicitly given to the shared goal. Personal savings stay private. |
| Q4 | Issue #208 schedules E2EE for Step 9. With this design, encryption is part of the record format from the first push. | **Move the crypto envelope into Steps 5 and 6**, so the server never stores plaintext and nothing has to be migrated later. Step 9 keeps the hardening work. |
| Q5 | Which KDF should derive the keys from the password? | Argon2id via WASM (for example `hash-wasm`), falling back to PBKDF2-SHA256 at 600k iterations. |
| Q6 | Login no longer sends the raw password (§5.2). Token lifetime and refresh are still left to Step 5, as agreed. | Treat the credential format as fixed by this document and the token policy as open. |
| Q7 | Member display names are needed by other members. Should they be plaintext on the server, or encrypted with HK? | Plaintext. They are already server-side account data. |
