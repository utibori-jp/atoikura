import type { ReactNode } from "react";
import { SessionContext } from "./sessionContextValue";
import type { AppSession } from "./sessionController";

// Gives screens the signed-in session: the user, the local database and the
// sync client (#201). Screens read it through the hooks in sessionHooks.ts.
export function SessionProvider({
  session,
  children,
}: {
  session: AppSession;
  children: ReactNode;
}) {
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}
