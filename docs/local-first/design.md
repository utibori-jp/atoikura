# Local-first design: data model, online/offline split, household

Status: **draft for review** (issue #198, milestone `local-first-refactor`).

This document defines the data model that every later local-first step builds on.
The sync wire protocol is in [`sync-protocol.md`](sync-protocol.md), and its
OpenAPI contract is in [`sync-api.yaml`](sync-api.yaml).

The baseline is the **current code** (migrations `000001`–`000018`, 45 routes in
`backend/cmd/server/main.go`). `docs/spec.md` and `docs/atoikura.dbml` predate
recurring expenses, savings, income and surplus, so they are not used as the
baseline.

---

## 1. Decisions

| # | Decision |
|---|---|
| D1 | **Hybrid local-first.** Data is split into *offline-writable* data (journal entries, notes) and *online-only* data (everything else, §3). Online-only data can still be **read offline** from a local cache. |
| D2 | The on-device DB (SQLite WASM + OPFS) is the source of truth for offline-writable data, on phone and browser alike. Every device holds a full copy of what its user may see. |
| D3 | The server is **authoritative** for online-only data: it validates the data and enforces invariants, as the REST API does today. For offline-writable data it is a **relay and store**: it orders changes, enforces access, and validates contents. |
| D4 | **No end-to-end encryption.** The data is protected by TLS, server-side authorization, encrypted backups and encrypted disks (Step 9). Because nothing is encrypted end to end, the server can validate everything a client pushes. |
| D5 | Every user keeps a **ledger** (家計). In personal mode the ledger has one member; a household is a ledger with several members. One code path serves both modes. A user belongs to exactly one ledger at a time. |
| D6 | In a household, money is split into a **shared ledger** and a **per-member allowance** (家計＋お小遣い), §4. |
| D7 | Household members see the shared ledger's journal entries in full, but only the **total** of each other's allowance spending. |
| D8 | Allowances are set **per member** on the household settings screen (online). Personal fixed costs are paid from the allowance. |
| D9 | **One category master per ledger.** In a household it is shared by all members and used for both the shared ledger and allowance entries. It is edited online. |
| D10 | Offline-writable records get client-generated **UUIDv7** IDs, and every delete is a **tombstone**. |
| D11 | A journal entry can only be edited or deleted by its **author**. The one exception is auto-posted recurring entries in the shared ledger (§5.3). As a result, conflicts only happen between one user's own devices. They are resolved by **field-level LWW**. |
| D12 | Derived values ("あといくら", summaries, savings accumulated) are not synced. They are computed on device from synced and cached data. |
| D13 | Monthly recurring postings are created **by the server**. A unique key on `(recurring_expense_id, year_month)` guarantees exactly one row per month. |
| D14 | The legacy REST API and its tables stay untouched until Step 7b. The new schema lives in **new tables** alongside them. |

---

## 2. Roles

| | Online-only data | Offline-writable data |
|---|---|---|
| What | ledgers and members, invitations, category masters, income, base income, recurring expenses, savings goals, budgets and allowances, surplus allocations | journal entries, daily notes, monthly review notes |
| Writes | REST commands, **online only**. The server validates, enforces invariants and commits in a transaction. | Written to the **local DB first**, queued in the outbox, then **pushed** |
| Reads | From the local cache, kept fresh by **pull** | From the local DB, kept fresh by **pull** |
| Conflicts | None. The server serializes writes. | Only between the author's own devices, resolved by field-level LWW |
| Offline UI | Shown read-only; edit buttons are disabled with a short notice | Works fully |

Both kinds of data flow to devices through **one pull stream**. Every committed
change to a synced table, whether it came from a REST command, a push, or a
server-side posting, gets a sequence number. Devices pull everything after their
cursor. Clients never push online-only collections.

---

## 3. Ledger model

```
ledgers (id uuid, kind: personal | household, name)
ledger_members (ledger_id, user_id, role: owner | member, joined_at, left_at)

               ┌─────────── ledger ───────────┐
 income ──────►│ base incomes (per member)    │
               │ − fixed recurring (ledger)   │
               │ − monthly savings            │
               │ − savings surplus allocations│
               │ = disposable                 │
               │   ├ allowance A ──► A's wallet (private details)
               │   ├ allowance B ──► B's wallet (private details)
               │   └ shared living budget ──► ledger wallet (details visible to all)
               └──────────────────────────────┘
```

- **Wallet:** every journal entry belongs either to the `ledger` wallet or to
  its author's `allowance` wallet. In personal mode, only the `ledger` wallet
  exists, and the formulas reduce to today's behavior.
- **Ledger "あといくら"**: the shared living budget minus the variable spending
  (`food` + `other`, not excluded) in the ledger wallet.
- **Personal "あといくら"** (household mode): the member's allowance minus
  their non-excluded allowance spending, including allowance recurring
  postings.
- **What other members see** of an allowance: its amount (a household setting)
  and its total spent per month. The server computes these totals; the details
  are never sent to other members.

### 3.1 Collections

Common columns on every synced table:

| Column | Notes |
|---|---|
| `id` | UUID |
| `ledger_id` | Set by the server from the token's ledger. **A client-supplied value is never trusted.** |
| `owner_id` | Author or creator. Set by the server from the token. |
| `seq` | Sequence number of the last change, assigned by the server |
| `deleted`, `deleted_at` | Tombstone |
| `created_at`, `updated_at` | Server timestamps |
| `field_hlc` (jsonb) | Offline-writable collections only: the HLC of each field, used for LWW |

**Online-only** (written through REST, pulled by devices as a read cache):

| Collection | Main fields | Visible to | Write | Notes |
|---|---|---|---|---|
| `ledgers` / `ledger_members` | name, kind, role | members | owner, via Step 8 commands | — |
| `category_groups` | `name`, `statement_type_code`, `description` | members | any member | `statement_types` is referenced by `type_code` (global constant, not synced). Deleting a group that still has active categories is rejected, as today. |
| `expense_categories` | `group_id`, `name`, `category_code`, `description` | members | any member | Uniqueness is enforced by the server, as today. A delete is a tombstone. |
| `income_records` | `earner_id`, `transaction_date`, `amount`, `name`, `income_type`, `emoji`, `note` | members | the earner | Income is shared within a household. |
| `base_incomes` | `member_id`, `amount` | members | that member | Replaces `base_income_settings`; the ledger's base income is the sum over its members. |
| `recurring_expenses` | `wallet`, `name`, `emoji`, `billing_day`, `amount`, `type`, `category_id` | ledger wallet: members; allowance wallet: **owner only** | ledger wallet: any member; allowance wallet: owner | Personal fixed costs use the allowance wallet (D8). |
| `savings_goals` / `savings_postings` | as today, plus postings | members | any member | Online, so today's server logic (including manual postings) carries over. `accumulated` is derived from the postings. |
| `budgets` | `monthly_budget`, `goal_text`, `goal_amount` | members | any member | One row per ledger |
| `allowances` | `member_id`, `amount` | members | household owner or member, via settings (Q4) | Household mode only |
| `surplus_allocations` | as today | members | any member | Append-only. The upper bound stays a server-side **error**, as today. |

**Offline-writable** (pushed by devices):

| Collection | Fields | Visible to | Write |
|---|---|---|---|
| `journal_entries` | `wallet`, `transaction_date`, `item`, `amount`, `is_excluded`, `category_id`, `note`, `recurring_expense_id`, `recurring_year_month` | `ledger` wallet: all members; `allowance` wallet: **owner only** | author (D11) |
| `daily_notes` | `date`, `note` | owner only (Q1) | owner |
| `monthly_review_notes` | `year_month`, `category_id`, `note` | owner only (Q1) | owner |

**Computed by the server** (read-only, pulled into the cache):

| View | Contents |
|---|---|
| `allowance_totals` | `(member_id, year_month, spent)`, recomputed whenever a push touches allowance entries. This is the only window that other members have into an allowance. |

Not synced: `users` (authentication), `statement_types` (an app constant), and
`accounts` / `account_transactions` (Ver2, unused).

---

## 4. Identity, clocks, deletion (offline-writable data)

- **IDs:** UUIDv7, generated on the client. The server rejects an `id` that
  already belongs to another owner (`FORBIDDEN`).
- **HLC:** every field write is stamped with
  `<unix_ms 13 digits>-<counter 4 hex>-<device_id>`. The format is
  lexicographically ordered. The server rejects HLCs more than 5 minutes ahead
  of its clock (`CLOCK_SKEW`).
- **LWW:** the server stores an incoming field only if its HLC is newer than
  the stored one. Clients merge pulled values in the same way. Because only the
  author can write, this resolves edits made on that author's phone and
  browser.
- **Tombstones:** **delete wins**. Once a record is deleted, later field writes
  to it are ignored, and "undo" creates a new record. Tombstones are kept.
- **Uniqueness:**
  - Daily notes are unique per `(owner, date)`, and monthly review notes per
    `(owner, year_month, category_id)`. When two devices create the same note
    offline, the server keeps the first row and **merges the second into it**:
    it concatenates the two texts and returns the surviving `id`. The client
    then re-keys its local row.
  - Journal entries have no natural key, apart from recurring postings, which
    only the server creates (§5.3).

---

## 5. Validation and invariants

### 5.1 Push validation (offline-writable data, server side)

The server assumes the client may be tampered with:

- **Authorization:** the ledger and owner come only from the token. Writes are
  author-only, except for shared-ledger recurring entries.
- **Allowlists:** only known collections and fields are accepted.
- **Size limits:** per value, per change, and per request.
- **Contents:** the same validation as today's handlers:
  - date formats, positive amounts, and length limits on `item` and `note`
  - `wallet` must be in `{ledger, allowance}`; `allowance` is accepted only in
    household mode
  - `category_id` must belong to the token's ledger
- **Category references:**
  - A category that has been **deleted** is still accepted. The entry may have
    been written offline before the deletion synced, so rejecting it would lose
    the user's input. The UI flags the entry instead.
  - A category that does not exist, or that belongs to another ledger, is
    rejected.

### 5.2 Warnings vs errors

Online-only invariants stay hard errors, as they are today, because the server
sees every write as it happens:

- the surplus allocation upper bound
- deleting a group that still has categories
- uniqueness of category names

The only warnings left are budget overruns, and these were never enforced in
the first place.

### 5.3 Recurring postings and savings (server side)

- On the first sync or request of a month, the server posts that month's
  **fixed** recurring expenses and monthly savings, as the lazy posting does
  today. A unique key on `(recurring_expense_id, year_month)` replaces the
  advisory lock.
- **Variable** recurring expenses are confirmed through an online command.
- Posted journal entries enter the pull stream like any other change.
  - Shared-ledger postings can be edited by any member.
  - Allowance postings can only be edited by their owner.
- Until a month's postings arrive, an offline device projects the budget using
  the recurring totals, which are already part of the disposable formula.

### 5.4 Time zone

Month and day boundaries keep using `Asia/Tokyo`, matching `jstLocation()` in
the current server code.

---

## 6. Mode change: personal → household

When a user joins a household, their ledger changes, so their pull cursor
resets to 0 and the device re-pulls everything it may now see. **What happens
to the data in their personal ledger is decided in Step 8** (Q2).

---

## 7. Migration from the legacy schema (Step 7b)

Nothing is encrypted, so the migration runs **on the server**:

- Each existing user gets a personal ledger.
- Integer IDs are mapped to UUIDs, and every reference is rewritten.
- `base_income_settings` becomes `base_incomes`.
- The monthly-review JSONB becomes one `monthly_review_notes` row per category.
- Every row gets a `seq`.

Devices then pull everything from `since=0`. The legacy tables stay in place
until their removal is approved.

---

## 8. Open questions for review

| # | Question | Recommendation |
|---|---|---|
| Q1 | Should daily and monthly review notes stay private, or should a household be able to write shared review notes for the shared ledger? | Private for now. Shared review notes can be a later feature. |
| Q2 | When a user joins a household, what happens to their personal-ledger data? | Keep it as a read-only **archived personal ledger** that only they can see. Nothing is merged. Decide in Step 8. |
| Q3 | Base income in a household: a per-member amount, summed? | Yes (`base_incomes` per member). |
| Q4 | Who can change allowances: any member, or only the household owner? | Any member. The change is shown to everyone. |
| Q5 | Does unused allowance carry over to the next month? | No in V1. Each month starts fresh. |
| Q6 | Which allowance spending counts against the allowance? | Everything not excluded, including allowance recurring postings. |
