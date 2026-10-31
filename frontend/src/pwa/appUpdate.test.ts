import {
  checkForAppUpdate,
  deleteLegacyApiCaches,
  setAppServiceWorkerRegistration,
} from "./appUpdate";

function fakeCacheStorage(cache_names: string[]) {
  return {
    keys: vi.fn().mockResolvedValue(cache_names),
    delete: vi.fn().mockResolvedValue(true),
  } as unknown as CacheStorage & { delete: ReturnType<typeof vi.fn> };
}

describe("deleteLegacyApiCaches", () => {
  it("deletes the old API response caches and keeps the app shell and fonts", async () => {
    const cache_storage = fakeCacheStorage([
      "workbox-precache-v2-https://atoikura.app/",
      "workbox-runtime-https://atoikura.app/",
      "google-fonts-webfonts",
    ]);

    await deleteLegacyApiCaches(cache_storage);

    expect(cache_storage.delete.mock.calls).toEqual([["workbox-runtime-https://atoikura.app/"]]);
  });

  it("is a no-op when the Cache Storage API is unavailable", async () => {
    await expect(deleteLegacyApiCaches(undefined)).resolves.toBeUndefined();
  });
});

describe("checkForAppUpdate", () => {
  afterEach(() => setAppServiceWorkerRegistration(null));

  it("asks the registered service worker to look for a new version", () => {
    const update = vi.fn().mockResolvedValue(undefined);
    setAppServiceWorkerRegistration({ update } as unknown as ServiceWorkerRegistration);

    checkForAppUpdate();

    expect(update).toHaveBeenCalledTimes(1);
  });

  it("does nothing before a service worker is registered", () => {
    expect(() => checkForAppUpdate()).not.toThrow();
  });
});
