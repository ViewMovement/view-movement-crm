import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useToast } from '../lib/toast.jsx';
import ClientDetailDrawer from '../components/ClientDetailDrawer.jsx';
import { SectionHeader, Skeleton, StatusDot, Empty } from '../components/primitives.jsx';

export default function Billing() {
  const [state, setState] = useState(null);
  const [openId, setOpenId] = useState(null);
  const { show } = useToast();

  async function load() { setState(await api.billingToday()); }
  useEffect(() => { load(); }, []);

  async function mark(client_id, period_date, status, note) {
    await api.billingCheck({ client_id, period_date, status, note });
    load();
    show({ message: `Marked ${status}.` });
  }

  if (!state) return <div className="space-y-3"><Skeleton rows={6} className="h-14 w-full" /></div>;
  const { rows, counts, billing_day, period_date, is_check_day } = state;

  return (
    <>
      <SectionHeader
        title={`Billing · ${billing_day}${suffix(billing_day)}`}
        subtitle={is_check_day
          ? `Check day. ${counts.pending} pending · ${counts.ok} verified · ${counts.failed} failed`
          : `Not a check day. Upcoming ${billing_day}${suffix(billing_day)} roster.`} />

      {rows.length === 0 ? (
        <Empty icon="○" title="No clients on this billing day." />
      ) : (
        <div className="rounded-lg border border-ink-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-ink-900/80">
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-400">
                <th className="px-4 py-2">Client</th>
                <th className="px-4 py-2">Package</th>
                <th className="px-4 py-2">MRR</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.client.id} className="border-t border-ink-800 hover:bg-ink-900/40">
                  <td className="px-4 py-2">
                    <button onClick={() => setOpenId(r.client.id)} className="flex items-center gap-2 hover:underline">
                      <StatusDot status={r.client.status} label={false} />
                      <span className="font-medium">{r.client.name}</span>
                    </button>
                  </td>
                  <td className="px-4 py-2 text-slate-400 tabular-nums">{r.client.package || '—'}</td>
                  <td className="px-4 py-2 text-slate-400 tabular-nums">{r.client.mrr ? `$${r.client.mrr}` : '—'}</td>
                  <td className="px-4 py-2">
                    <StatusPill status={r.check?.status || 'pending'} />
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2 justify-end">
                      <button className="btn btn-sm" onClick={() => mark(r.client.id, period_date, 'ok')}>OK</button>
                      <button className="btn btn-sm text-rose-300 border-rose-500/40" onClick={() => mark(r.client.id, period_date, 'failed')}>Failed</button>
                      <button className="btn btn-sm text-slate-400" onClick={() => mark(r.client.id, period_date, 'skipped')}>Skip</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {openId && <ClientDetailDrawer clientId={openId} onClose={() => setOpenId(null)} />}
    </>
  );
}

function StatusPill({ status }) {
  const meta = {
    pending: ['bg-ink-700 text-slate-300', 'Pending'],
    ok:      ['bg-emerald-500/15 text-emerald-300', 'Verified'],
    failed:  ['bg-rose-500/15 text-rose-300', 'Failed'],
    skipped: ['bg-ink-800 text-slate-500', 'Skipped']
  }[status] || ['bg-ink-700 text-slate-400', status];
  return <span className={`pill ${meta[0]}`}>{meta[1]}</span>;
}

function suffix(n) { return n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'; }
