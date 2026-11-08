import { useLedgerData, useLedgerView, type LedgerTarget } from "../data/ledgerData";
import { T } from "../theme";

const VIEW_OPTIONS: { target: LedgerTarget; label: string }[] = [
  { target: "household", label: "家計" },
  { target: "personal", label: "お小遣い" },
];

// Switches every screen between the shared household ledger and the user's own
// allowance while a household is attached; hidden in solo mode.
export function LedgerViewSwitcher() {
  const ledger_data = useLedgerData();
  const { setPreferredTarget } = useLedgerView();
  if (ledger_data.household_ledger_id === null) return null;

  return (
    <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
      <div
        role="group"
        aria-label="表示する帳簿"
        style={{
          display: "inline-flex",
          padding: 4,
          borderRadius: 999,
          background: T.card,
          boxShadow: T.cardShadow,
        }}
      >
        {VIEW_OPTIONS.map((view_option) => {
          const is_active = ledger_data.ledger_target === view_option.target;
          return (
            <button
              key={view_option.target}
              type="button"
              aria-pressed={is_active}
              onClick={() => setPreferredTarget(view_option.target)}
              style={{
                border: "none",
                borderRadius: 999,
                padding: "8px 20px",
                fontFamily: "inherit",
                fontSize: 14,
                fontWeight: 700,
                cursor: "pointer",
                background: is_active ? T.coral : "transparent",
                color: is_active ? "#fff" : T.inkSoft,
              }}
            >
              {view_option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
