import { useState, useEffect } from 'react';
import { api } from '../api/client';
import type { components } from '../api/types';

type CategoryGroup = components['schemas']['CategoryGroup'];
type ExpenseCategory = components['schemas']['ExpenseCategory'];

interface Props {
  onSuccess: () => void;
}

const today_jst = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });

function PlusIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
      <line x1={12} y1={5} x2={12} y2={19} />
      <line x1={5} y1={12} x2={19} y2={12} />
    </svg>
  );
}

interface FieldProps {
  label: string;
  children: React.ReactNode;
}

function Field({ label, children }: FieldProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 13, color: '#888', fontWeight: 500 }}>{label}</label>
      {children}
    </div>
  );
}

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
    <form onSubmit={handle_submit}>
      <h2
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 15,
          fontWeight: 600,
          color: '#ccc',
          marginBottom: 20,
        }}
      >
        <PlusIcon />
        仕訳入力
      </h2>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 16 }}>
        <Field label="日付">
          <input
            type="date"
            value={transaction_date}
            onChange={(e) => setTransactionDate(e.target.value)}
            required
          />
        </Field>

        <Field label="金額">
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            min={1}
            placeholder="¥0"
            required
          />
        </Field>

        <Field label="項目名">
          <input
            type="text"
            value={item}
            onChange={(e) => setItem(e.target.value)}
            placeholder="例: コンビニ弁当"
          />
        </Field>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 16 }}>
        <Field label="大分類">
          <select
            value={selected_group_id}
            onChange={(e) => handle_group_change(e.target.value)}
          >
            <option value="">選択してください</option>
            {category_groups.map((g) => (
              <option key={g.id} value={String(g.id)}>
                {g.group_name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="生活区分">
          <select
            value={selected_category_id}
            onChange={(e) => setSelectedCategoryId(e.target.value)}
            disabled={!selected_group_id}
            style={{ opacity: selected_group_id ? 1 : 0.5 }}
          >
            <option value="">{selected_group_id ? '選択してください' : '大分類を先に選択'}</option>
            {filtered_categories.map((cat) => (
              <option key={cat.id} value={String(cat.id)}>
                {cat.category_name}
              </option>
            ))}
          </select>
        </Field>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 13, color: '#888', fontWeight: 500 }}>&nbsp;</label>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              fontSize: 14,
              color: '#ccc',
              cursor: 'pointer',
              paddingTop: 2,
            }}
          >
            <input
              type="checkbox"
              checked={is_excluded}
              onChange={(e) => setIsExcluded(e.target.checked)}
              style={{ width: 'auto' }}
            />
            集計から除外
          </label>
        </div>
      </div>

      <div style={{ marginBottom: 20 }}>
        <Field label="メモ">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="メモを入力..."
            rows={3}
            style={{ resize: 'vertical' }}
          />
        </Field>
      </div>

      {error_message && (
        <p style={{ color: '#f87171', fontSize: 13, marginBottom: 12 }}>{error_message}</p>
      )}

      <button
        type="submit"
        disabled={submitting}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 24px',
          borderRadius: 8,
          border: 'none',
          background: submitting ? '#166534' : '#22c55e',
          color: '#000',
          fontWeight: 600,
          fontSize: 14,
          cursor: submitting ? 'default' : 'pointer',
          opacity: submitting ? 0.7 : 1,
          transition: 'opacity 0.15s',
        }}
      >
        <PlusIcon />
        {submitting ? '送信中...' : '登録'}
      </button>
    </form>
  );
}
