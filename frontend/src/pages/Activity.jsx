import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { fmtDate, touchpointLabel } from '../lib/format.js';

const STATUS_COLORS = { green: 'bg-emerald-400', yellow: 'bg-yellow-400', red: 'bg-red-400', churned: 'bg-slate-500' };

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

  if (!items) return <div className="text-slate-400">Loading...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Activity</h2>
        <p className="text-sm text-slate-400 mt-1">
          {items.length} touchpoints {'\u00B7'} last 300 across all clients
        </p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {TYPES.map(t => (
          <button key={t.value} onClick={() => setType(t.value)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              type === t.value
                ? 'bg-ink-700 text-white'
                : 'text-slate-400 hover:text-slate-200 hover:bg-ink-800'
            }`}>{t.label}</button>
        ))}
      </div>

      {grouped && grouped.length === 0 ? (
        <div className="card p-8 text-center text-slate-400">No activity matches this filter.</div>
      ) : (
        <div className="space-y-6">
          {grouped && grouped.map(([dayKey, rows]) => (
            <section key={dayKey}>
              <div className="text-xs uppercase tracking-wide text-slate-500 mb-2 sticky top-14 bg-ink-950/80 backdrop-blur py-1">
                {fmtDate(dayKey)} <span className="text-slate-600">{'\u00B7'} {rows.length}</span>
              </div>
              <div className="space-y-1.5">
                {rows.map(r => (
                  <Link
                    key={r.id}
                    to={`/clients/${r.client_id}`}
                    className="w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg border border-transparent hover:border-ink-700 hover:bg-ink-800/40 transition">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_COLORS[r.clients?.status] || 'bg-slate-500'}`} />
                    <div className="text-sm font-medium w-48 truncate">{r.clients?.name || 'Unknown'}</div>
                    <div className="text-xs text-slate-400 w-36 shrink-0">{touchpointLabel(r.type)}</div>
                    <div className="text-sm text-slate-300 flex-1 min-w-0 truncate">{r.content || '\u2014'}</div>
                    <div className="text-xs text-slate-500 tabular-nums shrink-0">
                      {new Date(r.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
