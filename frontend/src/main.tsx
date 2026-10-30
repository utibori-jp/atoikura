import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";

async function bootstrap() {
  // Demo build only: start MSW in the browser and seed a session so the app
  // boots straight into the authenticated UI against mocked data. The dynamic
  // import + env guard keep all demo code out of the normal production bundle.
  if (import.meta.env.VITE_DEMO === "true") {
    const { worker, seedDemoSession } = await import("./demo/browser");
    await worker.start({
      serviceWorker: { url: `${import.meta.env.BASE_URL}mockServiceWorker.js` },
      onUnhandledRequest: "bypass",
    });
    seedDemoSession();
  }

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}

void bootstrap();
