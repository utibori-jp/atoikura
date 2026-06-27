# GitHub Pages interactive demo (#142)

Date: 2026-06-27
Issue: #142 — Host an interactive mock/demo on GitHub Pages, linked from the README

## Goal

Publish a static, client-side-only build of the existing `frontend/` Vite app to
GitHub Pages so anyone can see the app's screens without cloning/building/running a
backend. Linked prominently from the top of `README.md`.

## Decisions (settled during brainstorming)

- **What ships:** the real `frontend/` app (no duplicate mock), built in a dedicated
  `demo` Vite mode, running entirely client-side against **MSW** with rich seeded data.
- **Interactivity:** **read-only browse.** All `GET`s return seeded data; navigation works
  everywhere. Writes (`POST`/`PUT`/`DELETE`) return a canned success but do **not** persist
  (no in-memory store). README sets that expectation.
- **Deploy trigger:** push to `develop` (active default branch) + `workflow_dispatch`.
- **URL:** https://utibori-jp.github.io/atoikura/

## Architecture

### Demo mode is build-time gated; zero impact on the production bundle

- `frontend/.env.demo`
  - `VITE_DEMO=true`
  - `VITE_API_URL=https://demo.atoikura.local` (a base MSW matches; never actually fetched)
- `frontend/src/main.tsx` — guarded by `import.meta.env.VITE_DEMO === "true"`:
  1. dynamically `import("./demo/browser")` (keeps MSW out of the normal bundle),
  2. `await worker.start({ serviceWorker: { url: import.meta.env.BASE_URL + "mockServiceWorker.js" }, onUnhandledRequest: "warn" })`,
  3. `token_store.save("demo")` so `App` boots in `"checking"` → calls `/users/me` → MSW
     returns a demo user → `authenticated` (no `LoginScreen` change needed),
  4. then render.
  The dynamic import + env guard means none of this is included when `VITE_DEMO` is unset.

### Demo data + worker

- `frontend/src/demo/handlers.ts` — comprehensive **read-only** MSW handlers with realistic
  seed data, parameterized off `import.meta.env.VITE_API_URL` as the base. Must cover EVERY
  endpoint any screen calls so nothing falls through to the network:
  - `/users/me`, `/auth/login`, `/auth/signup`
  - `/category-groups`, `/expense-categories`, `/statement-types`
  - `/budgets`, `/budget-summary`
  - `/journal-entries` (GET list with a populated month), `/expenses/daily-cumulative`,
    `/expenses/monthly-breakdown`
  - `/notes/daily`, `/notes/monthly-reviews`
  - `/recurring-expenses`, `/recurring-expenses/pending`
  - `/savings-goals`, `/income-records`, `/base-income`, `/surplus-allocations`
  - write endpoints (POST/PUT/DELETE) return plausible success responses (echo / 201 / 204)
    so clicking a button doesn't error in the console; data is not persisted.
  Seed data: a believable single month — income, base income, a few recurring expenses incl.
  one pending, 1–2 savings goals, ~a dozen journal entries across categories, budget summary
  with 3-month history. Goal: every screen looks "full" and realistic.
- `frontend/src/demo/browser.ts` — `setupWorker(...demoHandlers)`.
- `frontend/public/mockServiceWorker.js` — generated via `npx msw init public/` and **committed**
  so demo builds work in CI and locally without a generate step.

### Vite config

- Convert `vite.config.ts` to `defineConfig(({ mode }) => ({ ... }))`.
- When `mode === "demo"`:
  - `base: "/atoikura/"` (GitHub Pages project-site path so assets resolve),
  - **omit the `VitePWA` plugin** — its service worker collides with MSW's worker.
- All other modes unchanged: `base: "/"`, PWA enabled.
- `package.json`: add `"build:demo": "vite build --mode demo"`.

### CI / deploy

- `.github/workflows/demo-pages.yml`:
  - `on: { push: { branches: [develop], paths: ["frontend/**", ".github/workflows/demo-pages.yml"] }, workflow_dispatch: {} }`
  - `permissions: { contents: read, pages: write, id-token: write }`
  - `concurrency: { group: "pages", cancel-in-progress: true }`
  - job: checkout → setup-node (Node 24, cache npm) → `npm ci` (in `frontend/`) →
    `npm run build:demo` → `actions/configure-pages` → `actions/upload-pages-artifact`
    with `path: frontend/dist` → `actions/deploy-pages`.
- **One-time manual step (owner):** repo Settings → Pages → Source = "GitHub Actions".

### README

- Add a "🚀 Live demo" link/badge near the top → https://utibori-jp.github.io/atoikura/,
  with a one-line note: "read-only, runs on mocked data, no backend".

## Out of scope

- Persistence / in-memory mutation, real backend, real auth, mutating flows.

## Verification

- `cd frontend && npm run build:demo` succeeds; `dist/` contains `mockServiceWorker.js` and
  `index.html` referencing `/atoikura/` asset paths.
- Local check: `npx vite preview --base /atoikura/` (or serve dist) → app loads straight into
  the authenticated UI with seeded data, no network calls to a real backend, console clean.
- Existing `npm run test`, `npm run lint`, `npm run format` stay green (demo code is isolated).
- Normal `npm run build` is unchanged (PWA still emitted, `base: "/"`).
