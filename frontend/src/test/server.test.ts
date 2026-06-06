import { describe, it, expect } from "vitest";
import { server } from "./server";

describe("MSW server", () => {
  it("can be imported without error", () => {
    expect(server).toBeDefined();
  });
});
