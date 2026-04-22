import { useEffect, useState, useCallback, useMemo } from 'react';
import { api } from '../lib/api.js';
import ClientCard from '../components/ClientCard.jsx';

const STATUS_ORDER = { churned: 0, red: 1, yellow: 2, green: 3 };

export default function Clients() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    const c = await api.listClients();
    setClients(c); setLoading(false);
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

  if (loading) return <div className="text-slate-400">Loading clients...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-lg font-semibold">All Clients <span className="text-slate-500 text-sm font-normal">({clients.length})</span></h2>
        <div className="flex gap-2">
          <input className="input w-64" placeholder="Search..." value={query} onChange={e => setQuery(e.target.value)} />
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
    </div>
  );
}
