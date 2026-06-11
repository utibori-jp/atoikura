# M1 Step 7: Frontend Minimum Viable UI

## Goal

Build the simplest possible frontend that lets the user record and review journal
entries via a browser. **Visual polish is not the priority** — functional flow is.
v0 designs come into play in M2 onwards.

## Branch

Create `feature/m1-step7-frontend` off `develop`.

## Prerequisites

- Step 6 merged. Backend exposes the 4 M1 endpoints.

## Scope

Two screens:
1. **Journal entry form** (top of the page or a separate route)
2. **Journal entry list grouped by date** (below the form or a separate route)

Visual design constraints:
- Plain HTML form is fine
- No CSS framework needed (use minimal inline styles or a single CSS file)
- No state management library — `useState` and `useEffect` are enough
- No router needed if everything fits on one page

## Tasks

### 1. Generate API client types from OpenAPI

Install `openapi-typescript`:
```
cd frontend
npm install -D openapi-typescript
```

Add an npm script in `package.json`:
```json
{
  "scripts": {
    "gen:api": "openapi-typescript ../docs/atoikura-api.yaml -o src/api/types.ts"
  }
}
```

Run it:
```
npm run gen:api
```

This generates `src/api/types.ts` with all schema types.

### 2. Create a thin API client

`frontend/src/api/client.ts`:

```ts
const API_BASE_URL = import.meta.env.VITE_API_URL;

async function request<TResponse>(path: string, init?: RequestInit): Promise<TResponse> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    const error_body = await response.json().catch(() => ({}));
    throw new Error(error_body.message ?? `HTTP ${response.status}`);
  }
  if (response.status === 204) {
    return undefined as TResponse;
  }
  return response.json();
}

export const api = {
  listCategoryGroups: () => request<components['schemas']['CategoryGroupListResponse']>('/category-groups'),
  listExpenseCategories: () => request<components['schemas']['ExpenseCategoryListResponse']>('/expense-categories'),
  createJournalEntry: (body: components['schemas']['JournalEntryRequest']) =>
    request<components['schemas']['JournalEntryResponse']>('/journal-entries', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  listJournalEntries: (year_month: string) =>
    request<components['schemas']['JournalEntryListResponse']>(`/journal-entries?year_month=${year_month}`),
};
```

(Adjust the type imports based on what `openapi-typescript` outputs.)

### 3. Build the form component

`frontend/src/components/JournalEntryForm.tsx`:

Fields:
- `transaction_date` (default: today, JST)
- `category_group_id` (select dropdown — used to filter the next dropdown)
- `category_id` (select dropdown, filtered by selected group)
- `amount` (number input, must be >= 1)
- `item` (text input, optional)
- `is_excluded` (checkbox)
- `note` (textarea, optional)
- Submit button

Behavior:
- On mount: fetch category_groups and expense_categories
- When `category_group_id` changes, reset `category_id` and filter options
- On submit: call `createJournalEntry`
- On success: clear form, trigger a refresh of the list (via prop callback or shared state)
- On error: display the error message inline

Notes:
- Don't pre-select a category — make the user explicitly choose
- Today's date in JST: `new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' })`
  ('sv-SE' locale gives `YYYY-MM-DD` format conveniently)

### 4. Build the list component

`frontend/src/components/JournalEntryList.tsx`:

- Month selector (default: current month in JST)
- For each date group: show date as a header, then a table of entries with columns:
  date / item / category_name / group_name / amount / is_excluded / note
- Empty state: "今月はまだ仕訳が登録されていません"

Re-fetch when:
- The month selector changes
- The form signals a successful submit (via a counter prop or refresh callback)

### 5. Compose in `App.tsx`

```tsx
import { useState } from 'react';
import { JournalEntryForm } from './components/JournalEntryForm';
import { JournalEntryList } from './components/JournalEntryList';

export default function App() {
  const [refresh_token, setRefreshToken] = useState(0);

  return (
    <main style={{ maxWidth: 800, margin: '0 auto', padding: 24 }}>
      <h1>atoikura</h1>
      <JournalEntryForm onSuccess={() => setRefreshToken(t => t + 1)} />
      <hr style={{ margin: '32px 0' }} />
      <JournalEntryList refresh_token={refresh_token} />
    </main>
  );
}
```

### 6. CORS sanity check

When you run frontend at `http://localhost:3000` and backend at `http://localhost:8080`,
the browser will issue CORS preflights. Verify the `allowCORS` middleware from Step 5
permits requests from `http://localhost:3000`.

If hitting CORS issues, fix the middleware (don't work around it client-side).

### 7. Manual end-to-end test

```
docker compose up -d db backend
cd frontend && npm run dev
```

In the browser:
1. Open http://localhost:3000
2. Fill the form: today's date, group "食費", category "スーパー", amount 1000, item "テスト"
3. Submit. Verify it appears in the list below.
4. Submit a few more entries with different dates/categories.
5. Verify the list groups by date and sorts correctly (newest day first, newest entry within day first).
6. Verify changing the month selector loads only that month's entries.
7. Try invalid input (amount = 0, missing category) and verify error shows.

### 8. Update README

Add a frontend dev section:
```markdown
### Run the frontend
\`\`\`
cd frontend
npm install
npm run dev
\`\`\`

The app will be available at http://localhost:3000.
```

## Verification Checklist

- [ ] `npm run gen:api` produces `src/api/types.ts` without errors
- [ ] Form loads category_groups and expense_categories on mount
- [ ] Selecting a group filters the category dropdown
- [ ] Submitting creates an entry visible in the list
- [ ] List groups by date with correct ordering
- [ ] Month selector changes the displayed month
- [ ] Empty months show a friendly message
- [ ] Validation errors from the backend are surfaced to the user
- [ ] CORS works (no console errors when calling the API)

## Commit Plan

1. `chore(frontend): add openapi-typescript and gen:api script`
2. `feat(frontend/api): add typed API client`
3. `feat(frontend/components): add JournalEntryForm`
4. `feat(frontend/components): add JournalEntryList`
5. `feat(frontend): wire form and list in App`
6. `docs(readme): document frontend dev`

## After Completion

PR to `develop`. **M1 is complete.** You can now use the app daily to record entries
and abandon the spreadsheet.

Next milestone (M2): the home graph that shows "あといくら" — bring v0 designs into
play here.

## Out of Scope (M2 onwards)

- Editing or deleting entries
- Daily and monthly notes
- Master management UI (categories are seeded; edit via SQL for now if needed)
- The home graph
- Budget settings UI
- Review screen
- v0 design polish
