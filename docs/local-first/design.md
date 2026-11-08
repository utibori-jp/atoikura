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
| D5 | Every user has exactly one **personal ledger**, kept for as long as the account exists. A user can also be a member of at most one **household ledger** at a time (household mode). The household is **attached to** and **detached from** the personal ledger; nothing is moved between the two (§6). |
| D6 | In household mode, shared money lives in the household ledger: **all income** (every member's base income and income records), shared spending, shared fixed costs and shared savings. Each member's personal ledger acts as their **allowance** (家計＋お小遣い) and can keep its own savings goals, paid from the allowance (§3). |
| D7 | Household members see the household ledger's journal entries in full, but of each other's personal ledgers only the **allowance total** per month, which the server computes. |
| D8 | Allowances are set **per member** on the household settings screen (online). Personal fixed costs are recurring expenses in the personal ledger, paid from the allowance. |
| D9 | **One category master per ledger.** A household's master is shared by its members; each personal ledger keeps its own. A new household starts with a copy of its creator's categories and recurring expenses (§6). Masters are edited online. |
| D10 | Offline-writable records get client-generated **UUIDv7** IDs, and every delete is a **tombstone**. |
| D11 | A journal entry can only be edited or deleted by its **author**. The one exception is auto-posted recurring entries in the household ledger (§5.3). As a result, conflicts only happen between one user's own devices. They are resolved by **field-level LWW**. |
| D12 | Derived values ("あといくら", summaries, savings accumulated) are not synced. They are computed on device from synced and cached data. |
| D13 | Monthly recurring postings are created **by the server**. A unique key on `(recurring_expense_id, year_month)` guarantees exactly one row per month. |
| D14 | The legacy REST API and its tables stay untouched. The new schema lives in **new tables** alongside them. Their data is not migrated (Step 7b, §7). |
| D15 | A client never names a ledger by its ID. A write says `personal` or `household`, and the server resolves the ledger from the token. Rows a client pulls carry their real `ledger_id`. |

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
ledgers (id uuid, kind: personal | household | archive, name)
ledger_members (ledger_id, user_id, role: owner | member, joined_at, left_at)

 personal ledger of A (always)            household ledger (0 or 1, attached)
 ┌──────────────────────────────┐         ┌──────────────────────────────┐
 │ personal mode:               │         │ base incomes (per member)    │
 │   base income                │         │ − fixed recurring            │
 │   − fixed recurring          │         │ − monthly savings            │
 │   − monthly savings          │         │ − savings surplus allocations│
 │   = variable budget          │         │ − allowances of all members  │
 │                              │◄────────│   (allowance of A)           │
 │ household mode:              │         │ = shared living budget       │
 │   allowance balance          │         │   (details visible to all)   │
 │   − personal savings         │         └──────────────────────────────┘
 │   (details private to A)     │
 └──────────────────────────────┘
```

- **Personal mode** (no household attached): the personal ledger works as
  today's app.
- **Household "あといくら"**: the shared living budget minus the variable
  spending (`food` + `other`, not excluded) in the household ledger.
- **Personal "あといくら"** (household mode): the allowance balance, which
  **carries over** from month to month:
  ```
  balance(m) = balance(m-1) + allowance(m) − allowance spending(m)
               − personal savings(m)
  ```
  - `allowance(m)` is the allowance amount in effect for month `m`, read from
    the household's allowance history.
  - Allowance spending is every non-excluded journal entry in the member's
    personal ledger, including its recurring postings (personal fixed costs).
  - The balance starts at 0 in the month the member joins. Unused allowance
    carries over, and so does overspending (a negative balance reduces the
    next month).
  - Personal savings(m) is what the member puts into their personal savings
    goals that month: monthly savings postings and manual postings.
  - What is left of the allowance simply carries over: the personal ledger
    takes no surplus allocations while a household is attached.
  - **Income is shared** (Q10). While attached, the member's base income and
    income records live in the household ledger; the personal ledger's
    income screens are hidden. Its own base income row is kept for when the
    household is detached.
  - The personal ledger's budget row (`monthly_budget`, goal) is not used
    while attached.
- **What other members see** of a personal ledger: the member's allowance
  amount (a household setting) and the totals spent and saved per month, and
  therefore also the balance. Personal savings goals themselves are private. The server computes these totals; the entries themselves
  are never sent to other members.

### 3.1 Collections

Common columns on every synced table:

| Column | Notes |
|---|---|
| `id` | UUID |
| `ledger_id` | Set by the server: the caller's personal or household ledger, resolved from the token and the `personal` / `household` target of the write (D15). **A client-supplied ID is never trusted.** |
| `owner_id` | Author or creator. Set by the server from the token. |
| `seq` | Sequence number of the last change, assigned by the server |
| `deleted`, `deleted_at` | Tombstone |
| `created_at`, `updated_at` | Server timestamps |
| `field_hlc` (jsonb) | Offline-writable collections only: the HLC of each field, used for LWW |

**Online-only** (written through REST, pulled by devices as a read cache):

"Members" means the members of the row's ledger. A personal ledger has a single
member, its owner, so its rows are visible to that user only.

| Collection | Main fields | Visible to | Write | Notes |
|---|---|---|---|---|
| `ledgers` / `ledger_members` | name, kind, role | members | household commands (§6) | — |
| `category_groups` | `name`, `statement_type_code`, `description` | members | any member | `statement_types` is referenced by `type_code` (global constant, not synced). Deleting a group that still has active categories is rejected, as today. |
| `expense_categories` | `group_id`, `name`, `category_code`, `description` | members | any member | Uniqueness is enforced by the server, as today. A delete is a tombstone. |
| `income_records` | `earner_id`, `transaction_date`, `amount`, `name`, `income_type`, `emoji`, `note` | members | the earner | Income is shared within a household: while attached, new income records go to the household ledger. |
| `base_incomes` | `member_id`, `amount` | members | that member | Replaces `base_income_settings`; the ledger's base income is the sum over its members. Copied between the personal and household ledger on join and leave (§6). |
| `recurring_expenses` | `name`, `emoji`, `billing_day`, `amount`, `type`, `category_id` | members | any member | Personal fixed costs are the personal ledger's recurring expenses (D8). |
| `savings_goals` / `savings_postings` | as today, plus postings | members | any member | Both ledgers can have goals: household goals are paid from the shared budget, personal goals from the allowance. Online, so today's server logic (including manual postings) carries over. `accumulated` is derived on device: the goal's postings plus its `savings` surplus allocations (an allocation is not copied into a posting). |
| `budgets` | `monthly_budget`, `goal_text`, `goal_amount` | members | any member | One row per ledger |
| `allowances` | `member_id`, `effective_from` (YYYY-MM), `amount` | members | any member, via the household settings (Q4) | Household ledgers only. A **history**: one row per change, unique per `(member_id, effective_from)`. The carry-over needs the amount in effect for every past month. |
| `surplus_allocations` | as today | members | any member | Append-only. The upper bound stays a server-side **error**, as today. |

Not synced: `household_invitations` (`ledger_id`, a hash of the invitation
token, the short code, `created_by`, `expires_at`, `used_by`, `used_at`). The
server checks invitations; devices never see them.

**Offline-writable** (pushed by devices):

| Collection | Fields | Visible to | Write |
|---|---|---|---|
| `journal_entries` | `transaction_date`, `item`, `amount`, `is_excluded`, `category_id`, `note`, `recurring_expense_id`, `recurring_year_month` | members (a personal ledger's: its owner only) | author (D11) |
| `daily_notes` | `date`, `note` | owner only (Q1) | owner; always in the personal ledger |
| `monthly_review_notes` | `year_month`, `category_id`, `note` | owner only (Q1) | owner; always in the personal ledger, and `category_id` may name a personal or a household category |

**Computed by the server** (read-only, pulled into the cache):

| View | Contents |
|---|---|
| `allowance_totals` | `(member_id, year_month, spent, saved)` in the household ledger, computed from each member's personal ledger for the months since they joined. Recomputed whenever a member's personal journal entries, savings postings or surplus allocations change (push, command or posting) and when a member joins. This is the only window that other members have into a personal ledger. |

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

- **Authorization:** the user comes only from the token, and the ledger is
  resolved from the token (D15):
  - A new journal entry names its target as `personal` or `household`. The
    server maps it to the caller's personal ledger or to the household the
    caller is an **active** member of; with no household, `household` is
    rejected. The target cannot change after the entry is created.
  - Notes always go to the caller's personal ledger.
  - Changes to an existing row are accepted only if the row's ledger is the
    caller's personal ledger or their active household. Rows in an archive
    ledger are read-only.
  - Journal entries are author-only, except for recurring postings in the
    household ledger, which any member can edit.
- **Allowlists:** only known collections and fields are accepted.
- **Size limits:** per value, per change, and per request.
- **Contents:** the same validation as today's handlers:
  - date formats, positive amounts, and length limits on `item` and `note`
  - `category_id` must belong to the entry's ledger (for review notes: the
    caller's personal ledger or active household)
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

- On the first pull of a month, the server posts that month's **fixed**
  recurring expenses and monthly savings of every ledger the caller can write
  to (personal and, if attached, household), as the lazy posting does today. A
  unique key on `(recurring_expense_id, year_month)` replaces the advisory lock,
  so concurrent pulls post exactly once (Step 5b).
  - A posting the user deleted is **not** posted again: its tombstone still
    holds the key. The same applies to confirming a variable expense: each
    recurring expense is posted at most once per month.
  - A manual savings posting for a month counts as that month's posting, as
    `last_posted_month` did.
  - Posted entries are stamped with a server HLC (`…-server`), so any later
    edit from a device wins.
- **Variable** recurring expenses are confirmed through an online command.
- Posted journal entries enter the pull stream like any other change.
  While a household is attached, whenever a member's personal journal entry
  changes (push, confirm or posting), the server recomputes that member's
  `allowance_totals` for the affected months in the same transaction.
  - Household-ledger postings can be edited by any member.
  - Personal-ledger postings can only be edited by their owner.
- Until a month's postings arrive, an offline device projects the budget using
  the recurring totals, which are already part of the disposable formula.

### 5.4 Time zone

Month and day boundaries keep using `Asia/Tokyo`, matching `jstLocation()` in
the current server code.

---

## 6. Household lifecycle: attach and detach (Step 8)

Every user starts, and stays, with a personal ledger. A household is attached
to it and can later be detached; the personal ledger is never changed by
either.

All household actions are online commands. The household and the member are
always resolved from the token; a request never names a ledger ID.

- **Create.** A user with no active household creates one and becomes its
  owner. The server copies the creator's category groups, categories,
  recurring expenses and base income into the new household ledger, with new
  IDs (Q7). Journal entries, notes, income records and savings goals are
  **not** copied: the
  household starts with no history. Fixed costs that are now counted twice
  (in the household and in a member's personal ledger) are left for the users
  to clean up.
- **Invite.** A member creates an invitation: a link with a random token, and
  a short code for typing in by hand (Q8). Both name the same invitation.
  - It expires after **24 hours** and can be used **once**. Members can revoke
    it before then.
  - The server stores only a hash of the token. Failed code attempts are
    rate-limited, since a short code can be guessed: after 10 failed attempts
    within an hour a user has to wait. A short code is 8 characters from an
    alphabet without look-alikes (no 0/O, 1/I), and a household has at most 10
    open invitations.
- **Join.** A signed-in user with no active household redeems the link or the
  code. The server adds a `ledger_members` row (role `member`). Their
  allowance starts at 0 from the join month until a member sets it. Their
  personal base income is copied into the household as their `base_incomes`
  row (Q10); the rest of their personal ledger is left as it is.
- **Leave / remove.** A member leaves, or the owner removes them. The server
  sets `left_at`, and copies the household's journal entries and income
  records up to that day, with the categories they reference, into a new
  **archive** ledger owned by the person leaving (Q9). Their household
  `base_incomes` amount is copied back to their personal ledger, and their
  household row is removed, so the household's base income no longer counts
  it. The archive is read-only and only they can see it. Archived entries
  lose their link to a recurring expense: the archive has none, and the
  posting's unique key stays with the household's row.
  Their personal ledger (the allowance side, its categories and fixed costs)
  carries on in personal mode. The household itself is unchanged for the
  remaining members.
- **Owner.** The owner cannot leave while other members remain. Once alone,
  they can dissolve the household: its ledger becomes their archive. Its
  open invitations are revoked and its `allowance_totals` are deleted; the
  owner's base income is copied back to their personal ledger.
- **Sync.** A pull returns rows from every ledger the caller can see: their
  personal ledger, their active household, and their archives. The response
  lists those `ledger_ids`. When the list changes (join, leave, dissolve), the
  device resets its cursor to 0, re-pulls, and drops the local rows of ledgers
  that are no longer listed.
- **Commands.** The existing `/ledger/*` commands take a target,
  `personal` or `household`, the same way pushes do. The lifecycle commands live
  under `/household` (sync-api.yaml), together with `PUT /household/allowances`,
  which sets a member's allowance from a month on.
- **Screens.** While a household is attached, a 家計 / お小遣い switch picks
  the ledger every screen shows and writes to (household by default, remembered
  per device). In the お小遣い view the budget comes from the allowance plus
  the carried-over balance instead of income; daily and review notes always
  stay in the personal ledger. The household settings live on the account
  screen. An invitation link carries its token in the URL fragment
  (`#join=<token>`), so it never reaches a server log; the app removes it from
  the address bar on load and asks before joining. Past households are listed
  under the household settings as 過去の家計; each opens a read-only viewer of
  its journal and monthly category totals (no budget: an archive keeps no
  settings), and Back returns to the account screen.
- **Schema.** These changes ship as a new migration (000022): the `wallet`
  columns are dropped, `ledgers.kind` gains `archive`, and
  `household_invitations` is added. Migrations 000019–000021 are not edited.
  Migration 000023 adds the members' display names (copied from `users` when a
  membership starts, so other members can see who is in the household), a
  unique allowance per member and month, and the table of failed join
  attempts used for rate limiting.

---

## 7. Migration from the legacy schema (Step 7b)

**Skipped** by the owner's decision (#206): the app has a single user, whose
data may be re-entered. No data is copied from the legacy tables into the
ledger tables, and users start empty after signing in on the new version.

The legacy tables and API stay in place; removing them is a separate decision.

---

## 8. Resolved questions

Answered by the owner in the review of PR #210.

| # | Question | Decision |
|---|---|---|
| Q1 | Should daily and monthly review notes stay private? | Yes, private. Shared review notes for the shared ledger may come later. |
| Q2 | What happens to personal-ledger data when a user joins a household? | ~~Kept as a read-only archived personal ledger.~~ **Superseded in Step 8:** the personal ledger stays live and becomes the allowance side (D5, D6). |
| Q3 | Base income in a household? | A per-member amount (`base_incomes`), summed. |
| Q4 | Who can change allowances? | Any member. The change is visible to everyone. |
| Q5 | Does unused allowance carry over? | **Yes.** The balance carries over, and so does overspending (§3). |
| Q6 | Which allowance spending counts against the allowance? | Everything not excluded in the personal ledger, including its recurring postings. |

Answered by the owner during Step 8 (#207).

| # | Question | Decision |
|---|---|---|
| Q7 | What does a new household start with? | A copy of the creator's categories, recurring expenses and base income. No past records. Fixed costs counted twice are cleaned up by the users. |
| Q8 | How are members invited? | A link and a short code for the same invitation, valid for 24 hours, single use. |
| Q9 | What happens on leave or dissolve? | The personal ledger keeps the allowance side, its categories and fixed costs. The shared entries are kept separately as a read-only archive. |
| Q10 | Where do income and savings live while attached? | **Income is shared:** base incomes and income records live in the household ledger (a household may have one earner or several). **Savings goals exist on both sides:** household goals come out of the shared budget, personal goals out of the allowance. |
