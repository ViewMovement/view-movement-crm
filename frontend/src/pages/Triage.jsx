import { useMemo, useState } from 'react';
import { useData } from '../lib/data.jsx';
import ClientDetailDrawer from '../components/ClientDetailDrawer.jsx';
import { Empty, SectionHeader, Skeleton, StatusDot, TabIntro } from '../components/primitives.jsx';
import { fmtRelative } from '../lib/format.js';

const TYPE_LABEL = {
  loom_sent: 'Loom sent',
  call_offered: 'Call offered',
  call_completed: 'Call completed',
  note: 'Note added',
  status_change: 'Status changed',
  system: 'System event'
};

const COHORT_META = {
  new:              { label: 'New (onboarding)',     hint: 'First 30 days — tight cadence.' },
  active_happy:     { label: 'Active · Happy',       hint: 'Steady cadence, hold the line.' },
  active_hands_off: { label: 'Active · Hands-off',   hint: 'Light touch, confirm weekly.' },
  cancelling:       { label: 'Cancelling',           hint: 'Save window — move fast.' }
};

export default function Triage() {
  const { triage, loading } = useData();
  const [openId, setOpenId] = useState(null);

  const monitor = triage?.monitor || [];

  if (loading && !triage) return <div className="space-y-3"><Skeleton rows={6} className="h-14 w-full" /></div>;

  const urgent = triage?.urgent || [];
  const sweep = triage?.sweep || {};
  const totalSweep = Object.values(sweep).reduce((a, b) => a + b.length, 0);

  return (
    <>
      <TabIntro id="triage" title="What is this?">
        Your daily "what needs attention right now" queue. <b>Phase 1 — Urgent</b> is red-line stuff (failed payments, critical flags, red-cohort clients overdue). Handle these first. <b>Phase 2 — Sweep</b> is everything else aging out, grouped by cohort. <b>Phase 3 — Recent activity</b> is a passive feed of the last 48 hours so nothing slips by. Click any client to open the full detail drawer.
      </TabIntro>
      <SectionHeader
        title="Triage"
        subtitle={urgent.length
          ? `${urgent.length} urgent · ${totalSweep} in sweep · ${triage?.counts?.open_flags || 0} open flags`
          : 'Urgent queue clear. Work the sweep.'} />

      <div className="space-y-10">
        {/* Phase 1: Urgent */}
        <Phase number="1" title="Urgent" subtitle="Red-line problems — handle before anything else.">
          {urgent.length === 0 ? (
            <Empty icon="✓" title="Nothing urgent." hint="No failed payments, no critical flags, no red-cohort overdue timers." />
          ) : (
            <div className="space-y-2">
              {urgent.map(u => (
                <UrgentRow key={u.client.id} row={u} onOpen={() => setOpenId(u.client.id)} />
              ))}
            </div>
          )}
        </Phase>

        {/* Phase 2: Sweep */}
        <Phase number="2" title="Client channel sweep" subtitle="Work each cohort with its own cadence.">
          {totalSweep === 0 ? (
            <Empty icon="○" title="Sweep queue clear." hint="Every client is currently within cadence." />
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              {Object.entries(COHORT_META).map(([key, meta]) => (
                <CohortColumn key={key} title={meta.label} hint={meta.hint}
                  rows={sweep[key] || []} onOpen={setOpenId} />
              ))}
            </div>
          )}
        </Phase>

        {/* Phase 4: Monitor */}
        <Phase number="3" title="Recent activity" subtitle="Passive monitor — last 48 hours.">
          {monitor.length === 0 ? (
            <div className="text-sm text-slate-500">Quiet.</div>
          ) : (
            <ol className="border-l border-ink-700 ml-2 space-y-1.5">
              {monitor.slice(0, 25).map((t, i) => (
                <li key={i} className="pl-4 relative text-sm">
                  <span className="absolute -left-[5px] top-2 h-2 w-2 rounded-full bg-ink-600 ring-4 ring-ink-950" />
                  <span className="text-slate-500 tabular-nums text-xs mr-3 inline-block w-16">{fmtRelative(t.created_at)}</span>
                  <span className="text-slate-200 font-medium mr-2">{t.client_name || 'Unknown'}</span>
                  <span className="text-slate-400">· {TYPE_LABEL[t.type] || t.type.replace(/_/g, ' ')}</span>
                  {t.content && <span className="text-slate-500 ml-2">— {String(t.content).slice(0, 80)}</span>}
                </li>
              ))}
            </ol>
          )}
        </Phase>
      </div>

      {openId && <ClientDetailDrawer clientId={openId} onClose={() => setOpenId(null)} />}
    </>
  );
}

function Phase({ number, title, subtitle, children }) {
  return (
    <section>
      <div className="flex items-baseline gap-3 mb-3">
        <span className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Phase {number}</span>
        <h3 className="text-base font-semibold text-slate-100 tracking-tight">{title}</h3>
      </div>
      {subtitle && <p className="text-xs text-slate-500 mb-3">{subtitle}</p>}
      {children}
    </section>
  );
}

function UrgentRow({ row, onOpen }) {
  const reasonLabel = {
    failed_payment: 'Failed payment',
    missed_posting: 'Missed posting',
    non_responsive: 'Non-responsive 48h+',
    overdue_batch: 'Overdue batch',
    red_overdue: 'Red + overdue'
  }[row.reason] || row.reason;
  return (
    <button onClick={onOpen}
      className="w-full flex items-center gap-3 rounded-lg border border-rose-500/40 bg-rose-500/5 px-4 py-3 hover:bg-rose-500/10 transition text-left">
      <StatusDot status={row.client.status} label={false} />
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{row.client.name}</div>
        <div className="text-xs text-rose-300 mt-0.5">⚑ {reasonLabel}{row.flags?.length > 1 ? ` +${row.flags.length - 1} more` : ''}</div>
      </div>
      <span className="text-xs text-slate-400">Open →</span>
    </button>
  );
}

function CohortColumn({ title, hint, rows, onOpen }) {
  return (
    <div className="rounded-lg border border-ink-700 bg-ink-900/40 p-4">
      <div className="flex items-baseline justify-between mb-1">
        <div className="font-medium text-sm text-slate-100">{title}</div>
        <span className="text-xs text-slate-500 tabular-nums">{rows.length}</span>
      </div>
      <p className="text-[11px] text-slate-500 mb-3">{hint}</p>
      {rows.length === 0 ? (
        <div className="text-xs text-slate-500 italic py-4 text-center">Clear.</div>
      ) : (
        <div className="space-y-1">
          {rows.slice(0, 8).map(r => (
            <button key={r.client.id} onClick={() => onOpen(r.client.id)}
              className="w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-ink-800 transition text-left">
              <StatusDot status={r.client.status} label={false} />
              <span className="flex-1 truncate">{r.client.name}</span>
              {r.overdue && <span className="text-[10px] text-rose-300">overdue</span>}
              {!r.overdue && r.due_soon && <span className="text-[10px] text-amber-300">soon</span>}
              {r.flags?.length > 0 && <span className="text-[10px] text-amber-400">⚑{r.flags.length}</span>}
            </button>
          ))}
          {rows.length > 8 && <div className="text-[11px] text-slate-500 pt-1">+ {rows.length - 8} more…</div>}
        </div>
      )}
    </div>
  );
}
