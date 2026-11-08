import { createContext } from "react";
import type { AppSession } from "./sessionController";

// Holds the signed-in session for screens (#201). Kept apart from the provider
// component so that fast refresh works.
export const SessionContext = createContext<AppSession | null>(null);
