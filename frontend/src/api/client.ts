import type { components } from './types';

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
    const error_body = await response.json().catch(() => ({})) as { message?: string };
    throw new Error(error_body.message ?? `HTTP ${response.status}`);
  }
  if (response.status === 204) {
    return undefined as TResponse;
  }
  return response.json() as Promise<TResponse>;
}

export const api = {
  listCategoryGroups: () =>
    request<components['schemas']['CategoryGroupListResponse']>('/category-groups'),
  listExpenseCategories: () =>
    request<components['schemas']['ExpenseCategoryListResponse']>('/expense-categories'),
  createJournalEntry: (body: components['schemas']['JournalEntryRequest']) =>
    request<components['schemas']['JournalEntryResponse']>('/journal-entries', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  listJournalEntries: (year_month: string) =>
    request<components['schemas']['JournalEntryListResponse']>(
      `/journal-entries?year_month=${year_month}`,
    ),
};
