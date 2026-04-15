import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useToast } from '../lib/toast.jsx';
import { useData } from '../lib/data.jsx';
import { statusMeta, StatusDot, Skeleton } from './primitives.jsx';
import { fmtDate, fmtRelative, touchpointLabel } from '../lib/format.js';

const SITUATION_TYPES = [
  { key: 'missed_posting',        label: 'Missed posting' },
  { key: 'overdue_batch',         label: 'Overdue batch' },
  { key: 'non_responsive',        label: 'Non-responsive 48h+' },
  { key: 'delayed_onboarding',    label: 'Delayed onboarding' },
  { key: 'dark_contractor',       label: 'Dark contractor' },
  { key: 'retention_opportunity', label: 'Retention opportunity' },
  { key: 'sheet_mismatch',        label: 'Sheet mismatch' },
  { key: 'scripted_only',         label: 'Scripted only' },
  { key: 'out_of_scope',          label: 'Out of scope' },
  { key: 'failed_payment',        label: 'Failed payment' }
];

export default function ClientDetailDrawer({ clientId, onClose }) {
  const [client, setClient] = useState(null);
  const [note, setNote] = useState('');
  const [onboardingDefs, setOnboardingDefs] = useState([]);
  const [closeoutDefs, setCloseoutDefs] = useState([]);
  const [openFlags, setOpenFlags] = useState([]);
  const { refresh } = useData();
  const { show } = useToast();

  const load = useCallback(async () => {
    if (!clientId) return;
    setClient(null);
    const [c, o, co, fl] = await Promise.all([
      api.getClient(clientId),
      api.onboardingSteps().catch(() => []),
      api.closeoutSteps().catch(() => []),
      api.listFlags().catch(() => ({ flags: [] }))
    ]);
    setClient(c); setOnboardingDefs(o); setCloseoutDefs(co);
    setOpenFlags((fl?.flags || []).filter(f => f.client_id === clientId));
  }, [clientId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape' && clientId) onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [clientId, onClose]);

  if (!clientId) return null;

  async function doAction(type, label) {
    await api.action(clientId, type);
    refresh(true); load();
    show({
      message: `${label} logged for ${client?.name || 'client'}.`,
      action: {
        label: 'Undo',
        onClick: async () => { await api.undoLast(clientId); refresh(true); load(); show({ message: 'Undone.' }); }
      }
    });
  }

  async function snooze(timerType, days) {
    await api.snooze(clientId, timerType, days);
    refresh(true); load();
    show({ message: `Snoozed ${days}d.` });
  }

  async function saveNote() {
    if (!note.trim()) return;
    await api.addNote(clientId, note.trim());
    setNote(''); load(); refresh(true);
    show({ message: 'Note saved.' });
  }

  async function setStatus(status) {
    await api.updateClient(clientId, { status });
    load(); refresh(true);
    show({ message: `Status → ${statusMeta(status).label}` });
  }

  async function setCohort(cohort) {
    await api.setCohort(clientId, cohort);
    load(); refresh(true);
    show({ message: `Cohort → ${cohort.replace(/_/g, ' ')}` });
  }

  async function toggleOnboardingStep(step) {
    await api.toggleOnboarding(clientId, step);
    load(); refresh(true);
  }

  async function toggleCloseoutStep(step) {
    await api.toggleCloseout(clientId, step);
    load(); refresh(true);
  }

  async function addFlag(type) {
    await api.createFlag({ client_id: clientId, type });
    load(); refresh(true);
    show({ message: 'Flag raised.' });
  }

  async function resolveFlag(id) {
    await api.resolveFlag(id);
    load(); refresh(true);
    show({ message: 'Flag resolved.' });
  }

  return (
    <div className="fixed inset-0 z-40 flex" onClick={onClose}>
      <div className="flex-1 bg-black/50 backdrop-blur-[2px] animate-fade" />
      <div
        className="w-full max-w-xl bg-ink-900 border-l border-ink-700 h-screen overflow-y-auto animate-slide-left"
        onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-ink-900/95 backdrop-blur border-b border-ink-800 px-6 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-3 min-w-0">
            {client && <StatusDot status={client.status} label={false} />}
            <div className="min-w-0">
              <div className="font-semibold truncate">{client?.name || 'Loading…'}</div>
              <div className="text-xs text-slate-400 truncate">
                {client?.email || client?.company || '—'}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {client && (
              <Link to={`/clients/${client.id}`} onClick={onClose}
                    className="text-xs text-slate-400 hover:text-slate-200 underline underline-offset-2">
                Full page
              </Link>
            )}
            <button onClick={onClose} className="text-slate-400 hover:text-white w-8 h-8 grid place-items-center rounded hover:bg-ink-800">✕</button>
          </div>
        </div>

        {!client ? (
          <div className="p-6"><Skeleton rows={6} /></div>
        ) : (
          <div className="p-6 space-y-6">
            {/* Meta grid */}
            <div className="grid grid-cols-3 gap-4 text-sm">
              <MetaCell label="Status" value={
                <select value={client.status} onChange={e => setStatus(e.target.value)}
                  className="bg-ink-800 border border-ink-700 rounded-md text-sm px-2 py-1 w-full">
                  <option value="green">Healthy</option>
                  <option value="yellow">Watch</option>
                  <option value="red">At Risk</option>
                  <option value="churned">Churned</option>
                </select>
              } />
              <MetaCell label="Package" value={client.package ? `${client.package} reels` : '—'} />
              <MetaCell label="Billing" value={client.billing_date
                ? `${client.billing_date}${suffix(client.billing_date)} (${client.days_until_billing}d)`
                : '—'} />
              <MetaCell label="MRR" value={client.mrr ? `$${client.mrr}` : '—'} />
              <MetaCell label="Source" value={client.content_source || '—'} />
              <MetaCell label="Cohort" value={
                <select value={client.cohort || ''} onChange={e => setCohort(e.target.value)}
                  className="bg-ink-800 border border-ink-700 rounded-md text-sm px-2 py-1 w-full">
                  <option value="" disabled>—</option>
                  <option value="new">New</option>
                  <option value="active_happy">Active (happy)</option>
                  <option value="active_hands_off">Active (hands-off)</option>
                  <option value="cancelling">Cancelling</option>
                  <option value="churned">Churned</option>
                </select>
              } />
            </div>

            {/* Onboarding stepper (shown when cohort=new or steps incomplete) */}
            {client.cohort === 'new' || (onboardingDefs.length && !onboardingDefs.every(s => client.onboarding_steps?.[s.key])) ? (
              <Stepper title="Onboarding"
                defs={onboardingDefs}
                done={client.onboarding_steps || {}}
                onToggle={toggleOnboardingStep} />
            ) : null}

            {/* Closeout stepper (churned only) */}
            {client.status === 'churned' || client.cohort === 'cancelling' ? (
              <Stepper title={client.status === 'churned' ? 'Closeout' : 'Closeout (prepared)'}
                defs={closeoutDefs}
                done={client.closeout_steps || {}}
                onToggle={toggleCloseoutStep} />
            ) : null}

            {/* Situation flags */}
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-500 mb-2 flex items-center justify-between">
                <span>Situation flags {openFlags.length > 0 && <span className="text-amber-400">· {openFlags.length} open</span>}</span>
              </div>
              {openFlags.length > 0 && (
                <div className="space-y-1.5 mb-2">
                  {openFlags.map(f => (
                    <div key={f.id} className="flex items-center justify-between rounded-md border border-amber-500/30 bg-amber-500/5 px-2.5 py-1.5 text-sm">
                      <span>⚑ {SITUATION_TYPES.find(t => t.key === f.type)?.label || f.type}</span>
                      <button className="text-xs text-slate-400 hover:text-slate-100" onClick={() => resolveFlag(f.id)}>Resolve</button>
                    </div>
                  ))}
                </div>
              )}
              <select defaultValue="" onChange={e => { if (e.target.value) { addFlag(e.target.value); e.target.value=''; } }}
                className="bg-ink-800 border border-ink-700 rounded-md text-xs px-2 py-1.5 w-full">
                <option value="" disabled>+ Raise a flag…</option>
                {SITUATION_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
            </div>

            {/* Timers */}
            <div className="grid grid-cols-2 gap-3">
              <TimerBlock timer={client.timers?.loom} label="Loom"
                onAction={() => doAction('loom_sent', 'Loom Sent')}
                onSnooze={(d) => snooze('loom', d)} />
              <TimerBlock timer={client.timers?.call_offer} label="Call Offer"
                onAction={() => doAction('call_offered', 'Call Offered')}
                onSnooze={(d) => snooze('call_offer', d)} />
            </div>

            {/* Actionable context */}
            {(client.action_needed || client.reason || client.save_plan_analysis) && (
              <div className="space-y-2">
                {client.action_needed && <ContextBlock label="Action needed" tone="emerald" value={client.action_needed} />}
                {client.reason && <ContextBlock label="Reason" value={client.reason} />}
                {client.save_plan_analysis && <ContextBlock label="Save plan" value={client.save_plan_analysis} />}
              </div>
            )}

            {/* Note */}
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-500 mb-2">Add a note</div>
              <textarea className="input h-20" placeholder="Jot what happened…"
                value={note} onChange={e => setNote(e.target.value)} />
              <div className="flex justify-end mt-2">
                <button className="btn btn-primary btn-sm" onClick={saveNote} disabled={!note.trim()}>Save note</button>
              </div>
            </div>

            {/* Timeline */}
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-500 mb-3">Timeline</div>
              {(!client.touchpoints || client.touchpoints.length === 0) ? (
                <div className="text-sm text-slate-500">No touchpoints yet.</div>
              ) : (
                <ol className="relative border-l border-ink-700 ml-2 space-y-4">
                  {client.touchpoints.map(tp => (
                    <li key={tp.id} className="pl-4">
                      <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full bg-ink-600 ring-4 ring-ink-900" />
                      <div className="text-xs text-slate-500 tabular-nums">{fmtDate(tp.created_at)}</div>
                      <div className="text-sm font-medium mt-0.5">{touchpointLabel(tp.type)}</div>
                      {tp.content && <div className="text-sm text-slate-300 mt-0.5 whitespace-pre-wrap">{tp.content}</div>}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MetaCell({ label, value }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">{label}</div>
      <div className="text-slate-200">{value}</div>
    </div>
  );
}

function ContextBlock({ label, value, tone }) {
  const color = tone === 'emerald' ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-ink-700 bg-ink-800/50';
  return (
    <div className={`rounded-lg border ${color} p-3`}>
      <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">{label}</div>
      <div className="text-sm text-slate-200 whitespace-pre-wrap">{value}</div>
    </div>
  );
}

function TimerBlock({ timer, label, onAction, onSnooze }) {
  if (!timer) return <div className="rounded-lg border border-ink-700 bg-ink-800/40 p-3 text-sm text-slate-500">{label}: —</div>;
  const overdue = timer.is_overdue;
  return (
    <div className={`rounded-lg border p-3 ${overdue ? 'border-rose-500/40 bg-rose-500/5' : 'border-ink-700 bg-ink-800/40'}`}>
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
        <span className={`pill ${overdue ? 'bg-rose-500/15 text-rose-300' : 'bg-emerald-500/10 text-emerald-300'}`}>
          {overdue ? 'Overdue' : 'On track'}
        </span>
      </div>
      <div className="mt-1 text-sm text-slate-300 tabular-nums">{fmtRelative(timer.next_due_at)}</div>
      <div className="flex items-center gap-2 mt-3">
        <button className="btn btn-primary btn-sm flex-1" onClick={onAction}>{label === 'Loom' ? 'Loom Sent' : 'Call Offered'}</button>
        <select
          className="bg-ink-800 border border-ink-700 rounded-md text-xs px-2 py-1"
          defaultValue=""
          onChange={e => { if (e.target.value) { onSnooze(Number(e.target.value)); e.target.value=''; } }}>
          <option value="" disabled>Snooze…</option>
          <option value="1">1 day</option>
          <option value="2">2 days</option>
          <option value="3">3 days</option>
          <option value="7">1 week</option>
        </select>
      </div>
    </div>
  );
}

function suffix(n) { return n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'; }

function Stepper({ title, defs, done, onToggle }) {
  if (!defs.length) return null;
  const completed = defs.filter(s => done[s.key]).length;
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-slate-500 mb-2 flex items-center justify-between">
        <span>{title}</span>
        <span className="text-slate-400 tabular-nums">{completed}/{defs.length}</span>
      </div>
      <div className="h-1 rounded-full bg-ink-800 overflow-hidden mb-3">
        <div className="h-full bg-emerald-500 transition-all" style={{ width: `${(completed / defs.length) * 100}%` }} />
      </div>
      <ol className="space-y-1">
        {defs.map((s, i) => {
          const isDone = !!done[s.key];
          return (
            <li key={s.key}>
              <button onClick={() => onToggle(s.key)}
                className={`w-full flex items-center gap-3 rounded-md px-2.5 py-1.5 text-sm text-left transition ${
                  isDone ? 'bg-emerald-500/5 text-slate-300' : 'hover:bg-ink-800 text-slate-200'
                }`}>
                <span className={`h-4 w-4 rounded-full border grid place-items-center text-[10px] shrink-0 ${
                  isDone ? 'bg-emerald-500 border-emerald-500 text-ink-950' : 'border-ink-600 text-slate-500'
                }`}>{isDone ? '✓' : i + 1}</span>
                <span className={`flex-1 ${isDone ? 'line-through text-slate-500' : ''}`}>{s.label}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
