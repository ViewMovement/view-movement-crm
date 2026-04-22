import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';

const STATUS_DOT = {
  green: 'bg-emerald-400', yellow: 'bg-yellow-400', red: 'bg-red-400', churned: 'bg-slate-500',
};
const STATUS_LABEL = { green: 'Healthy', yellow: 'Watch', red: 'At Risk' };

export default function Billing() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('1');

  useEffect(() => {
    api.getClients().then(setClients).catch(console.error).finally(() => setLoading(false));
  }, []);

  const active = useMemo(() => clients.filter(c => c.status !== 'churned'), [clients]);

  const groups = useMemo(() => {
    const map = { '1': [], '14': [], 'none': [] };
    active.forEach(c => {
      const key = c.billing_date === 1 ? '1' : c.billing_date === 14 ? '14' : 'none';
      map[key].push(c);
    });
    return map;
  }, [active]);

  const today = new Date().getDate();
  const isBillingDay = today === 1 || today === 14;

  if (loading) return <p className="text-slate-400">Loading...</p>;

  const tabs = [
    { key: '1', label: '1st', count: groups['1'].length },
    { key: '14', label: '14th', count: groups['14'].length },
  ];
  if (groups.none.length > 0) tabs.push({ key: 'none', label: 'No date', count: groups.none.length });

  const rows = groups[tab] || [];

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <h2 className="text-xl font-bold text-white">Billing</h2>
        {isBillingDay && (
          <span className="text-xs bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full font-medium">
            Today is a billing day
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={
              'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ' +
              (tab === t.key ? 'bg-ink-700 text-white' : 'text-slate-400 hover:text-white hover:bg-ink-800')
            }
          >
            {t.label} ({t.count})
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-ink-900 border border-ink-700 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink-700 text-left">
              <th className="px-4 py-2 text-xs text-slate-500 font-medium">Client</th>
              <th className="px-4 py-2 text-xs text-slate-500 font-medium">Package</th>
              <th className="px-4 py-2 text-xs text-slate-500 font-medium">MRR</th>
              <th className="px-4 py-2 text-xs text-slate-500 font-medium">Status</th>
              <th className="px-4 py-2 text-xs text-slate-500 font-medium">Stripe</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(c => (
              <tr key={c.id} className="border-b border-ink-700/50 hover:bg-ink-800/50">
                <td className="px-4 py-2">
                  <Link to={'/clients/' + c.id} className="flex items-center gap-2 hover:text-white">
                    <span className={'w-2 h-2 rounded-full ' + (STATUS_DOT[c.status] || '')}></span>
                    <span className="text-slate-200">{c.name}</span>
                  </Link>
                </td>
                <td className="px-4 py-2 text-slate-400">{c.package || '\u2014'}</td>
                <td className="px-4 py-2 text-slate-400">{c.mrr ? '$' + Number(c.mrr).toLocaleString() : '\u2014'}</td>
                <td className="px-4 py-2">
                  <span className="text-xs text-slate-400">{STATUS_LABEL[c.status] || c.status}</span>
                </td>
                <td className="px-4 py-2 text-slate-400 text-xs">{c.stripe_status || '\u2014'}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-500 text-xs">No clients</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
