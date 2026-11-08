import { requestPersistentStorage } from "./persistence";

function stubStorageManager(storage_stub: Partial<StorageManager> | undefined): void {
  Object.defineProperty(navigator, "storage", { value: storage_stub, configurable: true });
}

afterEach(() => {
  stubStorageManager(undefined);
});

describe("requestPersistentStorage", () => {
  it("does not ask again when storage is already persisted", async () => {
    const persist_mock = vi.fn().mockResolvedValue(true);
    stubStorageManager({ persisted: vi.fn().mockResolvedValue(true), persist: persist_mock });

    await expect(requestPersistentStorage()).resolves.toBe("persisted");
    expect(persist_mock).not.toHaveBeenCalled();
  });

  it("asks for persistence and reports the browser's decision", async () => {
    stubStorageManager({
      persisted: vi.fn().mockResolvedValue(false),
      persist: vi.fn().mockResolvedValue(false),
    });

    await expect(requestPersistentStorage()).resolves.toBe("best-effort");
  });

  it("reports unsupported when the Storage API is missing", async () => {
    stubStorageManager(undefined);

    await expect(requestPersistentStorage()).resolves.toBe("unsupported");
  });
});
