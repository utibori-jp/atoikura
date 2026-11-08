// Hybrid logical clock for field-level LWW (docs/local-first/design.md §4).
//
// Format: "<13-digit unix ms>-<4 hex counter>-<device>", e.g.
// "1792915200000-0000-0f3c9a...". Fixed-width parts make string comparison
// equal to clock order, which is how both the server and this client compare.

export const HLC_PATTERN = /^([0-9]{13})-([0-9a-f]{4})-([0-9A-Za-z_-]{1,32})$/;

const MAX_COUNTER = 0xffff;
const MAX_DEVICE_PART_LENGTH = 32;

export interface ParsedHlc {
  wall_ms: number;
  counter: number;
  device_part: string;
}

export function parseHlc(hlc: string): ParsedHlc | null {
  const hlc_match = HLC_PATTERN.exec(hlc);
  if (!hlc_match) return null;
  return {
    wall_ms: Number(hlc_match[1]),
    counter: parseInt(hlc_match[2], 16),
    device_part: hlc_match[3],
  };
}

export function formatHlc(wall_ms: number, counter: number, device_part: string): string {
  return `${String(wall_ms).padStart(13, "0")}-${counter.toString(16).padStart(4, "0")}-${device_part}`;
}

// The device ID is a UUID (36 characters with hyphens); its 32 hex digits fit
// the HLC's device part.
export function hlcDevicePart(device_id: string): string {
  const device_part = device_id.replace(/[^0-9A-Za-z_]/g, "");
  if (device_part === "") throw new Error("device_id has no usable characters");
  return device_part.slice(0, MAX_DEVICE_PART_LENGTH);
}

export class HlcClock {
  private last_wall_ms = 0;
  private last_counter = 0;
  private readonly device_part: string;
  private readonly now: () => number;

  constructor(device_part: string, now: () => number = Date.now) {
    this.device_part = device_part;
    this.now = now;
  }

  // Returns an HLC greater than every HLC this clock has issued or observed.
  tick(): string {
    const wall_ms = this.now();
    if (wall_ms > this.last_wall_ms) {
      this.last_wall_ms = wall_ms;
      this.last_counter = 0;
    } else if (this.last_counter < MAX_COUNTER) {
      this.last_counter += 1;
    } else {
      // Counter exhausted within one millisecond: borrow the next millisecond.
      this.last_wall_ms += 1;
      this.last_counter = 0;
    }
    return formatHlc(this.last_wall_ms, this.last_counter, this.device_part);
  }

  // Moves the clock past a remote HLC so that a later local edit wins over it.
  observe(remote_hlc: string): void {
    const parsed_remote = parseHlc(remote_hlc);
    if (!parsed_remote) return;
    if (parsed_remote.wall_ms > this.last_wall_ms) {
      this.last_wall_ms = parsed_remote.wall_ms;
      this.last_counter = parsed_remote.counter;
    } else if (
      parsed_remote.wall_ms === this.last_wall_ms &&
      parsed_remote.counter > this.last_counter
    ) {
      this.last_counter = parsed_remote.counter;
    }
  }
}
