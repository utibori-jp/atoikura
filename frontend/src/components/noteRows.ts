// Rows for a note's textarea: one per line, so a note merged from two devices
// (joined with a newline by the server) shows both parts.
export function noteRows(note: string): number {
  return Math.max(1, note.split("\n").length);
}
