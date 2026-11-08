import type { HouseholdMember } from "../logic/queries";
import type { LedgerData } from "./ledgerData";

// The attached household as the settings screen shows it, read from the synced
// cache. Its edits are household commands (sync/householdCommands.ts).

export type { HouseholdMember };

export interface HouseholdView {
  household_ledger_id: string;
  name: string;
  // The signed-in user's role.
  role: "owner" | "member";
  members: HouseholdMember[];
}

// The attached household, or null in solo mode (or before its rows have synced).
export async function loadHousehold(
  ledger_data: LedgerData,
  year_month: string
): Promise<HouseholdView | null> {
  const household_ledger_id = ledger_data.household_ledger_id;
  if (household_ledger_id === null) return null;
  const [[ledger_row], members] = await Promise.all([
    ledger_data.local_db.select("SELECT name FROM ledgers WHERE id = ? AND deleted = 0", [
      household_ledger_id,
    ]),
    ledger_data.local_db.query("listHouseholdMembers", household_ledger_id, year_month),
  ]);
  const own_member = members.find((member) => member.user_id === ledger_data.user_id);
  if (!ledger_row || !own_member) return null;
  return {
    household_ledger_id,
    name: ledger_row.name === null ? "" : String(ledger_row.name),
    role: own_member.role,
    members,
  };
}

// The invitation link for a token. The token travels in the fragment, so it
// never reaches a server log; the app reads and clears it on load.
export function invitationLink(token: string, location: Location = window.location): string {
  return `${location.origin}${location.pathname}#join=${encodeURIComponent(token)}`;
}

const JOIN_FRAGMENT_PATTERN = /^#join=([^&]+)$/;

// Reads an invitation token from the URL fragment, or null.
export function joinTokenFromHash(location_hash: string): string | null {
  const join_match = JOIN_FRAGMENT_PATTERN.exec(location_hash);
  if (!join_match) return null;
  try {
    return decodeURIComponent(join_match[1]);
  } catch {
    return null;
  }
}

// A past household: what is left after leaving or dissolving one (design.md §6).
export interface ArchiveSummary {
  ledger_id: string;
  name: string;
  // The months its entries and income span (YYYY-MM), or null when it is empty.
  first_month: string | null;
  last_month: string | null;
}

// The user's past households, the most recent first.
export async function listArchives(ledger_data: LedgerData): Promise<ArchiveSummary[]> {
  const archive_rows = await ledger_data.local_db.select(
    `SELECT l.id, l.name,
            MIN(dated.year_month) AS first_month, MAX(dated.year_month) AS last_month
     FROM ledgers l
     LEFT JOIN (
       SELECT ledger_id, substr(transaction_date, 1, 7) AS year_month
       FROM journal_entries WHERE deleted = 0
       UNION ALL
       SELECT ledger_id, substr(transaction_date, 1, 7) AS year_month
       FROM income_records WHERE deleted = 0
     ) dated ON dated.ledger_id = l.id
     WHERE l.kind = 'archive' AND l.deleted = 0
     GROUP BY l.id, l.name
     ORDER BY last_month IS NULL, last_month DESC, l.created_at DESC, l.id`
  );
  return archive_rows.map((archive_row) => ({
    ledger_id: String(archive_row.id),
    name: archive_row.name === null ? "" : String(archive_row.name),
    first_month: archive_row.first_month === null ? null : String(archive_row.first_month),
    last_month: archive_row.last_month === null ? null : String(archive_row.last_month),
  }));
}

// The ledger data the archive viewer reads through: the screens' data functions
// pointed at a past household, in the read-only archive mode.
export function archiveLedgerData(ledger_data: LedgerData, archive_ledger_id: string): LedgerData {
  return { ...ledger_data, ledger_id: archive_ledger_id, mode: "archive" };
}

// The month's income total of a ledger.
export async function sumMonthlyIncome(
  ledger_data: LedgerData,
  year_month: string
): Promise<number> {
  const [income_row] = await ledger_data.local_db.select(
    `SELECT SUM(amount) AS total FROM income_records
     WHERE ledger_id = ? AND deleted = 0 AND substr(transaction_date, 1, 7) = ?`,
    [ledger_data.ledger_id, year_month]
  );
  return Number(income_row?.total ?? 0);
}

// "2026/04〜2026/10" for an archive's months, or "記録なし".
export function formatArchivePeriod(first_month: string | null, last_month: string | null): string {
  if (!first_month || !last_month) return "記録なし";
  const formatMonth = (year_month: string) => year_month.replace("-", "/");
  return first_month === last_month
    ? formatMonth(first_month)
    : `${formatMonth(first_month)}〜${formatMonth(last_month)}`;
}
