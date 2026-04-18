import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useToast } from '../lib/toast.jsx';
import { useData } from '../lib/data.jsx';
import ClientDetailDrawer from '../components/ClientDetailDrawer.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import { Skeleton, StatusDot } from '../components/primitives.jsx';
import { fmtRelative, fmtMRR } from '../lib/format.js';
import { useRole } from '../lib/role.jsx';

const URGENCY_BADGE = {
  urgent:   { bg: 'bg-rose-500/15 text-rose-300 border-rose-500/30', label: 'Urgent' },
  heads_up: { bg: 'bg-amber-500/15 text-amber-300 border-amber-500/30', label: 'Heads up' }
};

const PHASES = [
  { n: 1, label: 'Urgent triage', icon: '🔴', desc: 'Handle critical flags and red-line items first' },
  { n: 2, label: 'Onboarding + Pulse', icon: '🌱', desc: 'Check on new clients and Slack signals' },
  { n: 3, label: 'Retention actions', icon: '🎥', desc: 'Send Looms and make call offers' },
  { n: 4, label: 'Passive monitor', icon: '📡', desc: 'Review the timeline, then wrap up' },
];

export default function DayFlow() {
  const [day, setDay] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [confirming, setConfirming] = useState(null);
  const [activePhase, setActivePhase] = useState(null); // which phase is expanded
  const { show } = useToast();
  const { refresh } = useData();
  const nav = useNavigate();

  const load = useCallback(async () => {
    try { setDay(await api.day()); } catch (e) { show({ message: e.message }); }
  }, [show]);

  useEffect(() => { load(); }, [load]);

  // Auto-expand the first incomplete phase
  useEffect(() => {
    if (!day) return;
    const { routine } = day;
    if (!routine.phase_1_done) setActivePhase(1);
    else if (!routine.phase_2_done) setActivePhase(2);
    else if (!routine.phase_3_done) setActivePhase(3);
    else if (!routine.phase_4_done) setActivePhase(4);
    else setActivePhase(null);
  }, [day]);

  if (!day) return <div className="space-y-4 py-8"><Skeleton rows={4} className="h-24 w-full rounded-xl" /></div>;

  const { greeting, ops_queue, retention_queue, pulse_pressing, progress, onboarding_heroes, billing, routine, counts } = day;
  const userFirst = (day.user_email || '').split('@')[0].split('.')[0];
  const { canSeeFinancials } = useRole();

  const retentionDue = (retention_queue || []).filter(r => !r.done_today);
  const retentionDone = (retention_queue || []).filter(r => r.done_today);

  const phaseDone = [routine.phase_1_done, routine.phase_2_done, routine.phase_3_done, routine.phase_4_done];
  const completedPhases = phaseDone.filter(Boolean).length;
  const allPhases = completedPhases === 4;

  async function doOpsAction(item) {
    if (item.next_action.type === 'flag') setOpenId(item.client.id);
  }

  async function doRetentionAction(item) {
    if (item.action_type === 'loom') {
      setConfirming({
        title: `Send Loom to ${item.client.name}?`,
        subtitle: 'Record it, paste the URL, then confirm.',
        checks: ['Video is actually recorded', 'Video is actually sent to the client'],
        confirmLabel: 'Logged · Mark sent',
        onConfirm: async () => {
          await api.action(item.client.id, 'loom_sent');
          toastAndReload(`Loom logged for ${item.client.name}`, item.client.id);
        }
      });
    } else {
      await api.action(item.client.id, 'call_offered');
      toastAndReload(`Call offer logged for ${item.client.name}`, item.client.id);
    }
  }

  function toastAndReload(msg, clientId) {
    load(); refresh(true);
    show({
      message: msg,
      action: { label: 'Undo', onClick: async () => { await api.undoLast(clientId); load(); refresh(true); show({ message: 'Undone.' }); } }
    });
  }

  async function snooze(clientId, timerType, days) {
    await api.snooze(clientId, timerType, days);
    load(); refresh(true);
    show({ message: `Snoozed ${days}d` });
  }

  async function togglePhase(n) {
    await api.togglePhase(n);
    load();
  }

  function phaseCount(n) {
    if (n === 1) return counts.urgent || 0;
    if (n === 2) return onboarding_heroes.length + (pulse_pressing || []).length;
    if (n === 3) return counts.retention_due || 0;
    return null;
  }

  return (
    <>
      {/* ── Hero ── */}
      <section className="mb-8 pt-2">
        <h1 className="text-4xl font-bold tracking-tight text-slate-50 capitalize">
          {greeting}, {userFirst}.
        </h1>
        <p className="text-lg text-slate-400 mt-2">
          {allPhases
            ? "You're done for the day. Nice work. 🌲"
            : "Here's your daily game plan — work through each phase."}
        </p>
      </section>

      {/* ── Overall progress bar ── */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-slate-300">Daily progress</span>
          <span className="text-sm tabular-nums text-slate-400">{completedPhases}/4 phases</span>
        </div>
        <div className="h-3 rounded-full bg-ink-800 overflow-hidden">
          <div className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-all duration-700 ease-out rounded-full"
            style={{ width: `${(completedPhases / 4) * 100}%` }} />
        </div>
      </section>

      {/* ── Billing banner ── */}
      {billing.is_check_day && (
        <button onClick={() => nav('/billing')}
          className="mb-6 w-full rounded-2xl border-2 border-amber-500/40 bg-amber-500/5 px-6 py-5 text-left hover:bg-amber-500/10 transition flex items-center gap-4">
          <span className="text-3xl">💳</span>
          <div className="flex-1">
            <div className="text-lg font-semibold text-amber-200">Billing verification day</div>
            <div className="text-sm text-amber-300/70 mt-0.5">Today is the {billing.relevant_day}{suffix(billing.relevant_day)} — run your billing checklist.</div>
          </div>
          <span className="text-xl text-amber-200">→</span>
        </button>
      )}

      {/* ══════ PHASE CARDS ══════ */}
      <section className="space-y-4 mb-10">
        {PHASES.map((phase, i) => {
          const done = phaseDone[i];
          const isActive = activePhase === phase.n;
          const count = phaseCount(phase.n);

          return (
            <div key={phase.n}
              className={`rounded-2xl border-2 transition-all duration-300 overflow-hidden ${
                done
                  ? 'border-emerald-500/30 bg-emerald-500/5'
                  : isActive
                    ? 'border-slate-500/40 bg-ink-900/80'
                    : 'border-ink-700 bg-ink-900/40'
              }`}>
              {/* Phase header — always visible */}
              <button
                onClick={() => setActivePhase(isActive ? null : phase.n)}
                className="w-full flex items-center gap-4 px-6 py-5 text-left hover:bg-white/[0.02] transition">
                {/* Status circle */}
                <div className={`h-12 w-12 rounded-full grid place-items-center text-xl shrink-0 ${
                  done
                    ? 'bg-emerald-500 text-white'
                    : 'bg-ink-800 border-2 border-ink-600'
                }`}>
                  {done ? '✓' : phase.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <span className={`text-lg font-semibold ${done ? 'text-emerald-300' : 'text-slate-100'}`}>
                      {phase.label}
                    </span>
                    {count != null && count > 0 && !done && (
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-700 text-slate-200 tabular-nums">
                        {count}
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-slate-500 mt-0.5">{phase.desc}</div>
                </div>
                <span className={`text-lg text-slate-500 transition-transform ${isActive ? 'rotate-180' : ''}`}>▾</span>
              </button>

              {/* Phase content — expanded */}
              {isActive && !done && (
                <div className="px-6 pb-6 border-t border-ink-700/50">
                  <PhaseContent
                    phase={phase.n}
                    ops_queue={ops_queue}
                    pulse_pressing={pulse_pressing}
                    onboarding_heroes={onboarding_heroes}
                    retentionDue={retentionDue}
                    retentionDone={retentionDone}
                    retention_queue={retention_queue}
                    canSeeFinancials={canSeeFinancials}
                    onOpenClient={setOpenId}
                    onOpsAction={doOpsAction}
                    onRetentionAction={doRetentionAction}
                    onSnooze={snooze}
                  />
                  <button onClick={() => togglePhase(phase.n)}
                    className="mt-6 w-full btn btn-primary py-3 text-base font-semibold rounded-xl">
                    Mark Phase {phase.n} Complete ✓
                  </button>
                </div>
              )}

              {/* Completed phase — collapsed summary */}
              {done && isActive && (
                <div className="px-6 pb-5 border-t border-emerald-500/20">
                  <div className="flex items-center justify-between pt-4">
                    <span className="text-sm text-emerald-300/70">Phase complete</span>
                    <button onClick={() => togglePhase(phase.n)} className="text-xs text-slate-500 hover:text-slate-300 transition">
                      Undo
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </section>

      {/* ── Retention progress (always visible as context) ── */}
      {(retention_queue || []).length > 0 && (
        <section className="mb-10 rounded-2xl border border-ink-700 bg-ink-900/40 p-6">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-slate-300">Retention progress today</span>
            <span className="text-sm tabular-nums text-slate-400">{retentionDone.length}/{retention_queue.length}</span>
          </div>
          <div className="h-2.5 rounded-full bg-ink-800 overflow-hidden">
            <div className="h-full bg-emerald-500 transition-all duration-500 rounded-full"
              style={{ width: `${retention_queue.length ? (retentionDone.length / retention_queue.length * 100) : 0}%` }} />
          </div>
          {retentionDone.length > 0 && (
            <details className="mt-4 group">
              <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-300 transition">
                {retentionDone.length} completed today
              </summary>
              <div className="space-y-1 mt-2 opacity-50">
                {retentionDone.map(item => (
                  <div key={item.id} className="flex items-center gap-3 text-sm text-slate-500 line-through px-1 py-1">
                    <span className="text-emerald-500">✓</span>
                    <span>{item.action_type === 'loom' ? 'Loom' : 'Call'} — {item.client.name}</span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </section>
      )}

      {openId && <ClientDetailDrawer clientId={openId} onClose={() => { setOpenId(null); load(); }} />}
      {confirming && <ConfirmDialog {...confirming} onClose={() => setConfirming(null)} />}
    </>
  );
}

/* ══════ Phase content (what shows inside each expanded phase) ══════ */

function PhaseContent({ phase, ops_queue, pulse_pressing, onboarding_heroes, retentionDue, retentionDone, retention_queue, canSeeFinancials, onOpenClient, onOpsAction, onRetentionAction, onSnooze }) {
  if (phase === 1) return <Phase1Content ops_queue={ops_queue} canSeeFinancials={canSeeFinancials} onOpsAction={onOpsAction} />;
  if (phase === 2) return <Phase2Content pulse_pressing={pulse_pressing} onboarding_heroes={onboarding_heroes} onOpenClient={onOpenClient} />;
  if (phase === 3) return <Phase3Content retentionDue={retentionDue} canSeeFinancials={canSeeFinancials} onOpenClient={onOpenClient} onRetentionAction={onRetentionAction} onSnooze={onSnooze} />;
  return <Phase4Content />;
}

function Phase1Content({ ops_queue, canSeeFinancials, onOpsAction }) {
  if (!ops_queue?.length) return <EmptyPhase message="No urgent flags. You're clear." />;
  return (
    <div className="space-y-3 pt-5">
      <div className="text-xs text-slate-500 mb-1">{ops_queue.length} urgent item{ops_queue.length !== 1 ? 's' : ''} need attention</div>
      {ops_queue.map(item => (
        <button key={item.id} onClick={() => onOpsAction(item)}
          className="w-full flex items-center gap-4 rounded-xl border border-rose-500/30 bg-rose-500/5 px-5 py-4 hover:bg-rose-500/10 transition text-left group">
          <div className="h-10 w-10 rounded-full bg-rose-500/15 grid place-items-center shrink-0">
            <span className="text-lg">🔴</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-slate-100 group-hover:text-white transition">{item.next_action.label}</div>
            <div className="text-sm text-rose-300/70 mt-0.5">{item.next_action.hint}{item.flags > 1 ? ` · ${item.flags} flags` : ''}</div>
          </div>
          {canSeeFinancials && item.client.mrr ? <span className="text-sm tabular-nums text-rose-300/60">${fmtMRR(item.client.mrr, { compact: true })}</span> : null}
          <span className="text-slate-500 group-hover:text-slate-300 transition text-lg">→</span>
        </button>
      ))}
    </div>
  );
}

function Phase2Content({ pulse_pressing, onboarding_heroes, onOpenClient }) {
  const hasItems = (pulse_pressing || []).length > 0 || onboarding_heroes.length > 0;
  if (!hasItems) return <EmptyPhase message="No onboarding clients or pressing Slack signals." />;
  return (
    <div className="space-y-5 pt-5">
      {/* Onboarding */}
      {onboarding_heroes.length > 0 && (
        <div>
          <div className="text-xs uppercase tracking-wider text-emerald-400/70 font-medium mb-3">Onboarding clients</div>
          <div className="space-y-3">
            {onboarding_heroes.map(h => (
              <button key={h.client.id} onClick={() => onOpenClient(h.client.id)}
                className={`w-full flex items-center gap-4 rounded-xl border px-5 py-4 hover:brightness-110 transition text-left ${
                  h.next_step?.blocked ? 'border-amber-500/30 bg-amber-500/5' : 'border-emerald-500/30 bg-emerald-500/5'
                }`}>
                <div className="h-10 w-10 rounded-full bg-emerald-500/15 grid place-items-center shrink-0">
                  <span className="text-xl">{h.next_step?.blocked ? '⚠️' : '🌱'}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-slate-100">{h.client.name}</div>
                  <div className="text-sm mt-0.5">
                    <span className="text-emerald-300 tabular-nums">{h.completed}/{h.total} steps</span>
                    {h.next_step && (
                      <span className={`ml-3 ${h.next_step.blocked ? 'text-amber-400' : 'text-slate-500'}`}>
                        Next: {h.next_step.label}{h.next_step.blocked ? ' (blocked)' : ''}
                      </span>
                    )}
                  </div>
                </div>
                <div className="w-24 shrink-0">
                  <div className="h-2 rounded-full bg-ink-800 overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${(h.completed / h.total) * 100}%` }} />
                  </div>
                </div>
                <span className="text-slate-500 text-lg">→</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Slack Pulse */}
      {(pulse_pressing || []).length > 0 && (
        <div>
          <div className="text-xs uppercase tracking-wider text-slate-500 font-medium mb-3">Pressing Slack signals</div>
          <div className="space-y-3">
            {pulse_pressing.map(item => {
              const badge = URGENCY_BADGE[item.urgency] || URGENCY_BADGE.heads_up;
              return (
                <div key={item.id}
                  className={`flex items-start gap-4 rounded-xl border ${badge.bg.includes('rose') ? 'border-rose-500/20' : 'border-amber-500/20'} bg-ink-900/60 px-5 py-4`}>
                  <span className={`pill text-xs border shrink-0 mt-0.5 ${badge.bg}`}>{badge.label}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-slate-500 mb-1">
                      #{item.channel?.name || 'unknown'}
                      <span className="ml-2 tabular-nums">{fmtRelative(item.created_at)}</span>
                    </div>
                    <div className="text-sm text-slate-200 leading-relaxed">{item.summary || item.classification || '—'}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function Phase3Content({ retentionDue, canSeeFinancials, onOpenClient, onRetentionAction, onSnooze }) {
  if (!retentionDue?.length) return <EmptyPhase message="All retention actions are on track. No Looms or calls due." />;
  return (
    <div className="space-y-3 pt-5">
      <div className="text-xs text-slate-500 mb-1">{retentionDue.length} action{retentionDue.length !== 1 ? 's' : ''} due</div>
      {retentionDue.map(item => (
        <RetentionCard key={item.id} item={item}
          canSeeFinancials={canSeeFinancials}
          onOpen={() => onOpenClient(item.client.id)}
          onAction={() => onRetentionAction(item)}
          onSnooze={(d) => onSnooze(item.client.id, item.action_type === 'loom' ? 'loom' : 'call_offer', d)} />
      ))}
    </div>
  );
}

function Phase4Content() {
  return (
    <div className="pt-5">
      <div className="rounded-xl bg-ink-800/40 border border-ink-700/50 p-6 text-center">
        <div className="text-3xl mb-3">📡</div>
        <div className="text-slate-200 font-medium mb-1">Quick scan</div>
        <div className="text-sm text-slate-500 max-w-sm mx-auto">
          Glance at the Activity feed and Slack Pulse. If nothing needs action, you're done for the day.
        </div>
      </div>
    </div>
  );
}

function EmptyPhase({ message }) {
  return (
    <div className="pt-5 text-center py-6">
      <div className="text-2xl mb-2">✓</div>
      <div className="text-sm text-slate-400">{message}</div>
    </div>
  );
}

/* ── Retention action card ── */

function RetentionCard({ item, canSeeFinancials, onOpen, onAction, onSnooze }) {
  const isLoom = item.action_type === 'loom';
  return (
    <div className={`flex items-center gap-4 rounded-xl border px-5 py-4 ${
      item.overdue ? 'border-amber-500/30 bg-amber-500/5' : 'border-ink-700 bg-ink-900/40'
    }`}>
      <button onClick={onOpen} className="flex-1 flex items-center gap-4 min-w-0 text-left hover:opacity-80 transition">
        <div className={`h-10 w-10 rounded-full grid place-items-center shrink-0 ${
          isLoom ? 'bg-violet-500/15' : 'bg-sky-500/15'
        }`}>
          <span className="text-lg">{isLoom ? '🎥' : '📞'}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm text-slate-100">{item.client.name}</div>
          <div className="text-sm text-slate-400 mt-0.5">
            {isLoom ? 'Send Loom' : 'Offer call'}
            <span className={`ml-2 ${item.overdue ? 'text-amber-300' : 'text-slate-500'}`}>
              {item.next_action.hint}
            </span>
          </div>
        </div>
        {canSeeFinancials && item.client.mrr ? (
          <span className="text-xs tabular-nums text-slate-500 shrink-0">${fmtMRR(item.client.mrr, { compact: true })}</span>
        ) : null}
      </button>
      <select defaultValue="" onChange={e => { if (e.target.value) { onSnooze(Number(e.target.value)); e.target.value=''; } }}
        className="bg-ink-800 border border-ink-700 rounded-lg text-xs px-2.5 py-2 text-slate-300 shrink-0">
        <option value="" disabled>Snooze</option>
        <option value="1">1d</option><option value="2">2d</option><option value="3">3d</option><option value="7">1w</option>
      </select>
      <button onClick={onAction} className="btn btn-primary rounded-xl px-4 py-2.5 text-sm font-semibold shrink-0">
        {isLoom ? '✓ Loom Sent' : '✓ Call Offered'}
      </button>
    </div>
  );
}

function suffix(n) { return n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'; }
