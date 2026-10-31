import {
  seedArchive,
  seedPersonalLedger,
  TEST_ARCHIVE_ID,
  TestLedgerServer,
} from "../test/ledgerFixtures";
import { openSyncedSession } from "../test/renderWithLedger";
import { formatArchivePeriod, invitationLink, joinTokenFromHash, listArchives } from "./household";

describe("invitation links", () => {
  it("puts the token in the fragment and reads it back", () => {
    const invitation_url = new URL(
      invitationLink("tok/en+1", { origin: "https://app.test", pathname: "/" } as Location)
    );
    expect(invitation_url.origin + invitation_url.pathname).toBe("https://app.test/");
    expect(invitation_url.search).toBe("");
    expect(joinTokenFromHash(invitation_url.hash)).toBe("tok/en+1");
  });

  it("ignores other fragments and malformed tokens", () => {
    expect(joinTokenFromHash("")).toBeNull();
    expect(joinTokenFromHash("#top")).toBeNull();
    expect(joinTokenFromHash("#join=")).toBeNull();
    expect(joinTokenFromHash("#join=%E0%A4%A")).toBeNull();
  });
});

describe("past households", () => {
  it("lists archives with the months they span", async () => {
    const ledger_server = new TestLedgerServer();
    seedPersonalLedger(ledger_server);
    seedArchive(ledger_server, {
      name: "前の家計",
      entries: [{ transaction_date: "2026-05-03", amount: 100 }],
      incomes: [{ transaction_date: "2026-07-25", amount: 1000 }],
    });
    const { ledger_data } = await openSyncedSession(ledger_server);

    expect(await listArchives(ledger_data)).toEqual([
      {
        ledger_id: TEST_ARCHIVE_ID,
        name: "前の家計",
        first_month: "2026-05",
        last_month: "2026-07",
      },
    ]);
  });

  it("formats the period", () => {
    expect(formatArchivePeriod("2026-04", "2026-10")).toBe("2026/04〜2026/10");
    expect(formatArchivePeriod("2026-04", "2026-04")).toBe("2026/04");
    expect(formatArchivePeriod(null, null)).toBe("記録なし");
  });
});
