import { createContext, useContext, useEffect, useState } from "react";
import type { LocalDb } from "../db/client";
import { useAppSession, useDataVersion } from "../session/sessionHooks";
import type { SyncStore } from "../sync/store";

// What screens read and write through (#201): the on-device database of the
// signed-in user's ledger. Reads go to the local DB (or a worker query), and
// writes of offline-writable records go through the sync store, which queues
// them for push.

export interface LedgerData {
  local_db: LocalDb;
  store: SyncStore;
  ledger_id: string;
  user_id: number;
  is_household: boolean;
}

export const LedgerDataContext = createContext<LedgerData | null>(null);

export function useLedgerData(): LedgerData {
  const ledger_data = useContext(LedgerDataContext);
  if (!ledger_data) throw new Error("useLedgerData must be used inside LedgerDataProvider");
  return ledger_data;
}

// Reads the current ledger, or null before the first sync has brought it.
export async function loadLedgerData(
  local_db: LocalDb,
  store: SyncStore,
  user_id: number
): Promise<LedgerData | null> {
  const sync_state = await store.readSyncState();
  if (sync_state.ledger_id === null) return null;
  const [ledger_row] = await local_db.select("SELECT kind FROM ledgers WHERE id = ?", [
    sync_state.ledger_id,
  ]);
  return {
    local_db,
    store,
    ledger_id: sync_state.ledger_id,
    user_id,
    is_household: ledger_row?.kind === "household",
  };
}

export interface LocalDataState<TData> {
  // null until the first load finishes; kept while later reloads run.
  data: TData | null;
  error_message: string | null;
}

// Loads screen data from the local database and reloads it whenever local data
// changes (a local write or a sync) or a dependency changes. The previous data
// stays on screen while it reloads, so syncs don't flash a loading state.
export function useLocalData<TData>(
  loadData: (ledger_data: LedgerData) => Promise<TData>,
  dependencies: readonly unknown[]
): LocalDataState<TData> {
  const ledger_data = useLedgerData();
  const data_version = useDataVersion();
  const [data_state, setDataState] = useState<LocalDataState<TData>>({
    data: null,
    error_message: null,
  });

  useEffect(() => {
    let cancelled = false;
    loadData(ledger_data).then(
      (loaded_data) => {
        if (!cancelled) setDataState({ data: loaded_data, error_message: null });
      },
      (load_error: unknown) => {
        if (cancelled) return;
        setDataState((previous_state) => ({
          data: previous_state.data,
          error_message:
            load_error instanceof Error ? load_error.message : "データを読み込めませんでした",
        }));
      }
    );
    return () => {
      cancelled = true;
    };
    // loadData is a new function on every render; the caller lists what it reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ledger_data, data_version, ...dependencies]);

  return data_state;
}

// The ledger of the current session, re-read when a sync changes it: undefined
// while loading, null until the first sync has brought it.
export function useLoadedLedgerData(): LedgerData | null | undefined {
  const { local_db, sync_client, user } = useAppSession();
  const data_version = useDataVersion();
  const [ledger_data, setLedgerData] = useState<LedgerData | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    void loadLedgerData(local_db, sync_client.store, user.id).then((loaded_ledger_data) => {
      if (cancelled) return;
      setLedgerData((previous_ledger_data) =>
        previous_ledger_data &&
        loaded_ledger_data &&
        previous_ledger_data.ledger_id === loaded_ledger_data.ledger_id &&
        previous_ledger_data.is_household === loaded_ledger_data.is_household
          ? previous_ledger_data
          : loaded_ledger_data
      );
    });
    return () => {
      cancelled = true;
    };
  }, [local_db, sync_client.store, user.id, data_version]);

  return ledger_data;
}
