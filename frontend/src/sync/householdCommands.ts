import type { CommandSender } from "./ledgerCommands";
import type { JsonMethod } from "./transport";

// Typed wrappers for the household lifecycle (sync-api.yaml, /household/*). The
// caller and their household always come from the token. Creating, joining,
// leaving and dissolving change which ledgers the device holds; the next sync
// picks that up.

export type JsonSender = (
  method: JsonMethod,
  path: string,
  request_body?: unknown
) => Promise<unknown>;

export interface HouseholdInvitation {
  id: string;
  short_code: string;
  // ISO timestamp; an invitation is valid for 24 hours and works once.
  expires_at: string;
  // Only in the response that created it: the secret of the invitation link.
  token?: string;
  created_by?: number;
}

export type JoinCredential = { token: string } | { code: string };

interface HouseholdLedgerBody {
  household_ledger_id: string;
}

export function createHouseholdCommands(send_json: JsonSender, send_row: CommandSender) {
  return {
    createHousehold: async (name: string): Promise<string> =>
      ((await send_json("POST", "/household", { name })) as HouseholdLedgerBody)
        .household_ledger_id,
    createInvitation: async (): Promise<HouseholdInvitation> =>
      (await send_json("POST", "/household/invitations")) as HouseholdInvitation,
    listInvitations: async (): Promise<HouseholdInvitation[]> =>
      ((await send_json("GET", "/household/invitations")) as { invitations: HouseholdInvitation[] })
        .invitations,
    revokeInvitation: async (invitation_id: string): Promise<void> => {
      await send_json("DELETE", `/household/invitations/${encodeURIComponent(invitation_id)}`);
    },
    joinHousehold: async (join_credential: JoinCredential): Promise<string> =>
      ((await send_json("POST", "/household/join", join_credential)) as HouseholdLedgerBody)
        .household_ledger_id,
    leaveHousehold: async (): Promise<void> => {
      await send_json("POST", "/household/leave");
    },
    dissolveHousehold: async (): Promise<void> => {
      await send_json("POST", "/household/dissolve");
    },
    removeMember: async (member_id: number): Promise<void> => {
      await send_json("DELETE", `/household/members/${encodeURIComponent(String(member_id))}`);
    },
    // A member's allowance from effective_from (YYYY-MM) on.
    putAllowance: (member_id: number, effective_from: string, amount: number) =>
      send_row("PUT", "/household/allowances", { member_id, effective_from, amount }),
  };
}

export type HouseholdCommands = ReturnType<typeof createHouseholdCommands>;
