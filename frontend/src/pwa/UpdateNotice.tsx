import { useEffect } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { T, btnGhost, btnPrimary } from "../theme";
import { checkForAppUpdate, setAppServiceWorkerRegistration } from "./appUpdate";

// An installed PWA can stay open for days, so look for a new version regularly
// and whenever the app comes back to the foreground.
const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

// Offers a new version once its service worker is installed (#202). The new
// version waits until the user accepts — or every tab is closed — so an open
// session never mixes old and new files. Reloading loses nothing: pending
// changes stay in the local database and are sent after the restart.
export function UpdateNotice({ is_mobile = false }: { is_mobile?: boolean }) {
  const {
    needRefresh: [is_update_ready, setIsUpdateReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_service_worker_url, registration) {
      if (!registration) return;
      setAppServiceWorkerRegistration(registration);
      setInterval(checkForAppUpdate, UPDATE_CHECK_INTERVAL_MS);
    },
  });

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") checkForAppUpdate();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  if (!is_update_ready) return null;
  return (
    <div
      role="status"
      style={{
        position: "fixed",
        left: 16,
        right: 16,
        // Above the mobile tab bar.
        bottom: is_mobile ? 96 : 24,
        margin: "0 auto",
        maxWidth: 480,
        zIndex: 300,
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 16px",
        borderRadius: 16,
        background: T.card,
        border: `1.5px solid ${T.hair}`,
        boxShadow: "0 8px 24px -12px rgba(80,40,10,0.35)",
      }}
    >
      <div style={{ flex: 1, fontSize: 13, color: T.ink }}>
        <div style={{ fontWeight: 700 }}>新しいバージョンがあります</div>
        <div style={{ color: T.inkSoft, marginTop: 2 }}>
          更新すると再読み込みします。あとでにしても次回起動時に更新されます
        </div>
      </div>
      <button style={btnGhost} onClick={() => setIsUpdateReady(false)}>
        あとで
      </button>
      <button style={btnPrimary} onClick={() => void updateServiceWorker(true)}>
        更新する
      </button>
    </div>
  );
}
