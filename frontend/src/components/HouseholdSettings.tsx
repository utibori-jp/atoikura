import { useCallback, useEffect, useState } from "react";
import type React from "react";
import {
  formatArchivePeriod,
  invitationLink,
  listArchives,
  loadHousehold,
  type HouseholdMember,
  type HouseholdView,
} from "../data/household";
import { commandErrorMessage, useCanEditOnline } from "../data/ledgerApi";
import { useLedgerData, useLocalData } from "../data/ledgerData";
import { todayInJst } from "../logic";
import { useAppSession } from "../session/sessionHooks";
import type { HouseholdInvitation } from "../sync/householdCommands";
import { T, btnGhost, btnPrimary, card } from "../theme";
import { useConfirm } from "./dialogContext";
import { OnlineEditNotice } from "./OnlineEditNotice";

// Household settings on the account screen (design.md §6): create a household
// or join one by code or link, then manage members, allowances and invitations,
// and leave or dissolve it. Every edit is an online command.

interface HouseholdSettingsProps {
  // A token from an invitation link the app was opened with, until handled.
  pending_join_token: string | null;
  onJoinTokenHandled: () => void;
  onOpenArchive: (archive_ledger_id: string) => void;
}

const input_style: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  padding: "10px 14px",
  borderRadius: 12,
  border: `1.5px solid ${T.hair}`,
  background: T.bgSoft,
  fontFamily: "inherit",
  fontSize: 15,
  color: T.ink,
};

const section_title_style: React.CSSProperties = {
  fontWeight: 700,
  fontSize: 15,
  margin: "0 0 12px",
};

const yen = (amount: number) => `¥${Math.round(amount).toLocaleString("ja-JP")}`;

function formatExpiry(expires_at: string): string {
  const expiry_date = new Date(expires_at);
  if (Number.isNaN(expiry_date.getTime())) return "—";
  return expiry_date.toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function copyToClipboard(copied_text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(copied_text);
    return true;
  } catch {
    return false;
  }
}

export function HouseholdSettings({
  pending_join_token,
  onJoinTokenHandled,
  onOpenArchive,
}: HouseholdSettingsProps) {
  // Set after leaving or dissolving, to say where the household's records went.
  const [archive_notice, setArchiveNotice] = useState("");
  const ledger_data = useLedgerData();
  const current_month = todayInJst().slice(0, 7);
  const { data: household, error_message } = useLocalData(
    (loaded_ledger_data) => loadHousehold(loaded_ledger_data, current_month),
    [current_month]
  );
  const can_edit = useCanEditOnline();
  const [command_error, setCommandError] = useState("");
  const [is_busy, setIsBusy] = useState(false);

  // Runs a household command, keeping the screen's error and busy state.
  const runAction = useCallback(
    async (household_action: () => Promise<unknown>, fallback_message: string) => {
      setIsBusy(true);
      setCommandError("");
      try {
        await household_action();
        return true;
      } catch (command_failure) {
        setCommandError(commandErrorMessage(command_failure, fallback_message));
        return false;
      } finally {
        setIsBusy(false);
      }
    },
    []
  );

  const is_attached = ledger_data.household_ledger_id !== null;

  return (
    <div style={{ maxWidth: 520, margin: "24px auto 0" }}>
      <section aria-label="家計" style={{ ...card, padding: 28 }}>
        <h2
          style={{
            fontFamily: "'Zen Maru Gothic', 'M PLUS Rounded 1c', sans-serif",
            fontSize: 20,
            fontWeight: 900,
            margin: "0 0 4px",
          }}
        >
          家計
        </h2>
        <p style={{ fontSize: 12, color: T.inkSoft, margin: "0 0 16px", lineHeight: 1.6 }}>
          家族やパートナーと家計簿を共有できます。参加中は、自分の家計簿がお小遣いの帳簿になります。
        </p>
        <div style={{ marginBottom: 12 }}>
          <OnlineEditNotice
            can_edit={can_edit}
            command_error={command_error || error_message || ""}
          />
        </div>
        {is_attached ? (
          household ? (
            <AttachedHousehold
              household={household}
              current_month={current_month}
              can_edit={can_edit && !is_busy}
              runAction={runAction}
              onDetached={() => setArchiveNotice("家計の記録は「過去の家計」に残っています")}
            />
          ) : (
            <p style={{ fontSize: 13, color: T.inkSoft }}>家計のデータを取得しています…</p>
          )
        ) : (
          <DetachedHousehold
            can_edit={can_edit && !is_busy}
            runAction={runAction}
            pending_join_token={pending_join_token}
            onJoinTokenHandled={onJoinTokenHandled}
          />
        )}
        {is_attached && pending_join_token && (
          <JoinLinkWhileAttached onDismiss={onJoinTokenHandled} />
        )}
        {archive_notice && !is_attached && (
          <div
            role="status"
            style={{
              marginTop: 16,
              padding: "10px 14px",
              borderRadius: 14,
              background: T.sageSoft,
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {archive_notice}
          </div>
        )}
        <PastHouseholds onOpenArchive={onOpenArchive} />
      </section>
    </div>
  );
}

type RunAction = (
  household_action: () => Promise<unknown>,
  fallback_message: string
) => Promise<boolean>;

// The user's past households, each opening the read-only archive viewer.
function PastHouseholds({ onOpenArchive }: { onOpenArchive: (archive_ledger_id: string) => void }) {
  const { data: archives } = useLocalData(listArchives, []);
  if (!archives || archives.length === 0) return null;
  return (
    <div style={{ marginTop: 24, borderTop: `1px solid ${T.hair}`, paddingTop: 16 }}>
      <h3 style={section_title_style}>過去の家計</h3>
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {archives.map((archive) => (
          <li key={archive.ledger_id}>
            <button
              type="button"
              onClick={() => onOpenArchive(archive.ledger_id)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "12px 0",
                border: "none",
                borderBottom: `1px solid ${T.hair}`,
                background: "transparent",
                fontFamily: "inherit",
                textAlign: "left",
                cursor: "pointer",
                color: T.ink,
              }}
            >
              <span style={{ fontWeight: 700, fontSize: 15 }}>{archive.name || "過去の家計"}</span>
              <span style={{ flex: 1, fontSize: 12, color: T.inkSoft }}>
                {formatArchivePeriod(archive.first_month, archive.last_month)}
              </span>
              <span style={{ color: T.coralDeep, fontSize: 20, fontWeight: 700 }}>›</span>
            </button>
          </li>
        ))}
      </ul>
      <p style={{ fontSize: 11, color: T.inkSoft, margin: "8px 0 0" }}>
        抜けたり解散したりした家計の記録です。閲覧のみできます。
      </p>
    </div>
  );
}

function JoinLinkWhileAttached({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div
      role="status"
      style={{
        marginTop: 16,
        padding: "10px 14px",
        borderRadius: 14,
        background: T.mustardSoft,
        fontSize: 13,
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      <span style={{ flex: 1 }}>
        招待リンクを開きましたが、すでに家計に参加しています。別の家計に参加するには、いまの家計から抜けてください。
      </span>
      <button type="button" style={btnGhost} onClick={onDismiss}>
        閉じる
      </button>
    </div>
  );
}

function DetachedHousehold({
  can_edit,
  runAction,
  pending_join_token,
  onJoinTokenHandled,
}: {
  can_edit: boolean;
  runAction: RunAction;
  pending_join_token: string | null;
  onJoinTokenHandled: () => void;
}) {
  const { household_commands } = useAppSession().sync_client;
  const [household_name, setHouseholdName] = useState("");
  const [join_code, setJoinCode] = useState("");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {pending_join_token && (
        <div
          role="status"
          style={{ padding: 16, borderRadius: 16, background: T.sageSoft, fontSize: 14 }}
        >
          <p style={{ margin: "0 0 12px", fontWeight: 700 }}>招待リンクから家計に参加しますか？</p>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              style={btnPrimary}
              disabled={!can_edit}
              onClick={async () => {
                const is_joined = await runAction(
                  () => household_commands.joinHousehold({ token: pending_join_token }),
                  "家計に参加できませんでした"
                );
                if (is_joined) onJoinTokenHandled();
              }}
            >
              参加する
            </button>
            <button type="button" style={btnGhost} onClick={onJoinTokenHandled}>
              やめる
            </button>
          </div>
        </div>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void runAction(async () => {
            await household_commands.joinHousehold({ code: join_code });
            setJoinCode("");
          }, "家計に参加できませんでした");
        }}
      >
        <h3 style={section_title_style}>招待コードで参加</h3>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            aria-label="招待コード"
            value={join_code}
            onChange={(event) => setJoinCode(event.target.value)}
            placeholder="8文字のコード"
            autoComplete="off"
            autoCapitalize="characters"
            maxLength={16}
            style={{ ...input_style, letterSpacing: "0.12em" }}
          />
          <button type="submit" style={btnPrimary} disabled={!can_edit || join_code.trim() === ""}>
            参加
          </button>
        </div>
      </form>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void runAction(async () => {
            await household_commands.createHousehold(household_name.trim());
            setHouseholdName("");
          }, "家計を作成できませんでした");
        }}
      >
        <h3 style={section_title_style}>新しい家計を作る</h3>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            aria-label="家計の名前"
            value={household_name}
            onChange={(event) => setHouseholdName(event.target.value)}
            placeholder="例: わが家"
            maxLength={50}
            style={input_style}
          />
          <button
            type="submit"
            style={btnPrimary}
            disabled={!can_edit || household_name.trim() === ""}
          >
            作成
          </button>
        </div>
        <p style={{ fontSize: 11, color: T.inkSoft, margin: "8px 0 0", lineHeight: 1.6 }}>
          いまの基準収入・収入記録・カテゴリ・定期支出は家計に引き継がれます。
        </p>
      </form>
    </div>
  );
}

function AttachedHousehold({
  household,
  current_month,
  can_edit,
  runAction,
  onDetached,
}: {
  household: HouseholdView;
  current_month: string;
  can_edit: boolean;
  runAction: RunAction;
  onDetached: () => void;
}) {
  const { household_commands } = useAppSession().sync_client;
  const { user_id } = useLedgerData();
  const confirm = useConfirm();
  const is_owner = household.role === "owner";
  const is_alone = household.members.length === 1;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <div style={{ fontSize: 18, fontWeight: 800 }}>{household.name}</div>
        <div style={{ fontSize: 12, color: T.inkSoft, marginTop: 2 }}>
          {is_owner ? "オーナー" : "メンバー"} · {household.members.length}人
        </div>
      </div>

      <div>
        <h3 style={section_title_style}>メンバーとお小遣い</h3>
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {household.members.map((member) => (
            <MemberRow
              key={`${member.user_id}:${member.allowance}`}
              member={member}
              is_self={member.user_id === user_id}
              can_remove={is_owner && member.user_id !== user_id}
              can_edit={can_edit}
              onSaveAllowance={(amount) =>
                runAction(
                  () => household_commands.putAllowance(member.user_id, current_month, amount),
                  "お小遣いを保存できませんでした"
                )
              }
              onRemove={async () => {
                const is_confirmed = await confirm({
                  title: `${member.display_name || "このメンバー"}を家計から外しますか？`,
                  message:
                    "外されたメンバーには、参加していた間の家計が閲覧専用で残ります。お小遣いの記録はそのメンバーの家計簿に残ります。",
                  confirmLabel: "外す",
                  danger: true,
                });
                if (!is_confirmed) return;
                await runAction(
                  () => household_commands.removeMember(member.user_id),
                  "メンバーを外せませんでした"
                );
              }}
            />
          ))}
        </ul>
        <p style={{ fontSize: 11, color: T.inkSoft, margin: "8px 0 0", lineHeight: 1.6 }}>
          お小遣いの変更は今月から反映されます。使わなかった分は翌月に繰り越されます。
        </p>
      </div>

      <Invitations can_edit={can_edit} runAction={runAction} />

      <div style={{ borderTop: `1px solid ${T.hair}`, paddingTop: 16 }}>
        {is_owner ? (
          <>
            <button
              type="button"
              style={{ ...btnGhost, color: T.dangerDeep, borderColor: T.coralSoft }}
              disabled={!can_edit || !is_alone}
              onClick={async () => {
                const is_confirmed = await confirm({
                  title: "家計を解散しますか？",
                  message:
                    "家計は閲覧専用の記録として残り、編集できなくなります。この操作は取り消せません。",
                  confirmLabel: "解散する",
                  danger: true,
                });
                if (!is_confirmed) return;
                const is_dissolved = await runAction(
                  () => household_commands.dissolveHousehold(),
                  "家計を解散できませんでした"
                );
                if (is_dissolved) onDetached();
              }}
            >
              家計を解散
            </button>
            {!is_alone && (
              <p style={{ fontSize: 11, color: T.inkSoft, margin: "8px 0 0" }}>
                解散するには、先にほかのメンバーを外してください。
              </p>
            )}
          </>
        ) : (
          <button
            type="button"
            style={{ ...btnGhost, color: T.dangerDeep, borderColor: T.coralSoft }}
            disabled={!can_edit}
            onClick={async () => {
              const is_confirmed = await confirm({
                title: "家計から抜けますか？",
                message:
                  "参加していた間の家計は閲覧専用で残ります。もう一度参加するには、新しい招待が必要です。",
                confirmLabel: "抜ける",
                danger: true,
              });
              if (!is_confirmed) return;
              const is_left = await runAction(
                () => household_commands.leaveHousehold(),
                "家計から抜けられませんでした"
              );
              if (is_left) onDetached();
            }}
          >
            家計から抜ける
          </button>
        )}
      </div>
    </div>
  );
}

function MemberRow({
  member,
  is_self,
  can_remove,
  can_edit,
  onSaveAllowance,
  onRemove,
}: {
  member: HouseholdMember;
  is_self: boolean;
  can_remove: boolean;
  can_edit: boolean;
  onSaveAllowance: (amount: number) => Promise<boolean>;
  onRemove: () => Promise<void>;
}) {
  // The list keys rows by the synced amount, so a new amount resets the input.
  const [allowance_input, setAllowanceInput] = useState(String(member.allowance));
  const allowance_amount = Number(allowance_input);
  const is_valid_amount =
    allowance_input.trim() !== "" && Number.isInteger(allowance_amount) && allowance_amount >= 0;
  const member_label = member.display_name || `メンバー${member.user_id}`;

  return (
    <li
      aria-label={member_label}
      style={{ padding: "12px 0", borderBottom: `1px solid ${T.hair}` }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontWeight: 700, fontSize: 15 }}>
          {member_label}
          {is_self && <span style={{ color: T.inkSoft, fontWeight: 500 }}>（自分）</span>}
        </span>
        {member.role === "owner" && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              padding: "2px 8px",
              borderRadius: 999,
              background: T.mustardSoft,
              color: T.ink,
            }}
          >
            オーナー
          </span>
        )}
        <span style={{ flex: 1 }} />
        {can_remove && (
          <button
            type="button"
            style={{ ...btnGhost, padding: "4px 12px", fontSize: 12 }}
            disabled={!can_edit}
            onClick={() => void onRemove()}
          >
            外す
          </button>
        )}
      </div>
      <div style={{ fontSize: 12, color: T.inkSoft, margin: "4px 0 8px" }}>
        今月 使った {yen(member.spent)} · 貯金 {yen(member.saved)}
      </div>
      <form
        style={{ display: "flex", gap: 8, alignItems: "center" }}
        onSubmit={(event) => {
          event.preventDefault();
          if (is_valid_amount) void onSaveAllowance(allowance_amount);
        }}
      >
        <span style={{ fontSize: 13, color: T.inkSoft }}>お小遣い ¥</span>
        <input
          aria-label={`${member_label}のお小遣い`}
          inputMode="numeric"
          value={allowance_input}
          onChange={(event) => setAllowanceInput(event.target.value.replace(/[^0-9]/g, ""))}
          style={{ ...input_style, padding: "6px 10px", fontSize: 14 }}
        />
        <button
          type="submit"
          style={{ ...btnGhost, padding: "6px 14px" }}
          disabled={!can_edit || !is_valid_amount || allowance_amount === member.allowance}
        >
          保存
        </button>
      </form>
    </li>
  );
}

function Invitations({ can_edit, runAction }: { can_edit: boolean; runAction: RunAction }) {
  const { household_commands } = useAppSession().sync_client;
  const [open_invitations, setOpenInvitations] = useState<HouseholdInvitation[]>([]);
  // The invitation just created: the only time its link token is known.
  const [created_invitation, setCreatedInvitation] = useState<HouseholdInvitation | null>(null);
  const [copy_notice, setCopyNotice] = useState("");

  const refreshInvitations = useCallback(async () => {
    setOpenInvitations(await household_commands.listInvitations());
  }, [household_commands]);

  useEffect(() => {
    if (!can_edit) return;
    let cancelled = false;
    // A failed listing leaves the list as it was; the creation flow still works.
    household_commands.listInvitations().then(
      (listed_invitations) => {
        if (!cancelled) setOpenInvitations(listed_invitations);
      },
      () => {}
    );
    return () => {
      cancelled = true;
    };
  }, [can_edit, household_commands]);

  async function copyWithNotice(copied_text: string, copied_label: string) {
    setCopyNotice(
      (await copyToClipboard(copied_text))
        ? `${copied_label}をコピーしました`
        : "コピーできませんでした。手動で選択してください"
    );
  }

  return (
    <div>
      <h3 style={section_title_style}>メンバーを招待</h3>
      <button
        type="button"
        style={btnPrimary}
        disabled={!can_edit}
        onClick={() =>
          void runAction(async () => {
            const new_invitation = await household_commands.createInvitation();
            setCreatedInvitation(new_invitation);
            setCopyNotice("");
            await refreshInvitations();
          }, "招待を作成できませんでした")
        }
      >
        招待を作成
      </button>

      {created_invitation?.token && (
        <div
          aria-label="作成した招待"
          style={{ marginTop: 12, padding: 16, borderRadius: 16, background: T.bgSoft }}
        >
          <div style={{ fontSize: 12, color: T.inkSoft }}>招待コード（24時間有効・1回限り）</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
            <code
              data-testid="invitation-code"
              style={{ fontSize: 24, fontWeight: 800, letterSpacing: "0.16em", flex: 1 }}
            >
              {created_invitation.short_code}
            </code>
            <button
              type="button"
              style={btnGhost}
              onClick={() => void copyWithNotice(created_invitation.short_code, "コード")}
            >
              コピー
            </button>
          </div>
          <div style={{ fontSize: 12, color: T.inkSoft, marginTop: 12 }}>招待リンク</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
            <input
              aria-label="招待リンク"
              readOnly
              value={invitationLink(created_invitation.token)}
              onFocus={(event) => event.target.select()}
              style={{ ...input_style, fontSize: 12 }}
            />
            <button
              type="button"
              style={btnGhost}
              onClick={() =>
                void copyWithNotice(invitationLink(created_invitation.token ?? ""), "リンク")
              }
            >
              コピー
            </button>
          </div>
          {copy_notice && (
            <div role="status" style={{ fontSize: 12, color: T.sageDeep, marginTop: 8 }}>
              {copy_notice}
            </div>
          )}
        </div>
      )}

      {open_invitations.length > 0 && (
        <ul style={{ listStyle: "none", margin: "12px 0 0", padding: 0 }}>
          {open_invitations.map((open_invitation) => (
            <li
              key={open_invitation.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 0",
                borderBottom: `1px solid ${T.hair}`,
                fontSize: 13,
              }}
            >
              <code style={{ letterSpacing: "0.12em", fontWeight: 700 }}>
                {open_invitation.short_code}
              </code>
              <span style={{ color: T.inkSoft, flex: 1 }}>
                {formatExpiry(open_invitation.expires_at)} まで
              </span>
              <button
                type="button"
                style={{ ...btnGhost, padding: "4px 12px", fontSize: 12 }}
                disabled={!can_edit}
                onClick={() =>
                  void runAction(async () => {
                    await household_commands.revokeInvitation(open_invitation.id);
                    if (created_invitation?.id === open_invitation.id) setCreatedInvitation(null);
                    await refreshInvitations();
                  }, "招待を取り消せませんでした")
                }
              >
                取り消す
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
