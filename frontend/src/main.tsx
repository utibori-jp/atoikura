import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";

async function bootstrap() {
  // Demo build only: start MSW in the browser and seed a token so the app boots
  // straight into the authenticated UI against mocked data. The dynamic import +
  // env guard keep all demo code out of the normal production bundle.
  if (import.meta.env.VITE_DEMO === "true") {
    const [{ worker }, { token_store }] = await Promise.all([
      import("./demo/browser"),
      import("./api/client"),
    ]);
    await worker.start({
      serviceWorker: { url: `${import.meta.env.BASE_URL}mockServiceWorker.js` },
      onUnhandledRequest: "bypass",
    });
    token_store.save("demo");
  }

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}

void bootstrap();
