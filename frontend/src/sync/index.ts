import type { LocalDb } from "../db/client";
import type { AuthSession } from "./authSession";
import { SyncEngine, type SyncEnvironment } from "./engine";
import { createHouseholdCommands } from "./householdCommands";
import { createLedgerCommands, type CommandSender } from "./ledgerCommands";
import { SyncStore } from "./store";
import { HttpSyncTransport } from "./transport";

// Wires the sync layer for the app. Screens are connected to it in Step 4a (#201):
// offline-writable data goes through store.createRecord / updateRecord /
// deleteRecord, online-only edits through ledger_commands, and engine.subscribe
// drives the sync status indicator.

export interface SyncClientOptions {
  local_db: LocalDb;
  api_base_url: string;
  auth_session: AuthSession;
  environment?: SyncEnvironment;
}

export function createSyncClient(options: SyncClientOptions) {
  const auth_session = options.auth_session;
  const transport = new HttpSyncTransport({
    api_base_url: options.api_base_url,
    auth: auth_session,
  });
  const store = new SyncStore(options.local_db);
  const engine = new SyncEngine({ store, transport, environment: options.environment });
  const send_command: CommandSender = (method, path, request_body) =>
    engine.runCommand(() => transport.sendCommand(method, path, request_body));
  const ledger_commands = createLedgerCommands(send_command);
  const household_ledger_commands = createLedgerCommands(send_command, "household");
  const household_commands = createHouseholdCommands(
    (method, path, request_body) =>
      engine.runOnline(() => transport.sendJson(method, path, request_body)),
    send_command
  );
  return {
    auth_session,
    transport,
    store,
    engine,
    ledger_commands,
    household_ledger_commands,
    household_commands,
  };
}

export type SyncClient = ReturnType<typeof createSyncClient>;
