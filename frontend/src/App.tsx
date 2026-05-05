import { useState } from 'react';
import { JournalEntryForm } from './components/JournalEntryForm';
import { JournalEntryList } from './components/JournalEntryList';

export default function App() {
  const [refresh_token, setRefreshToken] = useState(0);

  return (
    <main style={{ maxWidth: 800, margin: '0 auto', padding: 24 }}>
      <h1>atoikura</h1>
      <JournalEntryForm onSuccess={() => setRefreshToken((t) => t + 1)} />
      <hr style={{ margin: '32px 0' }} />
      <JournalEntryList refresh_token={refresh_token} />
    </main>
  );
}
