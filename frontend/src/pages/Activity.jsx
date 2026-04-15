import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { Empty, SectionHeader, Skeleton, StatusDot } from '../components/primitives.jsx';
import ClientDetailDrawer from '../components/ClientDetailDrawer.jsx';
import { fmtDate, touchpointLabel } from '../lib/format.js';

const TYPES = [
  { value: 'all', label: 'All' },
  { value: 'loom_sent', label: 'Looms' },
  { value: 'call_offered', label: 'Calls offered' },
  { value: 'call_completed', label: 'Calls done' },
  { value: 'note', label: 'Notes' },
  { value: 'status_change', label: 'Status' },
  { value: 'system', label: 'System' }
];

export default function Activity() {
  const [items, setItems] = useState(null);
  const [type, setType] = useState('all');
  const [openId, setOpenId] = useState(null);

  useEffect(() => { api.activity(300).then(setItems); }, []);

  const filtered = useMemo(() => {
    if (!items) return null;
    return type === 'all' ? items : items.filter(i => i.type === type);
  }, [items, type]);

  const grouped = useMemo(() => {
    if (!filtered) return null;
    const by = {};
    for (const it of filtered) {
      const day = new Date(it.created_at); day.setHours(0,0,0,0);
      const key = day.toISOString();
      if (!by[key]) by[key] = [];
      by[key].push(it);
    }
    return Object.entries(by).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filtered]);

  if (!items) return <Skeleton rows={10} className="h-10 w-full" />;

  return (
    <>
      <SectionHeader
        title="Activity"
        subtitle={`${items.length} touchpoints · last 300 across all clients`}
      />

      <div className="flex gap-2 mb-6 flex-wrap">
        {TYPES.map(t => (
          <button key={t.value} onClick={() => setType(t.value)}
            className={`chip ${type === t.value ? 'chip-active' : ''}`}>{t.label}</button>
        ))}
      </div>

      {grouped.length === 0 ? (
        <Empty icon="◉" title="No activity matches this filter." />
      ) : (
        <div className="space-y-6">
          {grouped.map(([dayKey, rows]) => (
            <section key={dayKey}>
              <div className="text-xs uppercase tracking-wide text-slate-500 mb-2 sticky top-14 bg-ink-950/80 backdrop-blur py-1">
                {fmtDate(dayKey)} <span className="text-slate-600">· {rows.length}</span>
              </div>
              <div className="space-y-1.5">
                {rows.map(r => (
                  <button
                    key={r.id}
                    onClick={() => setOpenId(r.client_id)}
                    className="w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg border border-transparent hover:border-ink-700 hover:bg-ink-800/40 transition">
                    <StatusDot status={r.clients?.status} label={false} />
                    <div className="text-sm font-medium w-48 truncate">{r.clients?.name || 'Unknown'}</div>
                    <div className="text-xs text-slate-400 w-36 shrink-0">{touchpointLabel(r.type)}</div>
                    <div className="text-sm text-slate-300 flex-1 min-w-0 truncate">{r.content || '—'}</div>
                    <div className="text-xs text-slate-500 tabular-nums shrink-0">
                      {new Date(r.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                    </div>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {openId && <ClientDetailDrawer clientId={openId} onClose={() => setOpenId(null)} />}
    </>
  );
}
