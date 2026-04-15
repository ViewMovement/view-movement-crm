import { useState } from 'react';
import { useData } from '../lib/data.jsx';
import { api } from '../lib/api.js';
import { useToast } from '../lib/toast.jsx';

export default function SyncIndicator() {
  const { sync, refresh } = useData();
  const { show } = useToast();
  const [busy, setBusy] = useState(false);

  async function runNow() {
    setBusy(true);
    try {
      const r = await api.runSync();
      const newCount = (r.onboarding?.created || 0);
      const churned = (r.cancellation?.churned || 0);
      show({ message: newCount || churned
        ? `Sync complete · ${newCount} new, ${churned} churned.`
        : 'Sync complete · no changes.' });
      await refresh(true);
    } catch (e) {
      show({ message: `Sync failed: ${e.message}`, tone: 'error' });
    } finally { setBusy(false); }
  }

  const onbAge = sync?.onboarding?.ran_at ? ago(sync.onboarding.ran_at) : null;

  return (
    <div className="flex items-center gap-2 text-xs text-slate-400">
      <span className={`h-1.5 w-1.5 rounded-full ${onbAge && onbAge.mins < 10 ? 'bg-emerald-400' : 'bg-slate-500'}`} />
      <span className="tabular-nums">
        {onbAge ? `Synced ${onbAge.label}` : 'Syncing…'}
        {sync?.new_today ? ` · ${sync.new_today} new today` : ''}
      </span>
      <button onClick={runNow} disabled={busy}
        className="rounded-md border border-ink-700 hover:border-ink-600 hover:bg-ink-800 px-2 py-1 text-xs transition">
        {busy ? '…' : 'Refresh'}
      </button>
    </div>
  );
}

function ago(iso) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return { mins, label: 'just now' };
  if (mins < 60) return { mins, label: `${mins}m ago` };
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return { mins, label: `${hrs}h ago` };
  return { mins, label: `${Math.floor(hrs/24)}d ago` };
}
