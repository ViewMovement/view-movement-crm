import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { fmtDateTime } from '../lib/format.js';

const STATUS_DOT = {
  green: 'bg-emerald-400', yellow: 'bg-yellow-400', red: 'bg-red-400', churned: 'bg-slate-500',
};

const TYPE_LABELS = {
  loom_sent: 'Loom Sent',
  call_offered: 'Call Offered',
  call_completed: 'Call Done',
  expectations_loom_sent: 'Exp. Loom',
  note: 'Note',
  status_change: 'Status',
  system: 'System',
};

const FILTERS = ['all', 'loom_sent', 'call_offered', 'call_completed', 'note', 'status_change', 'system'];
const FILTER_LABELS = {
  all: 'All', loom_sent: 'Looms', call_offered: 'Calls offered',
  call_completed: 'Calls done', note: 'Notes', status_change: 'Status', system: 'System',
};

export default function Activity() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    api.getActivity(300).then(setItems).catch(console.error).finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (filter === 'all') return items;
    return items.filter(t => t.type === filter);
  }, [items, filter]);

  // Group by day
  const grouped = useMemo(() => {
    const map = {};
    filtered.forEach(t => {
      const day = new Date(t.created_at).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
      if (!map[day]) map[day] = [];
      map[day].push(t);
    });
    return Object.entries(map);
  }, [filtered]);

  if (loading) return <p className="text-slate-400">Loading activity...</p>;

  return (
    <div className="max-w-3xl mx-auto">
      <h2 className="text-xl font-bold text-white mb-4">Activity</h2>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-6">
        {FILTERS.map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={
              'px-3 py-1 rounded-full text-xs font-medium transition-colors ' +
              (filter === f ? 'bg-ink-700 text-white' : 'text-slate-400 hover:text-white hover:bg-ink-800')
            }
          >
            {FILTER_LABELS[f]}
          </button>
        ))}
      </div>

      {/* Grouped list */}
      {grouped.length === 0 && <p className="text-xs text-slate-500">No activity found</p>}
      {grouped.map(([day, entries]) => (
        <div key={day} className="mb-4">
          <p className="text-xs text-slate-500 font-medium sticky top-0 bg-ink-950 py-1 mb-1">{day}</p>
          <div className="space-y-1">
            {entries.map(t => {
              const client = t.clients;
              return (
                <div key={t.id} className="flex items-start gap-3 px-3 py-2 rounded-lg hover:bg-ink-900/50 text-sm">
                  <span className={'w-2 h-2 rounded-full mt-1.5 shrink-0 ' + (STATUS_DOT[client?.status] || 'bg-slate-500')}></span>
                  <Link to={'/clients/' + (client?.id || '')} className="text-slate-200 hover:text-white shrink-0 w-32 truncate">
                    {client?.name || 'Unknown'}
                  </Link>
                  <span className="text-xs text-slate-500 shrink-0 w-24">{TYPE_LABELS[t.type] || t.type}</span>
                  <span className="text-xs text-slate-400 flex-1 truncate">{t.content}</span>
                  <span className="text-[10px] text-slate-600 shrink-0">{fmtDateTime(t.created_at)}</span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
