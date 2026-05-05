import { useState, useEffect } from 'react';
import { api } from '../api/client';
import type { components } from '../api/types';

type DailyJournalEntries = components['schemas']['DailyJournalEntries'];

interface Props {
  refresh_token: number;
}

const current_month_jst = () =>
  new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' }).slice(0, 7);

export function JournalEntryList({ refresh_token }: Props) {
  const [year_month, setYearMonth] = useState(current_month_jst());
  const [entries, setEntries] = useState<DailyJournalEntries[] | null>(null);
  const [error_message, setErrorMessage] = useState('');

  useEffect(() => {
    let is_cancelled = false;
    api
      .listJournalEntries(year_month)
      .then((res) => {
        if (!is_cancelled) {
          setEntries(res.entries);
          setErrorMessage('');
        }
      })
      .catch((err) => {
        if (!is_cancelled) {
          setErrorMessage(err instanceof Error ? err.message : '取得に失敗しました');
          setEntries([]);
        }
      });
    return () => {
      is_cancelled = true;
    };
  }, [year_month, refresh_token]);

  const is_loading = entries === null && !error_message;

  return (
    <div>
      <h2>仕訳一覧</h2>

      <label>
        月選択
        <input
          type="month"
          value={year_month}
          onChange={(e) => setYearMonth(e.target.value)}
          style={{ marginLeft: 8 }}
        />
      </label>

      {is_loading && <p>読み込み中...</p>}
      {error_message && <p style={{ color: 'red' }}>{error_message}</p>}

      {!is_loading && entries !== null && entries.length === 0 && (
        <p style={{ color: '#666', marginTop: 16 }}>今月はまだ仕訳が登録されていません</p>
      )}

      {entries !== null &&
        entries.map((daily) => (
          <div key={daily.date} style={{ marginTop: 24 }}>
            <h3 style={{ margin: '0 0 8px' }}>{daily.date}</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f0f0f0' }}>
                  <th style={th}>項目名</th>
                  <th style={th}>大分類</th>
                  <th style={th}>生活区分</th>
                  <th style={{ ...th, textAlign: 'right' }}>金額</th>
                  <th style={th}>除外</th>
                  <th style={th}>メモ</th>
                </tr>
              </thead>
              <tbody>
                {daily.journal_entries.map((entry) => (
                  <tr key={entry.id} style={{ borderBottom: '1px solid #ddd' }}>
                    <td style={td}>{entry.item ?? '-'}</td>
                    <td style={td}>{entry.group_name}</td>
                    <td style={td}>{entry.category_name}</td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      ¥{entry.amount.toLocaleString()}
                    </td>
                    <td style={{ ...td, textAlign: 'center' }}>{entry.is_excluded ? '✓' : ''}</td>
                    <td style={td}>{entry.note ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
    </div>
  );
}

const th: React.CSSProperties = {
  padding: '6px 8px',
  textAlign: 'left',
  fontWeight: 'bold',
  borderBottom: '2px solid #ccc',
};

const td: React.CSSProperties = {
  padding: '6px 8px',
};
