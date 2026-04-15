import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useToast } from '../lib/toast.jsx';
import { useData } from '../lib/data.jsx';
import ClientDetailDrawer from '../components/ClientDetailDrawer.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import { Skeleton } from '../components/primitives.jsx';

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

  const { greeting, queue, progress, onboarding_heroes, billing, routine, counts } = day;
  const userFirst = (day.user_email || '').split('@')[0].split('.')[0];
  const top = queue[0];
  const rest = queue.slice(1);

  async function doAction(item) {
    // Pre-confirm certain actions
    if (item.next_action.type === 'send_loom') {
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
      return;
    }
    if (item.next_action.type === 'call_offer') {
      await api.action(item.client.id, 'call_offered');
      toastAndReload(`Call offer logged for ${item.client.name}`, item.client.id);
      return;
    }
    if (item.next_action.type === 'flag') {
      // open drawer to work the flag's playbook
      setOpenId(item.client.id);
    }
  }

  function toastAndReload(msg, clientId) {
    load(); refresh(true);
    show({
      message: msg,
      action: { label: 'Undo', onClick: async () => { await api.undoLast(clientId); load(); refresh(true); show({ message: 'Undone.' }); } }
    });
  }

  async function snooze(item, days) {
    const timerType = item.next_action.type === 'call_offer' ? 'call_offer' : 'loom';
    await api.snooze(item.client.id, timerType, days);
    load(); refresh(true);
    show({ message: `Snoozed ${days}d` });
  }

  async function togglePhase(n) {
    await api.togglePhase(n);
    load();
  }

  const allDone = queue.length === 0;
  const allPhases = routine.phase_1_done && routine.phase_2_done && routine.phase_3_done && routine.phase_4_done;

  return (
    <>
      {/* Hero */}
      <section className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-50 capitalize">
          {greeting}, {userFirst}.
        </h1>
        <p className="text-slate-400 mt-1">
          {allDone
            ? (allPhases ? 'You are done for the day. 🌲' : 'Queue clear. Finish your routine checklist below to close the day.')
            : <>You have <strong className="text-slate-100 tabular-nums">{queue.length}</strong> {queue.length === 1 ? 'thing' : 'things'} to do. <span className="text-slate-500">Already handled {progress.done} today.</span></>}
        </p>
        <div className="mt-3 h-1.5 rounded-full bg-ink-800 overflow-hidden w-full max-w-md">
          <div className="h-full bg-emerald-500 transition-all" style={{ width: `${progress.percent}%` }} />
        </div>
        <div className="text-xs text-slate-500 mt-1 tabular-nums">{progress.done}/{progress.total} · {progress.percent}%</div>
      </section>

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

      {/* Onboarding heroes */}
      {onboarding_heroes.length > 0 && (
        <section className="mb-8">
          <div className="text-xs uppercase tracking-[0.16em] text-slate-500 mb-2">New clients · onboarding</div>
          <div className="space-y-2">
            {onboarding_heroes.map(h => (
              <button key={h.client.id} onClick={() => setOpenId(h.client.id)}
                className="w-full flex items-center gap-4 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-5 py-4 hover:bg-emerald-500/10 transition text-left">
                <span className="text-2xl">🌱</span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-slate-100 truncate">{h.client.name}</div>
                  <div className="text-xs text-emerald-300 mt-0.5">{h.completed}/{h.total} onboarding steps · click to continue</div>
                </div>
                <div className="h-1 w-24 rounded-full bg-ink-800 overflow-hidden">
                  <div className="h-full bg-emerald-500" style={{ width: `${(h.completed / h.total) * 100}%` }} />
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Single next action — hero card */}
      {top && (
        <section className="mb-8">
          <div className="text-xs uppercase tracking-[0.16em] text-slate-500 mb-2">Do this now</div>
          <HeroCard item={top} onDo={() => doAction(top)} onSnooze={(d) => snooze(top, d)} onOpen={() => setOpenId(top.client.id)} />
        </section>
      )}

      {/* Rest of queue */}
      {rest.length > 0 && (
        <section className="mb-8">
          <div className="text-xs uppercase tracking-[0.16em] text-slate-500 mb-3 flex items-center justify-between">
            <span>Then, in order</span>
            <span className="text-slate-400 tabular-nums">{rest.length}</span>
          </div>
          <div className="space-y-2">
            {rest.map(item => (
              <QueueRow key={item.id} item={item}
                onDo={() => doAction(item)}
                onSnooze={(d) => snooze(item, d)}
                onOpen={() => setOpenId(item.client.id)} />
            ))}
          </div>
        </section>
      )}

      {allDone && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-8 text-center mb-8">
          <div className="text-4xl mb-2">✓</div>
          <div className="font-semibold text-emerald-100 text-lg">Queue clear.</div>
          <div className="text-sm text-emerald-300/80 mt-1">Nothing needs a loom or call right now. Finish your routine below.</div>
        </div>
      )}

      {/* Daily routine */}
      <section className="border-t border-ink-800 pt-6 mt-4">
        <div className="text-xs uppercase tracking-[0.16em] text-slate-500 mb-3">Daily routine · {allPhases ? 'complete ✓' : `${[1,2,3,4].filter(n => routine[`phase_${n}_done`]).length}/4`}</div>
        <div className="grid md:grid-cols-4 gap-2">
          <PhaseCheck n={1} label="Urgent triage" done={routine.phase_1_done} count={counts.urgent} onToggle={() => togglePhase(1)} />
          <PhaseCheck n={2} label="Client channel sweep" done={routine.phase_2_done} count={counts.today + counts.heads_up} onToggle={() => togglePhase(2)} />
          <PhaseCheck n={3} label="Master Sheet audit" done={routine.phase_3_done} onExternalLabel="Open sheet" onToggle={() => togglePhase(3)} />
          <PhaseCheck n={4} label="Passive monitor" done={routine.phase_4_done} onToggle={() => togglePhase(4)} />
        </div>
        {!allPhases && (
          <div className="text-xs text-slate-500 mt-3">Tick each phase as you complete it. Phase 3 asks you to open the Master Sheet and run the 5 audit checks.</div>
        )}
      </section>

      {openId && <ClientDetailDrawer clientId={openId} onClose={() => { setOpenId(null); load(); }} />}
      {confirming && <ConfirmDialog {...confirming} onClose={() => setConfirming(null)} />}
    </>
  );
}

function HeroCard({ item, onDo, onSnooze, onOpen }) {
  const urgent = item.category === 'urgent';
  return (
    <div className={`rounded-xl border px-6 py-5 ${urgent ? 'border-rose-500/40 bg-rose-500/5' : 'border-emerald-500/30 bg-ink-900/60'}`}>
      <div className="flex items-start gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <CategoryBadge category={item.category} />
            <button onClick={onOpen} className="text-xs text-slate-400 hover:text-slate-200 underline underline-offset-2">
              {item.client.name} {item.client.cohort ? `· ${item.client.cohort.replace(/_/g, ' ')}` : ''}
            </button>
          </div>
          <div className="text-xl font-semibold text-slate-50 tracking-tight">{item.next_action.label}</div>
          {item.next_action.hint && <div className="text-sm text-slate-400 mt-1">{item.next_action.hint}</div>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <select defaultValue="" onChange={e => { if (e.target.value) { onSnooze(Number(e.target.value)); e.target.value=''; } }}
            className="bg-ink-800 border border-ink-700 rounded-md text-xs px-2 py-2 text-slate-300">
            <option value="" disabled>Snooze…</option>
            <option value="1">1 day</option><option value="2">2 days</option><option value="3">3 days</option><option value="7">1 week</option>
          </select>
          <button onClick={onDo} className="btn btn-primary px-5 py-2">
            {primaryLabel(item.next_action.type)} →
          </button>
        </div>
      </div>
    </div>
  );
}

function QueueRow({ item, onDo, onSnooze, onOpen }) {
  return (
    <div className={`flex items-center gap-3 rounded-lg border px-4 py-3 transition hover:bg-ink-900/80 ${
      item.category === 'urgent' ? 'border-rose-500/40 bg-rose-500/5' :
      item.category === 'today' ? 'border-amber-500/30 bg-amber-500/5' :
      'border-ink-700 bg-ink-900/40'
    }`}>
      <button onClick={onOpen} className="flex-1 min-w-0 text-left">
        <div className="font-medium text-slate-100 truncate">{item.next_action.label}</div>
        <div className="text-xs text-slate-400 mt-0.5">{item.next_action.hint}{item.flags > 0 ? ` · ⚑${item.flags}` : ''}</div>
      </button>
      <select defaultValue="" onChange={e => { if (e.target.value) { onSnooze(Number(e.target.value)); e.target.value=''; } }}
        className="bg-ink-800 border border-ink-700 rounded-md text-xs px-2 py-1.5 text-slate-300">
        <option value="" disabled>Snooze</option>
        <option value="1">1d</option><option value="2">2d</option><option value="3">3d</option><option value="7">1w</option>
      </select>
      <button onClick={onDo} className="btn btn-primary btn-sm">{primaryLabel(item.next_action.type)}</button>
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

function CategoryBadge({ category }) {
  const meta = {
    urgent:   { label: 'URGENT',   cls: 'bg-rose-500/20 text-rose-200 border-rose-500/40' },
    today:    { label: 'TODAY',    cls: 'bg-amber-500/20 text-amber-200 border-amber-500/40' },
    heads_up: { label: 'HEADS UP', cls: 'bg-ink-700 text-slate-300 border-ink-600' }
  }[category] || { label: category, cls: 'bg-ink-700 text-slate-300' };
  return <span className={`text-[10px] tracking-widest font-semibold px-2 py-0.5 rounded border ${meta.cls}`}>{meta.label}</span>;
}

function primaryLabel(type) {
  return {
    send_loom: 'Send Loom',
    call_offer: 'Offer Call',
    flag: 'Open Playbook'
  }[type] || 'Do';
}

function suffix(n) { return n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'; }
