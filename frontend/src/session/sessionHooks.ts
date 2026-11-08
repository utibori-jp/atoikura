import { useContext, useEffect, useState, useSyncExternalStore } from "react";
import type { SyncStatus } from "../sync/engine";
import { SessionContext } from "./sessionContextValue";
import type { AppSession } from "./sessionController";

export function useAppSession(): AppSession {
  const app_session = useContext(SessionContext);
  if (!app_session) throw new Error("useAppSession must be used inside SessionProvider");
  return app_session;
}

export function useSyncStatus(): SyncStatus {
  const { engine } = useAppSession().sync_client;
  return useSyncExternalStore(engine.subscribe, engine.getStatus);
}

// A counter that changes whenever local data changes, from a local write or a
// sync. Screens add it to their load effect's dependencies to re-read.
export function useDataVersion(): number {
  const { store } = useAppSession().sync_client;
  const [data_version, setDataVersion] = useState(0);
  useEffect(
    () => store.subscribe(() => setDataVersion((previous_version) => previous_version + 1)),
    [store]
  );
  return data_version;
}
