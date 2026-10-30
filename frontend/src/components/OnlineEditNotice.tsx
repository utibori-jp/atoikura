import { OFFLINE_EDIT_NOTICE } from "../data/ledgerApi";
import { T } from "../theme";

interface OnlineEditNoticeProps {
  can_edit: boolean;
  // A failed edit outside a form (e.g. a delete); "" when none.
  command_error?: string;
}

// The banner on screens whose edits need a connection: says why editing is off
// while offline, or why the last edit failed.
export function OnlineEditNotice({ can_edit, command_error = "" }: OnlineEditNoticeProps) {
  if (can_edit && !command_error) return null;
  return (
    <div
      role={command_error ? "alert" : "status"}
      style={{
        padding: "10px 14px",
        borderRadius: 14,
        background: command_error ? T.coralSoft : T.mustardSoft,
        color: command_error ? T.coralDeep : T.ink,
        fontSize: 13,
        fontWeight: 600,
      }}
    >
      {command_error || OFFLINE_EDIT_NOTICE}
    </div>
  );
}
