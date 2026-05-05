import { useState, useEffect } from 'react';
import { api } from '../api/client';
import type { components } from '../api/types';

type CategoryGroup = components['schemas']['CategoryGroup'];
type ExpenseCategory = components['schemas']['ExpenseCategory'];

interface Props {
  onSuccess: () => void;
}

const today_jst = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });

export function JournalEntryForm({ onSuccess }: Props) {
  const [category_groups, setCategoryGroups] = useState<CategoryGroup[]>([]);
  const [all_expense_categories, setAllExpenseCategories] = useState<ExpenseCategory[]>([]);
  const [selected_group_id, setSelectedGroupId] = useState('');
  const [selected_category_id, setSelectedCategoryId] = useState('');
  const [transaction_date, setTransactionDate] = useState(today_jst());
  const [amount, setAmount] = useState('');
  const [item, setItem] = useState('');
  const [is_excluded, setIsExcluded] = useState(false);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error_message, setErrorMessage] = useState('');

  useEffect(() => {
    api.listCategoryGroups().then((res) => setCategoryGroups(res.category_groups));
    api.listExpenseCategories().then((res) => setAllExpenseCategories(res.expense_categories));
  }, []);

  const filtered_categories = all_expense_categories.filter(
    (cat) => String(cat.group_id) === selected_group_id,
  );

  const handle_group_change = (group_id: string) => {
    setSelectedGroupId(group_id);
    setSelectedCategoryId('');
  };

  const handle_submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    const parsed_amount = parseInt(amount, 10);
    if (!selected_category_id) {
      setErrorMessage('生活区分を選択してください');
      return;
    }
    if (isNaN(parsed_amount) || parsed_amount < 1) {
      setErrorMessage('金額は1以上の整数を入力してください');
      return;
    }

    setSubmitting(true);
    try {
      await api.createJournalEntry({
        transaction_date,
        amount: parsed_amount,
        category_id: parseInt(selected_category_id, 10),
        is_excluded,
        item: item || null,
        note: note || null,
      });
      setSelectedGroupId('');
      setSelectedCategoryId('');
      setTransactionDate(today_jst());
      setAmount('');
      setItem('');
      setIsExcluded(false);
      setNote('');
      onSuccess();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : '送信に失敗しました');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handle_submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h2>仕訳入力</h2>

      <label>
        日付
        <input
          type="date"
          value={transaction_date}
          onChange={(e) => setTransactionDate(e.target.value)}
          required
          style={{ marginLeft: 8 }}
        />
      </label>

      <label>
        大分類
        <select
          value={selected_group_id}
          onChange={(e) => handle_group_change(e.target.value)}
          style={{ marginLeft: 8 }}
        >
          <option value="">-- 選択してください --</option>
          {category_groups.map((g) => (
            <option key={g.id} value={String(g.id)}>
              {g.group_name}
            </option>
          ))}
        </select>
      </label>

      <label>
        生活区分
        <select
          value={selected_category_id}
          onChange={(e) => setSelectedCategoryId(e.target.value)}
          disabled={!selected_group_id}
          style={{ marginLeft: 8 }}
        >
          <option value="">-- 選択してください --</option>
          {filtered_categories.map((cat) => (
            <option key={cat.id} value={String(cat.id)}>
              {cat.category_name}
            </option>
          ))}
        </select>
      </label>

      <label>
        金額（円）
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          min={1}
          required
          style={{ marginLeft: 8 }}
        />
      </label>

      <label>
        項目名
        <input
          type="text"
          value={item}
          onChange={(e) => setItem(e.target.value)}
          placeholder="任意"
          style={{ marginLeft: 8 }}
        />
      </label>

      <label>
        <input
          type="checkbox"
          checked={is_excluded}
          onChange={(e) => setIsExcluded(e.target.checked)}
          style={{ marginRight: 8 }}
        />
        集計除外（特別支出など）
      </label>

      <label>
        メモ
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="任意"
          rows={2}
          style={{ marginLeft: 8 }}
        />
      </label>

      {error_message && (
        <p style={{ color: 'red', margin: 0 }}>{error_message}</p>
      )}

      <button type="submit" disabled={submitting} style={{ width: 120 }}>
        {submitting ? '送信中...' : '登録'}
      </button>
    </form>
  );
}
