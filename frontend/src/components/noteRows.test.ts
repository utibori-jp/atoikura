import { noteRows } from "./noteRows";

describe("noteRows", () => {
  it("gives one row per line and at least one", () => {
    expect(noteRows("")).toBe(1);
    expect(noteRows("スマホのメモ")).toBe(1);
    expect(noteRows("スマホのメモ\nPCのメモ")).toBe(2);
  });
});
