// UUIDv7 (RFC 9562): 48-bit unix ms timestamp followed by random bits. Records
// created offline get their final ID on the device, and time ordering keeps the
// server's primary-key index compact.
export function uuidv7(
  now: () => number = Date.now,
  fillRandom: (random_bytes: Uint8Array<ArrayBuffer>) => void = (random_bytes) =>
    crypto.getRandomValues(random_bytes)
): string {
  const uuid_bytes = new Uint8Array(16);
  fillRandom(uuid_bytes);
  let timestamp_ms = Math.max(0, Math.floor(now()));
  for (let byte_index = 5; byte_index >= 0; byte_index--) {
    uuid_bytes[byte_index] = timestamp_ms % 256;
    timestamp_ms = Math.floor(timestamp_ms / 256);
  }
  uuid_bytes[6] = (uuid_bytes[6] & 0x0f) | 0x70;
  uuid_bytes[8] = (uuid_bytes[8] & 0x3f) | 0x80;
  const hex_digits = Array.from(uuid_bytes, (uuid_byte) =>
    uuid_byte.toString(16).padStart(2, "0")
  ).join("");
  return [
    hex_digits.slice(0, 8),
    hex_digits.slice(8, 12),
    hex_digits.slice(12, 16),
    hex_digits.slice(16, 20),
    hex_digits.slice(20),
  ].join("-");
}
