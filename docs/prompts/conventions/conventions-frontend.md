# Frontend Conventions

Read this document when working on the frontend. Use this in conjunction with the General / Commit conventions in `CLAUDE.md`.

---

## Language & Framework

- TypeScript (strict mode on)
- Vite + React
- Class components are prohibited. Use functional components + hooks only.

---

## Types

- `any` is prohibited. Use `unknown` and perform narrowing.
- API client types must be generated from `docs/atoikura-api.yaml` using `openapi-typescript`.
  Do not define these types manually.

---

## Linting & Formatting

- Format with `prettier`.
- Lint with `eslint` (Vite default settings).
- Always execute before committing.
