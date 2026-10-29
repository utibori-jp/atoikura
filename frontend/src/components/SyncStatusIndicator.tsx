import { useEffect, useState } from "react";
import type React from "react";
import { useAppSession, useSyncStatus } from "../session/sessionHooks";
import type { SyncPhase, SyncStatus } from "../sync/engine";
import type { SyncRejection } from "../sync/store";
import { T, btnGhost, btnPrimary } from "../theme";
import { Modal } from "./Modal";

// Sync status in the header (#201, moved here from #204): a small pill that says
// whether changes are saved to the server, and a dialog with the details and
// the changes the server refused.

const COLLECTION_LABELS: Record<string, string> = {
  journal_entries: "支出",
  daily_notes: "日記メモ",
  monthly_review_notes: "振り返りメモ",
};

interface PillAppearance {
  label: string;
  color: string;
  background: string;
}

function pillAppearance(sync_status: SyncStatus): PillAppearance {
  const phase_appearance: Record<SyncPhase, PillAppearance> = {
    idle: { label: "同期済み", color: T.sageDeep, background: T.sageSoft },
    syncing: { label: "同期中…", color: T.inkSoft, background: T.bgSoft },
    offline: { label: "オフライン", color: T.inkSoft, background: T.hair },
    error: { label: "同期エラー", color: T.dangerDeep, background: T.coralSoft },
    auth_required: { label: "要ログイン", color: T.dangerDeep, background: T.coralSoft },
    update_required: { label: "要アップデート", color: T.dangerDeep, background: T.coralSoft },
  };
  const appearance = phase_appearance[sync_status.phase];
  if (sync_status.rejection_count > 0) {
    return {
      label: `保存できなかった変更 ${sync_status.rejection_count}件`,
      color: T.dangerDeep,
      background: T.coralSoft,
    };
  }
  if (sync_status.phase !== "syncing" && sync_status.pending_count > 0) {
    return { ...appearance, label: `${appearance.label}・未送信 ${sync_status.pending_count}件` };
  }
  return appearance;
}

function formatSyncedAt(synced_at: string | null): string {
  if (!synced_at) return "まだ同期していません";
  return new Date(synced_at).toLocaleString("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function SyncStatusIndicator({ is_mobile = false }: { is_mobile?: boolean }) {
  const sync_status = useSyncStatus();
  const [details_requested, setDetailsRequested] = useState(false);
  // The rejection count the user last closed the dialog at.
  const [seen_rejection_count, setSeenRejectionCount] = useState(0);
  const appearance = pillAppearance(sync_status);
  // A refused change is something the user has to know about: the details open
  // on their own whenever the count changes to one not seen yet.
  const show_details =
    details_requested ||
    (sync_status.rejection_count > 0 && sync_status.rejection_count !== seen_rejection_count);

  return (
    <>
      <button
        type="button"
        onClick={() => setDetailsRequested(true)}
        aria-label={`同期状態: ${appearance.label}`}
        style={{
          border: "none",
          borderRadius: 999,
          padding: is_mobile ? "4px 10px" : "6px 12px",
          fontSize: is_mobile ? 11 : 12,
          fontWeight: 700,
          fontFamily: "inherit",
          color: appearance.color,
          background: appearance.background,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {appearance.label}
      </button>
      {show_details && (
        <SyncDetailsModal
          sync_status={sync_status}
          is_mobile={is_mobile}
          onClose={() => {
            setDetailsRequested(false);
            setSeenRejectionCount(sync_status.rejection_count);
          }}
        />
      )}
    </>
  );
}

const detail_row_style: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  fontSize: 13,
  padding: "8px 0",
  borderBottom: `1px solid ${T.hair}`,
};

function SyncDetailsModal({
  sync_status,
  is_mobile,
  onClose,
}: {
  sync_status: SyncStatus;
  is_mobile: boolean;
  onClose: () => void;
}) {
  const { sync_client } = useAppSession();
  const [rejections, setRejections] = useState<SyncRejection[]>([]);

  useEffect(() => {
    let cancelled = false;
    void sync_client.store.listRejections().then((listed_rejections) => {
      if (!cancelled) setRejections(listed_rejections);
    });
    return () => {
      cancelled = true;
    };
  }, [sync_client, sync_status.rejection_count]);

  const dismissRejections = async () => {
    await sync_client.engine.dismissRejections(
      rejections.map((rejection) => rejection.rejection_id)
    );
  };

  return (
    <Modal title="同期の状態" onClose={onClose} is_mobile={is_mobile} maxWidth={460}>
      <div style={detail_row_style}>
        <span style={{ color: T.inkSoft }}>状態</span>
        <span style={{ fontWeight: 700, color: T.ink }}>{pillAppearance(sync_status).label}</span>
      </div>
      <div style={detail_row_style}>
        <span style={{ color: T.inkSoft }}>最終同期</span>
        <span style={{ color: T.ink }}>{formatSyncedAt(sync_status.last_synced_at)}</span>
      </div>
      <div style={detail_row_style}>
        <span style={{ color: T.inkSoft }}>未送信の変更</span>
        <span style={{ color: T.ink }}>{sync_status.pending_count}件</span>
      </div>
      {sync_status.last_error && (
        <p style={{ fontSize: 13, color: T.dangerDeep, margin: "12px 0 0" }}>
          {sync_status.last_error}
        </p>
      )}
      {sync_status.phase === "offline" && (
        <p style={{ fontSize: 13, color: T.inkSoft, margin: "12px 0 0" }}>
          支出とメモはこの端末に保存され、オンラインに戻ると自動で送信されます。
        </p>
      )}

      {rejections.length > 0 && (
        <section style={{ marginTop: 16 }}>
          <h3 style={{ fontSize: 14, color: T.dangerDeep, margin: "0 0 8px" }}>
            保存できなかった変更
          </h3>
          <p style={{ fontSize: 12, color: T.inkSoft, margin: "0 0 8px" }}>
            サーバーが受け付けなかったため、端末上の変更を元に戻しました。
          </p>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {rejections.map((rejection) => (
              <li key={rejection.rejection_id} style={detail_row_style}>
                <span style={{ color: T.inkSoft, flexShrink: 0 }}>
                  {COLLECTION_LABELS[rejection.collection] ?? rejection.collection}
                </span>
                <span style={{ color: T.ink, textAlign: "right" }}>{rejection.message}</span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => void dismissRejections()}
            style={{ ...btnGhost, marginTop: 12 }}
          >
            確認しました
          </button>
        </section>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
        <button
          type="button"
          onClick={() => void sync_client.engine.syncNow()}
          disabled={sync_status.phase === "syncing" || sync_status.phase === "offline"}
          style={btnPrimary}
        >
          今すぐ同期
        </button>
      </div>
    </Modal>
  );
}
