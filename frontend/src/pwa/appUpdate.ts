// The app's service worker registration (#202), so code that learns a newer
// version may exist (the server answering "update required") can look for it.
// Finding one shows the update prompt.

let app_service_worker_registration: ServiceWorkerRegistration | null = null;

export function setAppServiceWorkerRegistration(
  registration: ServiceWorkerRegistration | null
): void {
  app_service_worker_registration = registration;
}

export function checkForAppUpdate(): void {
  app_service_worker_registration?.update().catch(() => {
    // Offline or the server is unreachable: the next check tries again.
  });
}

// Cache names the earlier service worker used for API responses. Data is local
// now, so those responses (another user's, after a sign-out) must not linger.
const LEGACY_RUNTIME_CACHE_PREFIX = "workbox-runtime";

export async function deleteLegacyApiCaches(
  cache_storage: CacheStorage | undefined = globalThis.caches
): Promise<void> {
  if (!cache_storage) return;
  try {
    const cache_names = await cache_storage.keys();
    await Promise.all(
      cache_names
        .filter((cache_name) => cache_name.startsWith(LEGACY_RUNTIME_CACHE_PREFIX))
        .map((cache_name) => cache_storage.delete(cache_name))
    );
  } catch {
    // Best-effort: the caches are no longer read by anything.
  }
}
