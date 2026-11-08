import { useMemo, useState } from "react";
import type React from "react";
import {
  archiveLedgerData,
  formatArchivePeriod,
  listArchives,
  sumMonthlyIncome,
} from "../data/household";
import { listJournalDays } from "../data/journal";
import { LedgerDataContext, useLedgerData, useLocalData } from "../data/ledgerData";
import { loadMonthlyBreakdownItems, type MonthlyBreakdownItem } from "../data/spending";
import { T, btnGhost, card } from "../theme";
import { emojiForGroup } from "./mobile/groupEmoji";
import { MonthSwitcher } from "./MonthSwitcher";

// A past household, read-only (design.md §6): its journal and the month's
// category totals. It reads through the same data functions as the main screens,
// pointed at the archive ledger, and offers no way to edit it.

interface ArchiveViewerProps {
  archive_ledger_id: string;
  onBack: () => void;
  is_mobile?: boolean;
}

type ArchiveView = "journal" | "review";

const yen = (amount: number) => `¥${Math.round(amount).toLocaleString("ja-JP")}`;

export function ArchiveViewer({
  archive_ledger_id,
  onBack,
  is_mobile = false,
}: ArchiveViewerProps) {
  const ledger_data = useLedgerData();
  const archive_data = useMemo(
    () => archiveLedgerData(ledger_data, archive_ledger_id),
    [ledger_data, archive_ledger_id]
  );
  return (
    <LedgerDataContext.Provider value={archive_data}>
      <ArchiveContent onBack={onBack} is_mobile={is_mobile} />
    </LedgerDataContext.Provider>
  );
}

function ArchiveContent({ onBack, is_mobile }: { onBack: () => void; is_mobile: boolean }) {
  const { ledger_id } = useLedgerData();
  const { data: archives } = useLocalData(listArchives, []);
  const archive = archives?.find((listed_archive) => listed_archive.ledger_id === ledger_id);
  const [archive_view, setArchiveView] = useState<ArchiveView>("journal");
  // null until picked: the archive's last month.
  const [picked_month, setPickedMonth] = useState<string | null>(null);

  if (!archives) {
    return <p style={{ color: T.inkSoft, fontSize: 14, textAlign: "center" }}>読み込み中…</p>;
  }
  if (!archive) {
    return (
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <button type="button" style={btnGhost} onClick={onBack}>
          ‹ 戻る
        </button>
        <p style={{ color: T.inkSoft, fontSize: 14 }}>この家計の記録は見つかりません。</p>
      </div>
    );
  }
  const year_month = picked_month ?? archive.last_month;

  return (
    <div
      style={{ maxWidth: 640, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button type="button" style={btnGhost} onClick={onBack}>
          ‹ 戻る
        </button>
        <h2
          style={{
            fontFamily: "'Zen Maru Gothic', 'M PLUS Rounded 1c', sans-serif",
            fontSize: 20,
            fontWeight: 900,
            margin: 0,
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {archive.name || "過去の家計"}
        </h2>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            padding: "3px 10px",
            borderRadius: 999,
            background: T.bgSoft,
            border: `1px solid ${T.hair}`,
            color: T.inkSoft,
            whiteSpace: "nowrap",
          }}
        >
          閲覧専用
        </span>
      </div>
      <div style={{ fontSize: 12, color: T.inkSoft, marginTop: -8 }}>
        {formatArchivePeriod(archive.first_month, archive.last_month)}
      </div>

      {year_month === null ? (
        <p style={{ color: T.inkSoft, fontSize: 14 }}>この家計には記録がありません。</p>
      ) : (
        <>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <div
              role="group"
              aria-label="表示する内容"
              style={{ display: "inline-flex", padding: 4, borderRadius: 999, background: T.card }}
            >
              {(
                [
                  ["journal", "仕訳"],
                  ["review", "振り返り"],
                ] as const
              ).map(([view_key, view_label]) => (
                <button
                  key={view_key}
                  type="button"
                  aria-pressed={archive_view === view_key}
                  onClick={() => setArchiveView(view_key)}
                  style={{
                    border: "none",
                    borderRadius: 999,
                    padding: "6px 16px",
                    fontFamily: "inherit",
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: "pointer",
                    background: archive_view === view_key ? T.coral : "transparent",
                    color: archive_view === view_key ? "#fff" : T.inkSoft,
                  }}
                >
                  {view_label}
                </button>
              ))}
            </div>
            <MonthSwitcher
              year_month={year_month}
              onYearMonthChange={setPickedMonth}
              min_month={archive.first_month ?? year_month}
              max_month={archive.last_month ?? year_month}
              is_mobile={is_mobile}
            />
          </div>
          {archive_view === "journal" ? (
            <ArchiveJournal year_month={year_month} />
          ) : (
            <ArchiveReview year_month={year_month} />
          )}
        </>
      )}
    </div>
  );
}

const empty_month_style: React.CSSProperties = {
  ...card,
  color: T.inkSoft,
  fontSize: 14,
  textAlign: "center",
};

function ArchiveJournal({ year_month }: { year_month: string }) {
  const { data: journal_days } = useLocalData(
    (archive_data) => listJournalDays(archive_data, year_month),
    [year_month]
  );
  if (!journal_days) return null;
  if (journal_days.length === 0) {
    return <div style={empty_month_style}>この月の支出はありません</div>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {journal_days.map((journal_day) => (
        <section
          key={journal_day.date}
          aria-label={journal_day.date}
          style={{ ...card, padding: "14px 18px" }}
        >
          <div style={{ fontSize: 12, color: T.inkSoft, fontWeight: 700, marginBottom: 4 }}>
            {Number(journal_day.date.slice(5, 7))}/{Number(journal_day.date.slice(8, 10))}
          </div>
          {journal_day.journal_entries.map((journal_entry) => (
            <div
              key={journal_entry.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "8px 0",
                borderTop: `1px solid ${T.hair}`,
              }}
            >
              <span style={{ fontSize: 20 }}>{emojiForGroup(journal_entry.group_name)}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>
                  {journal_entry.item || journal_entry.category_name}
                </div>
                <div style={{ fontSize: 11, color: T.inkSoft }}>
                  {journal_entry.group_name} · {journal_entry.category_name}
                  {journal_entry.is_excluded && " · 対象外"}
                </div>
              </div>
              <span
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontWeight: 700,
                  color: journal_entry.is_excluded ? T.excluded : T.ink,
                }}
              >
                {yen(journal_entry.amount)}
              </span>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

function ArchiveReview({ year_month }: { year_month: string }) {
  const { data: review_data } = useLocalData(
    async (archive_data) => ({
      breakdown: await loadMonthlyBreakdownItems(archive_data, year_month),
      income_total: await sumMonthlyIncome(archive_data, year_month),
    }),
    [year_month]
  );
  if (!review_data) return null;
  const statement_groups = new Map<string, MonthlyBreakdownItem[]>();
  for (const breakdown_item of [...review_data.breakdown].sort(
    (left_item, right_item) =>
      left_item.statement_type_order - right_item.statement_type_order ||
      right_item.total - left_item.total
  )) {
    const group_items = statement_groups.get(breakdown_item.statement_type_name) ?? [];
    group_items.push(breakdown_item);
    statement_groups.set(breakdown_item.statement_type_name, group_items);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div
        style={{ ...card, padding: "14px 18px", display: "flex", justifyContent: "space-between" }}
      >
        <span style={{ fontWeight: 700 }}>収入</span>
        <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, color: T.sageDeep }}>
          {yen(review_data.income_total)}
        </span>
      </div>
      {statement_groups.size === 0 ? (
        <div style={empty_month_style}>この月の支出はありません</div>
      ) : (
        [...statement_groups].map(([statement_type_name, group_items]) => (
          <section
            key={statement_type_name}
            aria-label={statement_type_name}
            style={{ ...card, padding: "14px 18px" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontWeight: 700 }}>{statement_type_name}</span>
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 800 }}>
                {yen(group_items.reduce((running_sum, item) => running_sum + item.total, 0))}
              </span>
            </div>
            {group_items.map((breakdown_item) => (
              <div
                key={breakdown_item.category_id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "6px 0",
                  borderTop: `1px solid ${T.hair}`,
                  fontSize: 13,
                }}
              >
                <span style={{ color: T.inkSoft }}>
                  {breakdown_item.group_name} · {breakdown_item.category_name}
                </span>
                <span style={{ fontFamily: "'DM Sans', sans-serif" }}>
                  {yen(breakdown_item.total)}
                </span>
              </div>
            ))}
          </section>
        ))
      )}
    </div>
  );
}
