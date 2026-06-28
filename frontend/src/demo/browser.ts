// MSW browser worker for the static demo build (#142). Imported dynamically
// from main.tsx only when VITE_DEMO=true, so it is tree-shaken out of normal builds.
import { setupWorker } from "msw/browser";
import { demoHandlers } from "./handlers";

export const worker = setupWorker(...demoHandlers);
