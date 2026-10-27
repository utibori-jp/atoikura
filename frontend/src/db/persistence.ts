export type StoragePersistence = "persisted" | "best-effort" | "unsupported";

// Asks the browser not to evict this origin's storage (OPFS included) under
// storage pressure. Browsers decide by heuristics (e.g. installed PWA), so a
// "best-effort" answer is normal and not an error.
export async function requestPersistentStorage(): Promise<StoragePersistence> {
  const storage_manager = typeof navigator === "undefined" ? undefined : navigator.storage;
  if (!storage_manager?.persist || !storage_manager.persisted) return "unsupported";
  try {
    if (await storage_manager.persisted()) return "persisted";
    return (await storage_manager.persist()) ? "persisted" : "best-effort";
  } catch {
    return "best-effort";
  }
}
