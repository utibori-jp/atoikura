import { TEST_LEDGER_ID } from "../test/handlers";
import {
  seedHousehold,
  seedPersonalLedger,
  SUPERMARKET_CATEGORY_ID,
  TestLedgerServer,
} from "../test/ledgerFixtures";
import { openSyncedSession } from "../test/renderWithLedger";
import {
  listDailyNotes,
  listMonthlyReviewNotes,
  saveDailyNote,
  saveMonthlyReviewNotes,
} from "./notes";

const OTHER_MEMBER_ID = 2;
const OTHER_CATEGORY_ID = "01920000-0000-7000-8000-000000000202";

async function openLedger(seedRows?: (ledger_server: TestLedgerServer) => void) {
  const ledger_server = new TestLedgerServer();
  seedPersonalLedger(ledger_server);
  seedRows?.(ledger_server);
  return openSyncedSession(ledger_server);
}

describe("daily notes", () => {
  it("creates, updates and (when emptied) deletes the day's note", async () => {
    const { ledger_data, local_db } = await openLedger();

    await saveDailyNote(ledger_data, "2026-10-05", "はじめて");
    await saveDailyNote(ledger_data, "2026-10-05", "書き直した");
    expect(await listDailyNotes(ledger_data, "2026-10")).toEqual({ "2026-10-05": "書き直した" });
    expect(await local_db.select("SELECT COUNT(*) AS note_count FROM daily_notes")).toEqual([
      { note_count: 1 },
    ]);

    await saveDailyNote(ledger_data, "2026-10-05", "");
    expect(await listDailyNotes(ledger_data, "2026-10")).toEqual({});
    // A new note after the deletion is a new record (the tombstone keeps its ID).
    await saveDailyNote(ledger_data, "2026-10-05", "もう一度");
    expect(await listDailyNotes(ledger_data, "2026-10")).toEqual({ "2026-10-05": "もう一度" });
  });

  it("lists only the signed-in user's notes of the month", async () => {
    const { ledger_data } = await openLedger((ledger_server) => {
      ledger_server.putRow(
        "daily_notes",
        "01920000-0000-7000-8000-000000000501",
        { date: "2026-10-01", note: "他の人のメモ" },
        OTHER_MEMBER_ID
      );
      ledger_server.putRow("daily_notes", "01920000-0000-7000-8000-000000000502", {
        date: "2026-09-30",
        note: "先月のメモ",
      });
    });

    expect(await listDailyNotes(ledger_data, "2026-10")).toEqual({});
  });

  it("refuses a note over 500 characters", async () => {
    const { ledger_data } = await openLedger();

    await expect(saveDailyNote(ledger_data, "2026-10-05", "あ".repeat(501))).rejects.toThrow(
      "noteは500文字以内で入力してください"
    );
  });
});

describe("monthly review notes", () => {
  it("saves the given categories' notes and deletes emptied ones", async () => {
    const { ledger_data } = await openLedger((ledger_server) => {
      ledger_server.putRow("monthly_review_notes", "01920000-0000-7000-8000-000000000601", {
        year_month: "2026-09",
        category_id: OTHER_CATEGORY_ID,
        note: "消すメモ",
      });
    });

    await saveMonthlyReviewNotes(ledger_data, "2026-09", {
      [SUPERMARKET_CATEGORY_ID]: "使いすぎ",
      [OTHER_CATEGORY_ID]: "",
    });

    expect(await listMonthlyReviewNotes(ledger_data, "2026-09")).toEqual({
      [SUPERMARKET_CATEGORY_ID]: "使いすぎ",
    });
    expect(await listMonthlyReviewNotes(ledger_data, "2026-10")).toEqual({});
  });

  it("checks every note before saving any", async () => {
    const { ledger_data } = await openLedger();

    await expect(
      saveMonthlyReviewNotes(ledger_data, "2026-09", {
        [SUPERMARKET_CATEGORY_ID]: "ok",
        [OTHER_CATEGORY_ID]: "あ".repeat(501),
      })
    ).rejects.toThrow("noteは500文字以内で入力してください");
    expect(await listMonthlyReviewNotes(ledger_data, "2026-09")).toEqual({});
  });
});

describe("notes with a household attached", () => {
  it("keeps the user's notes in their personal ledger in either view", async () => {
    const { ledger_data, local_db } = await openLedger((ledger_server) =>
      seedHousehold(ledger_server)
    );
    expect(ledger_data.mode).toBe("household");

    await saveDailyNote(ledger_data, "2026-10-05", "家計の日のメモ");

    expect(await listDailyNotes(ledger_data, "2026-10")).toEqual({
      "2026-10-05": "家計の日のメモ",
    });
    const [note_row] = await local_db.select("SELECT ledger_id FROM daily_notes");
    expect(note_row.ledger_id).toBe(TEST_LEDGER_ID);
  });
});
