import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { LocalDb } from "../db/client";
import { useAppSession, useDataVersion } from "../session/sessionHooks";
import type { LedgerTarget, SyncStore } from "../sync/store";

export type { LedgerTarget };

// What screens read and write through (#201): the on-device database of the
// signed-in user's ledgers. Reads go to the local DB (or a worker query), and
// writes of offline-writable records go through the sync store, which queues
// them for push.

// solo: no household attached, the personal ledger is the whole budget.
// household: the shared household ledger.
// allowance: the personal ledger while a household is attached (お小遣い).
export type LedgerMode = "solo" | "household" | "allowance";

export interface LedgerData {
  local_db: LocalDb;
  store: SyncStore;
  // The ledger the screens show: the household ledger in household mode, else
  // the personal ledger.
  ledger_id: string;
  ledger_target: LedgerTarget;
  mode: LedgerMode;
  personal_ledger_id: string;
  // The attached household ledger, or null in solo mode.
  household_ledger_id: string | null;
  user_id: number;
}

// The view the user picked while a household is attached. It sits above every
// LedgerDataProvider (the screens and the entry sheet), so they all agree.
export interface LedgerViewState {
  preferred_target: LedgerTarget;
  setPreferredTarget: (preferred_target: LedgerTarget) => void;
}

export const LedgerViewContext = createContext<LedgerViewState>({
  preferred_target: "household",
  setPreferredTarget: () => {},
});

export function useLedgerView(): LedgerViewState {
  return useContext(LedgerViewContext);
}

const LEDGER_VIEW_STORAGE_KEY = "atoikura.ledger_view";

function readStoredLedgerView(): LedgerTarget {
  try {
    return window.localStorage.getItem(LEDGER_VIEW_STORAGE_KEY) === "personal"
      ? "personal"
      : "household";
  } catch {
    return "household";
  }
}

// The view state for LedgerViewContext, remembered on this device. The household
// view is the default once one is attached.
export function useLedgerViewState(): LedgerViewState {
  const [preferred_target, setPreferredTargetState] = useState<LedgerTarget>(readStoredLedgerView);
  const setPreferredTarget = useCallback((next_target: LedgerTarget) => {
    setPreferredTargetState(next_target);
    try {
      window.localStorage.setItem(LEDGER_VIEW_STORAGE_KEY, next_target);
    } catch {
      // Storage can be unavailable (private mode); the choice then lasts for the session.
    }
  }, []);
  return useMemo(
    () => ({ preferred_target, setPreferredTarget }),
    [preferred_target, setPreferredTarget]
  );
}

export const LedgerDataContext = createContext<LedgerData | null>(null);

export function useLedgerData(): LedgerData {
  const ledger_data = useContext(LedgerDataContext);
  if (!ledger_data) throw new Error("useLedgerData must be used inside LedgerDataProvider");
  return ledger_data;
}

// Reads the user's ledgers, or null before the first sync has brought them.
export async function loadLedgerData(
  local_db: LocalDb,
  store: SyncStore,
  user_id: number,
  preferred_target: LedgerTarget = "household"
): Promise<LedgerData | null> {
  const sync_state = await store.readSyncState();
  if (sync_state.ledger_id === null) return null;
  const personal_ledger_id = sync_state.ledger_id;
  const household_ledger_id = sync_state.household_ledger_id;
  const ledger_target: LedgerTarget =
    household_ledger_id !== null && preferred_target === "household" ? "household" : "personal";
  return {
    local_db,
    store,
    ledger_id:
      ledger_target === "household" && household_ledger_id
        ? household_ledger_id
        : personal_ledger_id,
    ledger_target,
    mode:
      household_ledger_id === null
        ? "solo"
        : ledger_target === "household"
          ? "household"
          : "allowance",
    personal_ledger_id,
    household_ledger_id,
    user_id,
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
  const { preferred_target } = useLedgerView();
  const data_version = useDataVersion();
  const [ledger_data, setLedgerData] = useState<LedgerData | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    void loadLedgerData(local_db, sync_client.store, user.id, preferred_target).then(
      (loaded_ledger_data) => {
        if (cancelled) return;
        setLedgerData((previous_ledger_data) =>
          previous_ledger_data &&
          loaded_ledger_data &&
          previous_ledger_data.ledger_id === loaded_ledger_data.ledger_id &&
          previous_ledger_data.mode === loaded_ledger_data.mode &&
          previous_ledger_data.household_ledger_id === loaded_ledger_data.household_ledger_id
            ? previous_ledger_data
            : loaded_ledger_data
        );
      }
    );
    return () => {
      cancelled = true;
    };
  }, [local_db, sync_client.store, user.id, preferred_target, data_version]);

  return ledger_data;
}
