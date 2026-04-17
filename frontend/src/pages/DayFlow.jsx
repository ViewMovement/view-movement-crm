import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useToast } from '../lib/toast.jsx';
import { useData } from '../lib/data.jsx';
import ClientDetailDrawer from '../components/ClientDetailDrawer.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import { Skeleton, StatusDot } from '../components/primitives.jsx';
import KpiStrip from '../components/KpiStrip.jsx';
import { fmtRelative, fmtMRR } from '../lib/format.js';
import { useRole } from '../lib/role.jsx';

const URGENCY_BADGE = {
  urgent:   { bg: 'bg-rose-500/15 text-rose-300', label: 'Urgent' },
  heads_up: { bg: 'bg-amber-500/15 text-amber-300', label: 'Heads up' }
};

export default function DayFlow() {
  const [day, setDay] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [confirming, setConfirming] = useState(null);
  const { show } = useToast();
  const { refresh } = useData();
  const nav = useNavigate();

  const load = useCallback(async () => {
    try { setDay(await api.day()); } catch (e) { show({ message: e.message }); }
  }, [show]);

  useEffect(() => { load(); }, [load]);

  if (!day) return <div className="space-y-3"><Skeleton rows={6} className="h-16 w-full" /></div>;

  const { greeting, ops_queue, retention_queue, pulse_pressing, progress, onboarding_heroes, billing, routine, counts } = day;
  const userFirst = (day.user_email || '').split('@')[0].split('.')[0];
  const { canSeeFinancials } = useRole();

  const retentionDue = (retention_queue || []).filter(r => !r.done_today);
  const retentionDone = (retention_queue || []).filter(r => r.done_today);

  async function doOpsAction(item) {
    if (item.next_action.type === 'flag') {
      setOpenId(item.client.id);
    }
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

  const allPhases = routine.phase_1_done && routine.phase_2_done && routine.phase_3_done && routine.phase_4_done;
  const todayItemCount = (ops_queue || []).length + onboarding_heroes.length + (pulse_pressing || []).length;

  return (
    <>
      {/* Hero greeting */}
      <section className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-50 capitalize">
          {greeting}, {userFirst}.
        </h1>
        <p className="text-slate-400 mt-1">
          {todayItemCount === 0 && retentionDue.length === 0
            ? (allPhases ? 'You are done for the day. 🌲' : 'Queues clear. Finish your daily routine to close the day.')
            : <>{todayItemCount > 0 && <><strong className="text-slate-100 tabular-nums">{todayItemCount}</strong> ops items. </>}{retentionDue.length > 0 && <><strong className="text-slate-100 tabular-nums">{retentionDue.length}</strong> retention actions. </>}<span className="text-slate-500">Already handled {progress.done} today.</span></>}
        </p>
      </section>

      {/* ═══════ DAILY ROUTINE — TOP ═══════ */}
      <section className="mb-8 rounded-xl border border-ink-700 bg-ink-900/50 p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Daily routine</div>
          <span className="text-xs text-slate-400 tabular-nums">{allPhases ? 'Complete ✓' : `${[1,2,3,4].filter(n => routine[`phase_${n}_done`]).length}/4`}</span>
        </div>
        <div className="grid md:grid-cols-4 gap-2">
          <PhaseCheck n={1} label="Urgent triage" done={routine.phase_1_done} count={counts.urgent} onToggle={() => togglePhase(1)} />
          <PhaseCheck n={2} label="Onboarding + Pulse" done={routine.phase_2_done} count={onboarding_heroes.length + (pulse_pressing || []).length} onToggle={() => togglePhase(2)} />
          <PhaseCheck n={3} label="Retention actions" done={routine.phase_3_done} count={counts.retention_due} onToggle={() => togglePhase(3)} />
          <PhaseCheck n={4} label="Passive monitor" done={routine.phase_4_done} onToggle={() => togglePhase(4)} />
        </div>
        {!allPhases && (
          <div className="text-xs text-slate-500 mt-3">Tick each phase as you complete it.</div>
        )}
      </section>

      {/* KPI strip */}
      <KpiStrip />

      {/* Billing pulse banner */}
      {billing.is_check_day && (
        <button onClick={() => nav('/billing')}
          className="mb-6 w-full rounded-lg border border-amber-500/40 bg-amber-500/5 px-4 py-3 text-left hover:bg-amber-500/10 transition flex items-center gap-3">
          <span className="text-amber-300">◐</span>
          <div className="flex-1">
            <div className="font-medium text-amber-200">Today is the {billing.relevant_day}{suffix(billing.relevant_day)} — run billing verification.</div>
            <div className="text-xs text-amber-300/70">Click to open the billing checklist.</div>
          </div>
          <span className="text-sm text-amber-200">→</span>
        </button>
      )}

      {/* ═══════ TODAY — OPS MANAGER ═══════ */}
      <section className="mb-10">
        <div className="flex items-baseline gap-3 mb-4">
          <h2 className="text-lg font-semibold text-slate-100 tracking-tight">Today</h2>
          <span className="text-xs text-slate-500">Onboarding · urgent flags · pressing Slack signals</span>
        </div>

        {todayItemCount === 0 ? (
          <div className="rounded-lg border border-ink-700 bg-ink-900/40 p-6 text-center">
            <div className="text-2xl mb-1">✓</div>
            <div className="text-sm text-slate-400">Ops queue clear. Nothing needs immediate attention.</div>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Urgent flags */}
            {(ops_queue || []).length > 0 && (
              <div>
                <div className="text-[11px] uppercase tracking-wider text-rose-400/70 mb-2">Urgent flags ({ops_queue.length})</div>
                <div className="space-y-2">
                  {ops_queue.map(item => (
                    <button key={item.id} onClick={() => doOpsAction(item)}
                      className="w-full flex items-center gap-3 rounded-lg border border-rose-500/40 bg-rose-500/5 px-4 py-3 hover:bg-rose-500/10 transition text-left">
                      <StatusDot status={item.client.status} label={false} />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-slate-100 truncate">{item.next_action.label}</div>
                        <div className="text-xs text-rose-300/70 mt-0.5">{item.next_action.hint}{item.flags > 1 ? ` · ⚑${item.flags}` : ''}</div>
                      </div>
                      {canSeeFinancials && item.client.mrr ? <span className="text-xs tabular-nums text-rose-300/60 shrink-0">${fmtMRR(item.client.mrr, { compact: true })}</span> : null}
                      <span className="text-xs text-slate-400">→</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Pressing Slack Pulse */}
            {(pulse_pressing || []).length > 0 && (
              <div>
                <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-2">Slack Pulse — pressing ({pulse_pressing.length})</div>
                <div className="space-y-1.5">
                  {pulse_pressing.map(item => {
                    const badge = URGENCY_BADGE[item.urgency] || URGENCY_BADGE.heads_up;
                    return (
                      <div key={item.id}
                        className="flex items-start gap-3 rounded-lg border border-ink-700 bg-ink-900/60 px-4 py-3">
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

            {/* Onboarding heroes */}
            {onboarding_heroes.length > 0 && (
              <div>
                <div className="text-[11px] uppercase tracking-wider text-emerald-400/70 mb-2">Onboarding ({onboarding_heroes.length})</div>
                <div className="space-y-2">
                  {onboarding_heroes.map(h => (
                    <button key={h.client.id} onClick={() => setOpenId(h.client.id)}
                      className={`w-full flex items-center gap-4 rounded-lg border px-4 py-3 hover:bg-emerald-500/10 transition text-left ${
                        h.next_step?.blocked ? 'border-amber-500/30 bg-amber-500/5' : 'border-emerald-500/30 bg-emerald-500/5'
                      }`}>
                      <span className="text-lg">{h.next_step?.blocked ? '⚠' : '🌱'}</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-slate-100 truncate">{h.client.name}</div>
                        <div className="text-xs mt-0.5">
                          <span className="text-emerald-300">{h.completed}/{h.total}</span>
                          {h.next_step && (
                            <span className={h.next_step.blocked ? 'text-amber-400 ml-2' : 'text-slate-500 ml-2'}>
                              Next: {h.next_step.label}{h.next_step.blocked ? ' (blocked)' : ''}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="h-1 w-20 rounded-full bg-ink-800 overflow-hidden shrink-0">
                        <div className="h-full bg-emerald-500" style={{ width: `${(h.completed / h.total) * 100}%` }} />
                      </div>
                      <span className="text-xs text-slate-400">→</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ═══════ RETENTION — LOOM/CALL TO-DOS ═══════ */}
      <section className="mb-10">
        <div className="flex items-baseline gap-3 mb-4">
          <h2 className="text-lg font-semibold text-slate-100 tracking-tight">Retention</h2>
          <span className="text-xs text-slate-500">Loom videos · call offers · keep clients engaged</span>
        </div>

        {(retention_queue || []).length === 0 ? (
          <div className="rounded-lg border border-ink-700 bg-ink-900/40 p-6 text-center">
            <div className="text-2xl mb-1">○</div>
            <div className="text-sm text-slate-400">All retention actions are on track. No Looms or calls due.</div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Retention progress bar */}
            <div className="rounded-lg border border-ink-700 bg-ink-900/40 p-4">
              <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
                <span>Today's retention progress</span>
                <span className="tabular-nums">{retentionDone.length}/{retention_queue.length} done</span>
              </div>
              <div className="h-1.5 rounded-full bg-ink-800 overflow-hidden">
                <div className="h-full bg-emerald-500 transition-all duration-500"
                  style={{ width: `${retention_queue.length ? (retentionDone.length / retention_queue.length * 100) : 0}%` }} />
              </div>
            </div>

            {/* Due items */}
            {retentionDue.length > 0 && (
              <div className="space-y-2">
                {retentionDue.map(item => (
                  <RetentionRow key={item.id} item={item}
                    onOpen={() => setOpenId(item.client.id)}
                    onAction={() => doRetentionAction(item)}
                    onSnooze={(d) => snooze(item.client.id, item.action_type === 'loom' ? 'loom' : 'call_offer', d)} />
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
                  {retentionDone.map(item => (
                    <div key={item.id}
                      className="flex items-center gap-3 rounded-md px-4 py-2 text-sm text-slate-500 line-through">
                      <span>✓</span>
                      <span>{item.action_type === 'loom' ? 'Loom' : 'Call'} — {item.client.name}</span>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}
      </section>

      {openId && <ClientDetailDrawer clientId={openId} onClose={() => { setOpenId(null); load(); }} />}
      {confirming && <ConfirmDialog {...confirming} onClose={() => setConfirming(null)} />}
    </>
  );
}

function RetentionRow({ item, onOpen, onAction, onSnooze }) {
  const { canSeeFinancials } = useRole();
  const isLoom = item.action_type === 'loom';
  const borderColor = item.overdue ? 'border-amber-500/30 bg-amber-500/5' : 'border-ink-700 bg-ink-900/40';
  return (
    <div className={`flex items-center gap-3 rounded-lg border ${borderColor} px-4 py-3`}>
      <button onClick={onOpen} className="flex-1 flex items-center gap-3 min-w-0 text-left hover:opacity-80 transition">
        <StatusDot status={item.client.status} label={false} />
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm truncate">{item.client.name}</div>
          <div className="text-xs text-slate-400 mt-0.5">
            {isLoom ? '🎥 Send Loom' : '📞 Offer call'}
            <span className={`ml-2 ${item.overdue ? 'text-amber-300' : 'text-slate-500'}`}>{item.next_action.hint}</span>
          </div>
        </div>
        {canSeeFinancials && item.client.mrr ? <span className="text-[10px] tabular-nums text-slate-500 shrink-0">${fmtMRR(item.client.mrr, { compact: true })}</span> : null}
      </button>
      <select defaultValue="" onChange={e => { if (e.target.value) { onSnooze(Number(e.target.value)); e.target.value=''; } }}
        className="bg-ink-800 border border-ink-700 rounded-md text-xs px-2 py-1.5 text-slate-300 shrink-0">
        <option value="" disabled>Snooze</option>
        <option value="1">1d</option><option value="2">2d</option><option value="3">3d</option><option value="7">1w</option>
      </select>
      <button onClick={onAction} className="btn btn-primary btn-sm shrink-0 text-xs px-3">
        {isLoom ? 'Loom Sent' : 'Call Offered'}
      </button>
    </div>
  );
}

function PhaseCheck({ n, label, done, count, onToggle }) {
  return (
    <button onClick={onToggle}
      className={`flex items-center gap-3 rounded-lg border px-3 py-3 text-left transition ${
        done ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-ink-700 bg-ink-900/40 hover:bg-ink-800'
      }`}>
      <span className={`h-5 w-5 rounded-full border-2 grid place-items-center text-[10px] shrink-0 ${
        done ? 'bg-emerald-500 border-emerald-500 text-ink-950' : 'border-ink-600 text-slate-500'
      }`}>{done ? '✓' : n}</span>
      <div className="flex-1 min-w-0">
        <div className={`text-sm font-medium ${done ? 'text-slate-400 line-through' : 'text-slate-100'}`}>Phase {n}</div>
        <div className="text-xs text-slate-500 truncate">{label}{count != null ? ` · ${count}` : ''}</div>
      </div>
    </button>
  );
}

function suffix(n) { return n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'; }
