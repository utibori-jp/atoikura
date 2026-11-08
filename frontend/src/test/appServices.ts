// App services for tests that render <App />: an in-memory local database, a
// token session in memory, and a sync environment whose timers never fire. The
// network is MSW (handlers.ts), which answers the auth and sync endpoints.
import { AuthSession, type KeyValueStorage } from "../sync/authSession";
import { FakeSyncEnvironment } from "../sync/testing/fakeEnvironment";
import { openMemorySyncDb } from "../sync/testing/memoryDb";
import type { AppServices } from "../session/sessionController";

export const TEST_API_BASE = "http://localhost:8080";

export function memoryStorage(): KeyValueStorage {
  const stored_entries = new Map<string, string>();
  return {
    getItem: (key) => stored_entries.get(key) ?? null,
    setItem: (key, value) => void stored_entries.set(key, value),
    removeItem: (key) => void stored_entries.delete(key),
  };
}

export function createTestAppServices({ signed_in = true } = {}): AppServices {
  const auth_storage = memoryStorage();
  if (signed_in) {
    auth_storage.setItem("atoikura.refresh_token", "test-refresh-token");
    auth_storage.setItem("atoikura.user_id", "1");
  }
  return {
    api_base_url: TEST_API_BASE,
    auth_session: new AuthSession({
      api_base_url: TEST_API_BASE,
      storage: auth_storage,
      runExclusive: (_lock_name, task) => task(),
    }),
    openDb: () => openMemorySyncDb("test-device"),
    profile_storage: memoryStorage(),
    sync_environment: new FakeSyncEnvironment(),
  };
}
