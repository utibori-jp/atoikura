# Design References

High-fidelity UI design references for atoikura. **These screens are already
implemented** in `frontend/` — these documents are the design source of truth
(tokens, layouts, component specs, behavior rules) that the implementation
follows, not a backlog of pending work.

| Folder | Surface | Implemented in |
|---|---|---|
| `mobile/` | Smartphone PWA — home, journal, entry, budget hub, recurring, savings, income, review, master | `frontend/src/components/mobile/` |
| `web/` | Desktop SPA (1200px) — the same surfaces adapted for desktop density | `frontend/src/components/web/` |

## How to read these

- `README.md` / `handoff.md` — the design spec: tokens, typography, shadows,
  per-screen layout, and behavior rules. Use these as the canonical visual reference.
- `TODO.md` (mobile) — the original implementation plan. **All items are complete**;
  kept as a record of how the screens map to components.
- `src/*.jsx` — the original browser-runnable design prototypes (inline styles,
  placeholder data). Reference only — the production code lives in `frontend/`.
  Design tokens are encoded in `frontend/src/theme.ts`.

> Historical note: these started as separate "v1 / v2" handoffs while the UI was
> being built out. Now that everything is shipped there is a single current
> design per surface — that's what lives here.
