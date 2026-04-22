import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';

const STATUS_COLORS = { green: 'bg-emerald-400', yellow: 'bg-yellow-400', red: 'bg-red-400', churned: 'bg-slate-500' };

export default function Billing() {
  const [clients, setClients] = useState(null);
  const [tab, setTab] = useState('1');

  useEffect(() => { api.listClients().then(setClients); }, []);

  const grouped = useMemo(() => {
    if (!clients) return { '1': [], '14': [], unset: [] };
    const g = { '1': [], '14': [], unset: [] };
    for (const c of clients) {
      if (c.status === 'churned') continue;
      if (c.billing_date === 1) g['1'].push(c);
      else if (c.billing_date === 14) g['14'].push(c);
      else g.unset.push(c);
    }
    return g;
  }, [clients]);

  if (!clients) return <div className="text-slate-400">Loading...</div>;

  const today = new Date().getDate();
  const isCheckDay = today === 1 || today === 14;
  const rows = tab === 'unset' ? grouped.unset : grouped[tab] || [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Billing</h2>
        <p className="text-sm text-slate-400 mt-1">
          {isCheckDay
            ? `Today is a billing day (the ${today}${suffix(today)}). Check Stripe for each client below.`
            : `Upcoming billing roster. Next check day: the ${today <= 1 ? '1st' : today <= 14 ? '14th' : '1st'}.`}
        </p>
      </div>

      <div className="flex gap-2">
        <button onClick={() => setTab('1')}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === '1' ? 'bg-ink-700 text-white' : 'text-slate-400 hover:text-slate-200 hover:bg-ink-800'}`}>
          1st ({grouped['1'].length})
        </button>
        <button onClick={() => setTab('14')}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === '14' ? 'bg-ink-700 text-white' : 'text-slate-400 hover:text-slate-200 hover:bg-ink-800'}`}>
          14th ({grouped['14'].length})
        </button>
        {grouped.unset.length > 0 && (
          <button onClick={() => setTab('unset')}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === 'unset' ? 'bg-ink-700 text-white' : 'text-slate-400 hover:text-slate-200 hover:bg-ink-800'}`}>
            No date ({grouped.unset.length})
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="card p-8 text-center text-slate-400">No clients billing on this date.</div>
      ) : (
        <div className="rounded-lg border border-ink-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-ink-900/80">
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-400">
                <th className="px-4 py-2">Client</th>
                <th className="px-4 py-2">Package</th>
                <th className="px-4 py-2">MRR</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Stripe</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(c => (
                <tr key={c.id} className="border-t border-ink-800 hover:bg-ink-900/40">
                  <td className="px-4 py-2">
                    <Link to={`/clients/${c.id}`} className="flex items-center gap-2 hover:underline">
                      <span className={`w-2 h-2 rounded-full ${STATUS_COLORS[c.status] || 'bg-slate-500'}`} />
                      <span className="font-medium">{c.name}</span>
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-slate-400 tabular-nums">{c.package ? `${c.package} reels` : '\u2014'}</td>
                  <td className="px-4 py-2 text-slate-400 tabular-nums">{c.mrr ? `$${c.mrr}` : '\u2014'}</td>
                  <td className="px-4 py-2">
                    <span className={`pill ${
                      c.status === 'green' ? 'bg-emerald-500/15 text-emerald-300' :
                      c.status === 'yellow' ? 'bg-yellow-500/15 text-yellow-300' :
                      c.status === 'red' ? 'bg-red-500/15 text-red-300' :
                      'bg-slate-500/15 text-slate-300'
                    }`}>
                      {c.status === 'green' ? 'Healthy' : c.status === 'yellow' ? 'Watch' : c.status === 'red' ? 'At Risk' : c.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-slate-400">{c.stripe_status || '\u2014'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function suffix(n) { return n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'; }
