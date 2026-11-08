import { HLC_PATTERN, HlcClock, formatHlc, hlcDevicePart, parseHlc } from "./hlc";
import { uuidv7 } from "./uuid";

const DEVICE_PART = hlcDevicePart("4f9c2b7e-1d3a-4e5f-8a6b-0c1d2e3f4a5b");

describe("HlcClock", () => {
  it("produces the server's HLC format with a 32-character device part", () => {
    const hlc_clock = new HlcClock(DEVICE_PART, () => 1_792_915_200_000);

    const issued_hlc = hlc_clock.tick();

    expect(issued_hlc).toBe("1792915200000-0000-4f9c2b7e1d3a4e5f8a6b0c1d2e3f4a5b");
    expect(HLC_PATTERN.test(issued_hlc)).toBe(true);
  });

  it("stays monotonic when the wall clock stalls or goes backwards", () => {
    let wall_ms = 1_792_915_200_000;
    const hlc_clock = new HlcClock(DEVICE_PART, () => wall_ms);

    const first_hlc = hlc_clock.tick();
    const second_hlc = hlc_clock.tick();
    wall_ms -= 60_000;
    const third_hlc = hlc_clock.tick();

    expect(second_hlc > first_hlc).toBe(true);
    expect(third_hlc > second_hlc).toBe(true);
    expect(parseHlc(third_hlc)).toMatchObject({ wall_ms: 1_792_915_200_000, counter: 2 });
  });

  it("borrows the next millisecond when the counter is exhausted", () => {
    const hlc_clock = new HlcClock(DEVICE_PART, () => 1000);
    hlc_clock.observe(formatHlc(1000, 0xffff, "other"));

    expect(parseHlc(hlc_clock.tick())).toMatchObject({ wall_ms: 1001, counter: 0 });
  });

  it("issues HLCs above every observed remote HLC", () => {
    const hlc_clock = new HlcClock(DEVICE_PART, () => 1_000);
    const remote_hlc = formatHlc(5_000, 7, "zzzz");

    hlc_clock.observe(remote_hlc);

    expect(hlc_clock.tick() > remote_hlc).toBe(true);
  });
});

describe("uuidv7", () => {
  it("encodes the timestamp and version bits and sorts by time", () => {
    const zero_random = (random_bytes: Uint8Array) => random_bytes.fill(0);

    const earlier_id = uuidv7(() => 0x0192_0000_0000, zero_random);
    const later_id = uuidv7(() => 0x0192_0000_0001, zero_random);

    expect(earlier_id).toBe("01920000-0000-7000-8000-000000000000");
    expect(later_id > earlier_id).toBe(true);
    expect(uuidv7()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
  });
});
