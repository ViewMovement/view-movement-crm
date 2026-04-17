import { useEffect, useState, useCallback } from 'react';
import { api } from '../lib/api.js';
import { useData } from '../lib/data.jsx';
import { useToast } from '../lib/toast.jsx';
import ClientDetailDrawer from '../components/ClientDetailDrawer.jsx';
import { SectionHeader, Skeleton, StatusDot, statusMeta } from '../components/primitives.jsx';
import { fmtDate, fmtRelative, fmtMRR } from '../lib/format.js';

export default function Retention() {
  const { refresh } = useData();
  const { show } = useToast();
  const [day, setDay] = useState(null);
  const [goals, setGoals] = useState([]);
  const [goalsForReview, setGoalsForReview] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);

  const [retentionFlags, setRetentionFlags] = useState([]);

  const load = useCallback(async () => {
    try {
      const [d, g, gr, rf] = await Promise.all([
        api.day(),
        api.activeGoals().catch(() => []),
        api.goalsForReview().catch(() => []),
        api.retentionFlags().catch(() => [])
      ]);
      setDay(d);
      setGoals(g);
      setGoalsForReview(gr);
      setRetentionFlags(rf);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Skeleton rows={10} className="h-12 w-full" />;

  const { retention_queue = [], reviews_due = [], unresponded_looms = [], missing_discord_notes = [],
    expectations_loom_alerts = [], onboarding_heroes = [], counts = {} } = day || {};

  // KPIs
  const loomsDue = retention_queue.filter(r => r.action_type === 'loom' && !r.done_today).length;
  const loomsDone = retention_queue.filter(r => r.action_type === 'loom' && r.done_today).length;
  const totalLooms = loomsDue + loomsDone;
  const loomPct = totalLooms ? Math.round(loomsDone * 100 / totalLooms) : 100;
  const respondedLooms = unresponded_looms.length;
  const discordMissing = missing_discord_notes.length;

  return (
    <>
      <SectionHeader title="Retention Dashboard" subtitle="Your command center" />

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-8">
        <KPI label="CSM Referrals" value={retentionFlags.length} accent={retentionFlags.length > 0 ? 'violet' : 'emerald'} />
        <KPI label="Looms Due Today" value={loomsDue} accent={loomsDue > 0 ? 'amber' : 'emerald'} />
        <KPI label="Loom On-Time" value={`${loomPct}%`} accent={loomPct >= 95 ? 'emerald' : loomPct >= 80 ? 'amber' : 'rose'} />
        <KPI label="Unresponded" value={respondedLooms} accent={respondedLooms > 3 ? 'rose' : respondedLooms > 0 ? 'amber' : 'emerald'} />
        <KPI label="Reviews Due" value={reviews_due.length} accent={reviews_due.length > 0 ? 'amber' : 'emerald'} />
        <KPI label="Active Goals" value={goals.length} accent="sky" />
      </div>

      {/* CSM Referrals — flags assigned to retention */}
      {retentionFlags.length > 0 && (
        <section className="mb-8 rounded-xl border border-violet-500/20 bg-violet-500/5 p-4">
          <div className="flex items-center gap-2 mb-3">
            <span>⚑</span>
            <h3 className="text-sm font-medium text-violet-300">CSM Referrals ({retentionFlags.length})</h3>
            <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-300 border border-violet-500/20">Action needed</span>
          </div>
          <div className="space-y-1.5">
            {retentionFlags.map(f => {
              const typeLabel = {
                views_complaint: '📉 Views / performance complaint',
                engagement_drop: '📭 Engagement drop',
                at_risk: '🚨 At-risk / churn signal',
                goal_adjustment_needed: '🎯 Goal adjustment needed'
              }[f.type] || f.type;
              const age = Math.floor((Date.now() - new Date(f.created_at).getTime()) / 86400000);
              return (
                <div key={f.id} className="flex items-center gap-3 rounded-lg px-3 py-2.5 bg-ink-900/40 hover:bg-ink-800 transition">
                  <StatusDot status={f.clients?.status} label={false} />
                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setOpenId(f.clients?.id || f.client_id)}>
                    <div className="text-sm font-medium truncate">{f.clients?.name || 'Client'}</div>
                    <div className="text-[11px] text-violet-300/70">{typeLabel}</div>
                    {f.detail && <div className="text-[11px] text-slate-500 truncate mt-0.5">{f.detail}</div>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-xs tabular-nums ${age >= 3 ? 'text-rose-400' : age >= 1 ? 'text-amber-400' : 'text-slate-500'}`}>
                      {age === 0 ? 'Today' : `${age}d ago`}
                    </span>
                    {f.flagged_by && <span className="text-[10px] text-slate-600">by {f.flagged_by.split('@')[0]}</span>}
                    <button onClick={async () => {
                      await api.resolveFlag(f.id);
                      show({ message: 'Referral resolved.' });
                      load();
                    }} className="text-xs px-2 py-1 rounded border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 transition">
                      Done
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Expectations Loom Alerts */}
      {expectations_loom_alerts.length > 0 && (
        <AlertSection
          title="Expectations Loom Overdue"
          accent="rose"
          icon="🎯"
          items={expectations_loom_alerts.map(a => ({
            id: a.client.id,
            label: a.label,
            sub: `Day ${a.tenure_days} — should have been sent by Day 3`,
            client: a.client
          }))}
          onOpen={setOpenId}
        />
      )}

      {/* Unresponded Looms */}
      {unresponded_looms.length > 0 && (
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-amber-400">⚠</span>
            <h3 className="text-sm font-medium">Unresponded Looms ({unresponded_looms.length})</h3>
          </div>
          <div className="space-y-1.5">
            {unresponded_looms.map(l => (
              <div key={l.id} onClick={() => setOpenId(l.client?.id)}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 bg-ink-900/60 border border-ink-800 hover:bg-ink-800 cursor-pointer transition">
                <StatusDot status={l.client?.status} label={false} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{l.client?.name}</div>
                  <div className="text-[11px] text-amber-300/70 truncate">Ask: {l.client_ask}</div>
                </div>
                <div className="flex flex-col items-end gap-0.5 shrink-0">
                  <span className={`text-xs font-medium tabular-nums ${l.days_since >= 21 ? 'text-rose-400' : l.days_since >= 14 ? 'text-amber-400' : 'text-slate-400'}`}>
                    {l.days_since}d ago
                  </span>
                  <span className="text-[10px] text-slate-600">{l.topic}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Looms Due */}
      {retention_queue.filter(r => r.action_type === 'loom').length > 0 && (
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <span>🎥</span>
            <h3 className="text-sm font-medium">Looms Due ({loomsDue} remaining)</h3>
            {totalLooms > 0 && (
              <div className="ml-auto flex items-center gap-2">
                <div className="w-32 h-1.5 rounded-full bg-ink-800 overflow-hidden">
                  <div className="h-full rounded-full bg-emerald-400 transition-all" style={{ width: `${loomPct}%` }} />
                </div>
                <span className="text-xs tabular-nums text-slate-500">{loomsDone}/{totalLooms}</span>
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            {retention_queue.filter(r => r.action_type === 'loom').map(item => (
              <RetentionItem key={item.id} item={item} onOpen={() => setOpenId(item.client.id)}
                onAction={async () => {
                  await api.action(item.client.id, 'loom_sent');
                  show({ message: `Loom sent for ${item.client.name}` });
                  load(); refresh(true);
                }} />
            ))}
          </div>
        </section>
      )}

      {/* Reviews Due */}
      {reviews_due.length > 0 && (
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <span>📋</span>
            <h3 className="text-sm font-medium">Reviews Due ({reviews_due.length})</h3>
          </div>
          <div className="space-y-1.5">
            {reviews_due.map(r => (
              <div key={r.id} onClick={() => setOpenId(r.client?.id)}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 bg-ink-900/60 border border-ink-800 hover:bg-ink-800 cursor-pointer transition">
                <StatusDot status={r.client?.status} label={false} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{r.client?.name}</div>
                  <div className="text-[11px] text-slate-500">{r.review_type?.replace('_', ' ').replace('day', 'Day ')} review</div>
                </div>
                <div className="flex flex-col items-end gap-0.5 shrink-0">
                  <span className={`text-xs tabular-nums ${r.status === 'overdue' ? 'text-rose-400' : 'text-amber-400'}`}>
                    {r.status === 'overdue' ? 'Overdue' : `Due ${fmtRelative(r.due_at)}`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Missing Discord Notes */}
      {missing_discord_notes.length > 0 && (
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-violet-400">💬</span>
            <h3 className="text-sm font-medium">Discord Notes Missing ({missing_discord_notes.length})</h3>
          </div>
          <div className="space-y-1.5">
            {missing_discord_notes.map(l => (
              <div key={l.id} className="flex items-center gap-3 rounded-lg px-3 py-2.5 bg-ink-900/60 border border-ink-800 hover:bg-ink-800 transition">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{l.client?.name} — {l.topic}</div>
                  <div className="text-[11px] text-slate-500">Loom sent {fmtRelative(l.sent_at)}</div>
                </div>
                <button onClick={async () => {
                  await api.markDiscordSent(l.id);
                  show({ message: 'Marked as sent.' });
                  load();
                }} className="btn btn-sm text-xs px-2 py-1 border border-violet-500/30 text-violet-300 hover:bg-violet-500/10">
                  Mark sent
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Goals Due for Review (monthly) */}
      {goalsForReview.length > 0 && (
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <span>🎯</span>
            <h3 className="text-sm font-medium">Goals Due for Review ({goalsForReview.length})</h3>
            <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20">Monthly review</span>
          </div>
          <div className="space-y-1.5">
            {goalsForReview.map(g => (
              <div key={g.id} onClick={() => setOpenId(g.clients?.id || g.client_id)}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 bg-ink-900/60 border border-ink-800 hover:bg-ink-800 cursor-pointer transition">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{g.clients?.name || 'Client'}</div>
                  <div className="text-[11px] text-slate-500">{g.target_label || `${g.metric}: ${g.target_value}`}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-slate-500">Period ended {fmtDate(g.period_end)}</span>
                  {['met', 'missed', 'adjusted'].map(s => (
                    <button key={s} onClick={async (e) => {
                      e.stopPropagation();
                      await api.updateGoal(g.id, { status: s });
                      show({ message: `Goal marked as ${s}.` });
                      load();
                    }} className={`text-[10px] px-1.5 py-0.5 rounded border transition ${
                      s === 'met' ? 'border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10' :
                      s === 'missed' ? 'border-rose-500/30 text-rose-400 hover:bg-rose-500/10' :
                      'border-amber-500/30 text-amber-400 hover:bg-amber-500/10'
                    }`}>
                      {s === 'met' ? 'Met' : s === 'missed' ? 'Missed' : 'Adjusted'}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Onboarding Clients */}
      {onboarding_heroes.length > 0 && (
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <span>🌱</span>
            <h3 className="text-sm font-medium">Onboarding ({onboarding_heroes.length})</h3>
          </div>
          <div className="space-y-1.5">
            {onboarding_heroes.map(h => (
              <div key={h.client.id} onClick={() => setOpenId(h.client.id)}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 bg-ink-900/60 border border-ink-800 hover:bg-ink-800 cursor-pointer transition">
                <StatusDot status={h.client.status} label={false} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{h.client.name}</div>
                  <div className="text-[11px] text-slate-500">{h.completed}/{h.total} steps</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {h.expectations_loom_sent ? (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Expectations Loom ✓</span>
                  ) : (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                      h.expectations_loom_overdue
                        ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                        : 'bg-amber-500/10 text-amber-300 border-amber-500/20'
                    }`}>
                      {h.expectations_loom_overdue ? 'Expectations Loom overdue!' : 'Needs Expectations Loom'}
                    </span>
                  )}
                  {h.next_step && (
                    <span className="text-[10px] text-slate-500">Next: {h.next_step.label}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Active Goals */}
      {goals.length > 0 && (
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <span>📊</span>
            <h3 className="text-sm font-medium">Active Goals ({goals.length})</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {goals.map(g => (
              <div key={g.id} onClick={() => setOpenId(g.clients?.id || g.client_id)}
                className="rounded-lg px-3 py-2.5 bg-ink-900/60 border border-ink-800 hover:bg-ink-800 cursor-pointer transition">
                <div className="text-sm font-medium truncate">{g.clients?.name || 'Client'}</div>
                <div className="text-[11px] text-sky-400/80 mt-0.5">{g.target_label || `${g.metric}: ${g.target_value}`}</div>
                {g.breakout_target && <div className="text-[10px] text-slate-500">Breakout: {g.breakout_target}</div>}
                <div className="text-[10px] text-slate-600 mt-0.5">
                  {g.period_end ? `Ends ${fmtDate(g.period_end)}` : 'No end date'}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {openId && <ClientDetailDrawer clientId={openId} onClose={() => setOpenId(null)} />}
    </>
  );
}

// --- Sub-components ---

function KPI({ label, value, accent = 'slate' }) {
  const colors = {
    emerald: 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5',
    amber: 'text-amber-400 border-amber-500/20 bg-amber-500/5',
    rose: 'text-rose-400 border-rose-500/20 bg-rose-500/5',
    sky: 'text-sky-400 border-sky-500/20 bg-sky-500/5',
    violet: 'text-violet-400 border-violet-500/20 bg-violet-500/5',
    slate: 'text-slate-300 border-ink-700 bg-ink-900/40',
  };
  return (
    <div className={`rounded-xl border p-3 ${colors[accent] || colors.slate}`}>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      <div className="text-[10px] uppercase tracking-wide mt-0.5 opacity-70">{label}</div>
    </div>
  );
}

function AlertSection({ title, accent, icon, items, onOpen }) {
  const colors = {
    rose: 'border-rose-500/20 bg-rose-500/5',
    amber: 'border-amber-500/20 bg-amber-500/5',
  };
  return (
    <section className={`mb-8 rounded-xl border ${colors[accent] || ''} p-4`}>
      <div className="flex items-center gap-2 mb-3">
        <span>{icon}</span>
        <h3 className="text-sm font-medium">{title}</h3>
      </div>
      <div className="space-y-1.5">
        {items.map(item => (
          <div key={item.id} onClick={() => onOpen(item.id)}
            className="flex items-center gap-3 rounded-lg px-3 py-2 bg-ink-900/40 hover:bg-ink-800 cursor-pointer transition">
            <StatusDot status={item.client?.status} label={false} />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{item.label}</div>
              {item.sub && <div className="text-[11px] text-slate-500">{item.sub}</div>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function RetentionItem({ item, onOpen, onAction }) {
  const sm = statusMeta(item.client.status);
  return (
    <div className={`flex items-center gap-3 rounded-lg px-3 py-2.5 transition ${
      item.done_today
        ? 'bg-ink-900/30 border border-ink-800/50 opacity-60'
        : item.overdue
          ? 'bg-rose-500/5 border border-rose-500/20 hover:bg-rose-500/10'
          : 'bg-ink-900/60 border border-ink-800 hover:bg-ink-800'
    } cursor-pointer`}>
      <StatusDot status={item.client.status} label={false} />
      <div className="flex-1 min-w-0" onClick={onOpen}>
        <div className="text-sm font-medium truncate">{item.client.name}</div>
        <div className={`text-[11px] truncate ${item.overdue ? 'text-rose-300/80' : 'text-slate-500'}`}>
          {item.next_action.hint}
        </div>
      </div>
      {!item.done_today ? (
        <button onClick={(e) => { e.stopPropagation(); onAction(); }}
          className="btn btn-sm text-xs px-2.5 py-1 bg-violet-500/10 border border-violet-500/30 text-violet-300 hover:bg-violet-500/20">
          Loom Sent
        </button>
      ) : (
        <span className="text-[10px] text-emerald-400">✓ Done</span>
      )}
    </div>
  );
}
