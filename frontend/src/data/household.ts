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
