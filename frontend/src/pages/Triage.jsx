import { useMemo, useState } from 'react';
import { useData } from '../lib/data.jsx';
import { api } from '../lib/api.js';
import { useToast } from '../lib/toast.jsx';
import ClientDetailDrawer from '../components/ClientDetailDrawer.jsx';
import { Empty, SectionHeader, Skeleton, StatusDot, TabIntro } from '../components/primitives.jsx';
import { fmtRelative, fmtMRR } from '../lib/format.js';
import { useRole } from '../lib/role.jsx';

const TYPE_LABEL = {
  loom_sent: 'Loom sent',
  call_offered: 'Call offered',
  call_completed: 'Call completed',
  note: 'Note added',
  status_change: 'Status changed',
  system: 'System event'
};

const URGENCY_BADGE = {
  urgent: { bg: 'bg-rose-500/15 text-rose-300', label: 'Urgent' },
  heads_up: { bg: 'bg-amber-500/15 text-amber-300', label: 'Heads up' },
  fyi: { bg: 'bg-slate-500/15 text-slate-300', label: 'FYI' }
};

export default function Triage() {
  const { triage, loading, refresh } = useData();
  const { show } = useToast();
  const { canSeeFinancials } = useRole();
  const [openId, setOpenId] = useState(null);

  const monitor = triage?.monitor || [];

  if (loading && !triage) return <div className="space-y-3"><Skeleton rows={6} className="h-14 w-full" /></div>;

  const urgent = triage?.urgent || [];
  const onboarding = triage?.onboarding || [];
  const pulseItems = triage?.pulse_pressing || [];
  const retention = triage?.retention || [];
  const counts = triage?.counts || {};

  const retentionDue = retention.filter(r => !r.done_today);
  const retentionDone = retention.filter(r => r.done_today);
  const todayCount = onboarding.length + pulseItems.length;

  async function doRetentionAction(clientId, actionType) {
    const type = actionType === 'loom' ? 'loom_sent' : 'call_offered';
    const label = actionType === 'loom' ? 'Loom Sent' : 'Call Offered';
    await api.action(clientId, type);
    refresh(true);
    show({ message: `${label} logged.` });
  }

  return (
    <>
      <TabIntro id="triage" title="What is this?">
        Your daily command center. <b>Urgent</b> is red-line stuff that needs immediate attention. <b>Today</b> shows new/onboarding clients and pressing Slack Pulse alerts. <b>Retention</b> is your Loom and call to-do list — work through these to keep clients engaged. <b>Recent activity</b> is a passive feed so nothing slips by.
      </TabIntro>
      <SectionHeader
        title="Triage"
        subtitle={urgent.length
          ? `${urgent.length} urgent · ${todayCount} today · ${counts.retention_due || 0} retention actions`
          : `${todayCount} today · ${counts.retention_due || 0} retention actions · ${counts.open_flags || 0} open flags`} />

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

        {/* Phase 2: Today — Onboarding + Pressing Slack Pulse */}
        <Phase number="2" title="Today" subtitle="New clients in onboarding + pressing Slack signals.">
          {todayCount === 0 ? (
            <Empty icon="○" title="All clear for today." hint="No onboarding clients or pressing Slack items right now." />
          ) : (
            <div className="space-y-4">
              {/* Onboarding clients */}
              {onboarding.length > 0 && (
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-2">Onboarding ({onboarding.length})</div>
                  <div className="space-y-1.5">
                    {onboarding.map(o => (
                      <button key={o.client.id} onClick={() => setOpenId(o.client.id)}
                        className={`w-full flex items-center gap-3 rounded-lg border px-4 py-3 hover:bg-emerald-500/10 transition text-left ${
                          o.next_step?.blocked ? 'border-amber-500/20 bg-amber-500/5' : 'border-emerald-500/20 bg-emerald-500/5'
                        }`}>
                        <StatusDot status={o.client.status} label={false} />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{o.client.name}</div>
                          <div className="text-xs mt-0.5">
                            <span className="text-emerald-300/70">{o.completed}/{o.total}</span>
                            {o.next_step && (
                              <span className={o.next_step.blocked ? 'text-amber-400 ml-2' : 'text-slate-500 ml-2'}>
                                Next: {o.next_step.label}{o.next_step.blocked ? ' (blocked)' : ''}
                              </span>
                            )}
                          </div>
                        </div>
                        {canSeeFinancials && o.client.mrr ? <span className="text-xs tabular-nums text-emerald-300/80 font-medium shrink-0">${fmtMRR(o.client.mrr, { compact: true })}</span> : null}
                        <span className="text-xs text-slate-400">→</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Pressing Slack Pulse items */}
              {pulseItems.length > 0 && (
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-2">Slack Pulse — Pressing ({pulseItems.length})</div>
                  <div className="space-y-1.5">
                    {pulseItems.map(item => {
                      const badge = URGENCY_BADGE[item.urgency] || URGENCY_BADGE.fyi;
                      return (
                        <div key={item.id}
                          className="w-full flex items-start gap-3 rounded-lg border border-ink-700 bg-ink-900/60 px-4 py-3 text-left">
                          <span className={`pill text-[10px] shrink-0 mt-0.5 ${badge.bg}`}>{badge.label}</span>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs text-slate-500 mb-0.5">
                              #{item.channel?.name || 'unknown'}
                              <span className="ml-2 tabular-nums">{fmtRelative(item.created_at)}</span>
                            </div>
                            <div className="text-sm text-slate-200">{item.summary || item.classification || '—'}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </Phase>

        {/* Phase 3: Retention — Loom/Call to-dos */}
        <Phase number="3" title="Retention" subtitle="Loom and call actions to keep clients engaged.">
          {retention.length === 0 ? (
            <Empty icon="○" title="All retention actions are on track." hint="No Loom or call timers are overdue or due soon." />
          ) : (
            <div className="space-y-4">
              {/* Progress bar */}
              {retention.length > 0 && (
                <div>
                  <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
                    <span>Today's progress</span>
                    <span className="tabular-nums">{retentionDone.length}/{retention.length} done</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-ink-800 overflow-hidden">
                    <div className="h-full bg-emerald-500 transition-all duration-500"
                      style={{ width: `${retention.length ? (retentionDone.length / retention.length * 100) : 0}%` }} />
                  </div>
                </div>
              )}

              {/* Due items */}
              {retentionDue.length > 0 && (
                <div className="space-y-1.5">
                  {retentionDue.map((r, i) => (
                    <RetentionRow key={`${r.client.id}-${r.action_type}`} item={r}
                      onOpen={() => setOpenId(r.client.id)}
                      onAction={() => doRetentionAction(r.client.id, r.action_type)} />
                  ))}
                </div>
              )}

              {/* Done items (collapsed) */}
              {retentionDone.length > 0 && (
                <details className="group">
                  <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-300 transition">
                    {retentionDone.length} completed today
                  </summary>
                  <div className="space-y-1 mt-2 opacity-50">
                    {retentionDone.map(r => (
                      <div key={`${r.client.id}-${r.action_type}`}
                        className="flex items-center gap-3 rounded-md px-4 py-2 text-sm text-slate-500 line-through">
                        <span>✓</span>
                        <span>{r.action_type === 'loom' ? 'Loom' : 'Call'} — {r.client.name}</span>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}
        </Phase>

        {/* Phase 4: Monitor */}
        <Phase number="4" title="Recent activity" subtitle="Passive monitor — last 48 hours.">
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
  const { canSeeFinancials } = useRole();
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
      {canSeeFinancials && row.client.mrr ? <span className="text-xs tabular-nums text-rose-300/80 font-medium shrink-0">{fmtMRR(row.client.mrr, { compact: true })}</span> : null}
      <span className="text-xs text-slate-400">→</span>
    </button>
  );
}

function RetentionRow({ item, onOpen, onAction }) {
  const { canSeeFinancials } = useRole();
  const isLoom = item.action_type === 'loom';
  const borderColor = item.overdue ? 'border-amber-500/30 bg-amber-500/5' : 'border-ink-700 bg-ink-900/40';
  const hint = item.overdue
    ? `${item.days_overdue}d overdue`
    : 'Due soon';

  return (
    <div className={`flex items-center gap-3 rounded-lg border ${borderColor} px-4 py-3`}>
      <button onClick={onOpen} className="flex-1 flex items-center gap-3 min-w-0 text-left hover:opacity-80 transition">
        <StatusDot status={item.client.status} label={false} />
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm truncate">{item.client.name}</div>
          <div className="text-xs text-slate-400 mt-0.5">
            {isLoom ? '🎥 Send Loom' : '📞 Offer call'}
            <span className={`ml-2 ${item.overdue ? 'text-amber-300' : 'text-slate-500'}`}>{hint}</span>
          </div>
        </div>
        {canSeeFinancials && item.client.mrr ? <span className="text-[10px] tabular-nums text-slate-500 shrink-0">{fmtMRR(item.client.mrr, { compact: true })}</span> : null}
      </button>
      <button onClick={onAction}
        className="btn btn-sm btn-primary shrink-0 text-xs px-3">
        {isLoom ? 'Loom Sent' : 'Call Offered'}
      </button>
    </div>
  );
}
