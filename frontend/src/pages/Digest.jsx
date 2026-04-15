import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import ClientDetailDrawer from '../components/ClientDetailDrawer.jsx';
import { Empty, SectionHeader, Skeleton, StatusDot } from '../components/primitives.jsx';

export default function Digest() {
  const [d, setD] = useState(null);
  const [openId, setOpenId] = useState(null);

  useEffect(() => { api.weeklyDigest().then(setD); }, []);

  if (!d) return <Skeleton rows={8} className="h-20 w-full" />;

  const stats = [
    { label: 'Looms sent',      value: d.counts.loom_sent,      accent: 'emerald' },
    { label: 'Calls offered',   value: d.counts.call_offered,   accent: 'slate' },
    { label: 'Calls completed', value: d.counts.call_completed, accent: 'emerald' },
    { label: 'Notes logged',    value: d.counts.notes,          accent: 'slate' },
    { label: 'Onboarded',       value: d.onboarded_this_week,   accent: 'emerald' },
    { label: 'Churned',         value: d.churned_this_week,     accent: 'rose' },
    { label: 'Status changes',  value: d.status_changes,        accent: 'slate' },
    { label: 'Total clients',   value: d.total_clients,         accent: 'slate' }
  ];

  return (
    <>
      <SectionHeader
        title="Weekly Digest"
        subtitle={`Past 7 days · ${d.counts.loom_sent + d.counts.call_offered + d.counts.call_completed} total touchpoints`}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-10">
        {stats.map(s => <StatCard key={s.label} {...s} />)}
      </div>

      <section className="mb-10">
        <h3 className="text-sm font-medium mb-3 tracking-tight">Roster composition</h3>
        <div className="card p-4">
          <Bar total={d.total_clients} segments={[
            { key: 'green',   value: d.by_status.green,   label: 'Healthy', color: 'bg-emerald-500' },
            { key: 'yellow',  value: d.by_status.yellow,  label: 'Watch',   color: 'bg-amber-500' },
            { key: 'red',     value: d.by_status.red,     label: 'At Risk', color: 'bg-rose-500' },
            { key: 'churned', value: d.by_status.churned, label: 'Churned', color: 'bg-slate-500' }
          ]} />
        </div>
      </section>

      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h3 className="text-sm font-medium tracking-tight">Stale — no touchpoint in 21+ days</h3>
          <span className="text-xs text-slate-500 tabular-nums">{d.stale_clients.length}</span>
        </div>
        {d.stale_clients.length === 0 ? (
          <Empty icon="✓" title="No stale clients." hint="Every active client has been touched recently." />
        ) : (
          <div className="space-y-1.5">
            {d.stale_clients.map(c => (
              <button key={c.id} onClick={() => setOpenId(c.id)}
                className="w-full flex items-center gap-3 text-left px-3 py-2 rounded-lg border border-ink-800 hover:bg-ink-800/60 transition">
                <StatusDot status={c.status} label={false} />
                <span className="font-medium flex-1 truncate">{c.name}</span>
                <span className="text-xs text-slate-500">{c.email || '—'}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      {openId && <ClientDetailDrawer clientId={openId} onClose={() => setOpenId(null)} />}
    </>
  );
}

function StatCard({ label, value, accent }) {
  const color =
    accent === 'emerald' ? 'text-emerald-300' :
    accent === 'rose' ? 'text-rose-300' : 'text-slate-200';
  return (
    <div className="card p-4">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`text-3xl font-semibold tabular-nums mt-1 ${color}`}>{value}</div>
    </div>
  );
}

function Bar({ segments, total }) {
  const t = total || segments.reduce((a, s) => a + s.value, 0) || 1;
  return (
    <>
      <div className="flex h-2 w-full rounded-full overflow-hidden bg-ink-900">
        {segments.map(s => s.value > 0 && (
          <div key={s.key} className={s.color} style={{ width: `${(s.value / t) * 100}%` }} title={`${s.label}: ${s.value}`} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-2 mt-3 text-xs text-slate-400">
        {segments.map(s => (
          <span key={s.key} className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${s.color}`} />
            <span>{s.label}</span>
            <span className="text-slate-200 tabular-nums">{s.value}</span>
          </span>
        ))}
      </div>
    </>
  );
}
