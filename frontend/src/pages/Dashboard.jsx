import { useEffect, useState, useCallback, useMemo } from 'react';
import { api } from '../lib/api.js';
import TodaysActions from '../components/TodaysActions.jsx';
import ClientCard from '../components/ClientCard.jsx';

const STATUS_ORDER = { churned: 0, red: 1, yellow: 2, green: 3 };

export default function Dashboard() {
  const [clients, setClients] = useState([]);
  const [today, setToday] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    const [c, t] = await Promise.all([api.listClients(), api.todayActions()]);
    setClients(c); setToday(t); setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const sorted = useMemo(() => {
    return [...clients]
      .filter(c => filter === 'all' ? true : c.status === filter)
      .filter(c => !query || c.name.toLowerCase().includes(query.toLowerCase()))
      .sort((a, b) => {
        const s = (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9);
        if (s !== 0) return s;
        return new Date(b.created_at) - new Date(a.created_at);
      });
  }, [clients, filter, query]);

  if (loading) return <div className="text-slate-400">Loading dashboard…</div>;

  return (
    <div className="space-y-8">
      <section>
        <div className="flex items-end justify-between mb-3">
          <div>
            <h2 className="text-lg font-semibold">Today's Actions</h2>
            <p className="text-sm text-slate-400">
              {today.length
                ? `${today.length} item${today.length === 1 ? '' : 's'} need attention, prioritized by status and urgency.`
                : 'You are clear for today.'}
            </p>
          </div>
        </div>
        <TodaysActions items={today} onChange={load} />
      </section>

      <section>
        <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
          <h2 className="text-lg font-semibold">All Clients <span className="text-slate-500 text-sm font-normal">({clients.length})</span></h2>
          <div className="flex gap-2">
            <input className="input w-64" placeholder="Search…" value={query} onChange={e => setQuery(e.target.value)} />
            <select className="input w-40" value={filter} onChange={e => setFilter(e.target.value)}>
              <option value="all">All statuses</option>
              <option value="churned">Churned</option>
              <option value="red">At Risk</option>
              <option value="yellow">Watch</option>
              <option value="green">Healthy</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {sorted.map(c => <ClientCard key={c.id} client={c} onChange={load} />)}
        </div>
      </section>
    </div>
  );
}
