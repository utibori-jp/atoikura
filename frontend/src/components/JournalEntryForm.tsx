import { useState, useEffect } from 'react';
import { api } from '../api/client';
import type { components } from '../api/types';
import { T } from '../theme';

type CategoryGroup = components['schemas']['CategoryGroup'];
type ExpenseCategory = components['schemas']['ExpenseCategory'];

interface Props {
  onSuccess: () => void;
}

const today_jst = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });

interface FieldProps {
  label: string;
  children: React.ReactNode;
  flex?: number | string;
}

function Field({ label, children, flex }: FieldProps) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: flex ?? 1, minWidth: 0 }}>
      <span style={{ fontSize: 12, color: T.inkSoft, fontWeight: 600 }}>{label}</span>
      {children}
    </label>
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
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontFamily: "'M PLUS Rounded 1c', sans-serif", fontSize: 18, fontWeight: 700, color: T.ink }}>
          支出を記録
        </h2>
        <p style={{ fontSize: 12, color: T.inkSoft, marginTop: 4 }}>サクッと入力してすぐ反映</p>
      </div>

      <div style={{ display: 'flex', gap: 14, marginBottom: 16 }}>
        <Field label="日付" flex="0 0 160px">
          <input type="date" value={transaction_date} onChange={(e) => setTransactionDate(e.target.value)} required />
        </Field>
        <Field label="金額" flex="0 0 140px">
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            min={1}
            placeholder="¥0"
            required
            style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 16 }}
          />
        </Field>
        <Field label="項目名">
          <input type="text" value={item} onChange={(e) => setItem(e.target.value)} placeholder="例: コンビニ弁当" />
        </Field>
      </div>

      <div style={{ display: 'flex', gap: 14, marginBottom: 16 }}>
        <Field label="大分類">
          <select value={selected_group_id} onChange={(e) => handle_group_change(e.target.value)}>
            <option value="">選択してください</option>
            {category_groups.map((g) => (
              <option key={g.id} value={String(g.id)}>{g.group_name}</option>
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
              <option key={cat.id} value={String(cat.id)}>{cat.category_name}</option>
            ))}
          </select>
        </Field>
      </div>

      <div style={{ marginBottom: 20 }}>
        <Field label="メモ">
          <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="メモを入力..." rows={2} style={{ resize: 'vertical' }} />
        </Field>
      </div>

      {error_message && (
        <p style={{ color: T.coralDeep, fontSize: 13, marginBottom: 12 }}>{error_message}</p>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: T.inkSoft, cursor: 'pointer' }}>
          <input type="checkbox" checked={is_excluded} onChange={(e) => setIsExcluded(e.target.checked)} style={{ width: 'auto' }} />
          集計から除外する <span style={{ fontSize: 11 }}>（記念日など）</span>
        </label>

        <button
          type="submit"
          disabled={submitting}
          style={{
            border: 'none',
            background: submitting ? T.coralDeep : T.coral,
            color: '#fff',
            padding: '12px 28px',
            borderRadius: 999,
            fontFamily: 'inherit',
            fontWeight: 700,
            fontSize: 15,
            cursor: submitting ? 'default' : 'pointer',
            boxShadow: submitting ? 'none' : `0 4px 0 ${T.coralDeep}`,
            opacity: submitting ? 0.8 : 1,
          }}
        >
          {submitting ? '送信中...' : '＋ 記録する'}
        </button>
      </div>
    </form>
  );
}
