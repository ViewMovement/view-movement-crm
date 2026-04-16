import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useToast } from '../lib/toast.jsx';
import { useData } from '../lib/data.jsx';
import { statusMeta, StatusDot, Skeleton } from './primitives.jsx';
import { fmtDate, fmtRelative, touchpointLabel, fmtMRR } from '../lib/format.js';
import HealthRing from './HealthRing.jsx';
import Sparkline from './Sparkline.jsx';
import { useRole } from '../lib/role.jsx';

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
  const [health, setHealth] = useState(null);
  const { refresh } = useData();
  const { show } = useToast();
  const { canSeeFinancials } = useRole();

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
    api.clientHealth(clientId).then(setHealth).catch(() => setHealth(null));
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

  async function saveField(field, value) {
    const payload = { [field]: value === undefined ? null : value };
    // For success_definition, also stamp the captured_at timestamp on first save
    if (field === 'success_definition' && value && !client?.success_definition) {
      payload.success_definition_captured_at = new Date().toISOString();
    }
    if (field === 'success_definition' && value) {
      payload.success_definition_last_reviewed_at = new Date().toISOString();
    }
    await api.updateClient(clientId, payload);
    load(); refresh(true);
    const labels = { mrr: 'MRR', billing_date: 'Billing date', package: 'Package', success_definition: 'Success definition', baseline_metrics: 'Baseline metrics', service_start_date: 'Service start date' };
    show({ message: `${labels[field] || field} updated.` });
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
              {canSeeFinancials && (
                <MetaCell label="Billing" value={
                  <EditableNumber
                    value={client.billing_date}
                    display={client.billing_date
                      ? `${client.billing_date}${suffix(client.billing_date)} (${client.days_until_billing}d)`
                      : '—'}
                    placeholder="Day (1-31)"
                    min={1} max={31}
                    onSave={v => saveField('billing_date', v ? Number(v) : null)} />
                } />
              )}
              {canSeeFinancials && (
                <MetaCell label="MRR" value={
                  <EditableMRR
                    value={client.mrr}
                    onSave={v => saveField('mrr', v ? Number(v) : null)} />
                } />
              )}
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

            {/* Success Definition — pinned at top per SOP */}
            <SuccessDefinitionBlock
              client={client}
              onSaveDefinition={v => saveField('success_definition', v)}
              onSaveBaseline={v => saveField('baseline_metrics', v)}
              onSaveServiceStart={v => saveField('service_start_date', v)}
            />

            {/* Health snapshot */}
            {health && (
              <div className="rounded-lg border border-ink-800 bg-ink-950/40 p-4 flex items-center gap-4">
                <HealthRing score={health.score} size={64} />
                <div className="flex-1 min-w-0">
                  <div className="text-xs uppercase tracking-wider text-slate-500">Health · {health.band.replace('_', ' ')}</div>
                  <div className="text-sm text-slate-300 mt-1">30-day activity</div>
                </div>
                <div className="w-40 h-10">
                  <Sparkline data={(health.sparkline || []).map(s => s.count)} height={40} />
                </div>
              </div>
            )}

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

function EditableMRR({ value, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  function open() { setDraft(value || ''); setEditing(true); }
  function cancel() { setEditing(false); }
  function commit() {
    const num = draft === '' ? null : Number(String(draft).replace(/[^0-9.]/g, ''));
    if (num !== null && isNaN(num)) { cancel(); return; }
    if (num !== (Number(value) || null)) onSave(num);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <span className="text-slate-400">$</span>
        <input
          type="number" autoFocus min={0} step={100}
          className="bg-ink-800 border border-emerald-500/50 rounded px-2 py-0.5 text-sm w-24 outline-none focus:ring-1 focus:ring-emerald-500/40"
          value={draft} onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') cancel(); }}
        />
      </div>
    );
  }

  return (
    <button onClick={open} className="group flex items-center gap-1 hover:text-emerald-300 transition text-left" title="Click to edit MRR">
      <span>{value ? `$${fmtMRR(value)}` : '—'}</span>
      <span className="text-slate-600 group-hover:text-emerald-400 text-[10px] transition">✎</span>
    </button>
  );
}

function EditableNumber({ value, display, placeholder, min, max, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  function open() { setDraft(value ?? ''); setEditing(true); }
  function cancel() { setEditing(false); }
  function commit() {
    const num = draft === '' ? null : Number(draft);
    if (num !== null && (isNaN(num) || (min != null && num < min) || (max != null && num > max))) { cancel(); return; }
    if (num !== (Number(value) || null)) onSave(num);
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        type="number" autoFocus min={min} max={max}
        className="bg-ink-800 border border-emerald-500/50 rounded px-2 py-0.5 text-sm w-20 outline-none focus:ring-1 focus:ring-emerald-500/40"
        placeholder={placeholder}
        value={draft} onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') cancel(); }}
      />
    );
  }

  return (
    <button onClick={open} className="group flex items-center gap-1 hover:text-emerald-300 transition text-left" title="Click to edit">
      <span>{display}</span>
      <span className="text-slate-600 group-hover:text-emerald-400 text-[10px] transition">✎</span>
    </button>
  );
}

function SuccessDefinitionBlock({ client, onSaveDefinition, onSaveBaseline, onSaveServiceStart }) {
  const [editingDef, setEditingDef] = useState(false);
  const [defDraft, setDefDraft] = useState('');
  const [editingBaseline, setEditingBaseline] = useState(false);
  const [baselineDraft, setBaselineDraft] = useState('');

  // Calculate days since creation
  const daysSinceCreation = client.created_at
    ? Math.floor((Date.now() - new Date(client.created_at).getTime()) / 86400000)
    : 0;
  const pastDay14 = daysSinceCreation > 14;
  const isEmpty = !client.success_definition;
  const isWarning = isEmpty && pastDay14 && client.status !== 'churned';

  function openDefEdit() {
    setDefDraft(client.success_definition || '');
    setEditingDef(true);
  }
  function commitDef() {
    const trimmed = defDraft.trim();
    if (trimmed !== (client.success_definition || '')) onSaveDefinition(trimmed || null);
    setEditingDef(false);
  }

  function openBaselineEdit() {
    const current = client.baseline_metrics;
    setBaselineDraft(typeof current === 'object' && current ? JSON.stringify(current, null, 2) : (current || ''));
    setEditingBaseline(true);
  }
  function commitBaseline() {
    const trimmed = baselineDraft.trim();
    if (!trimmed) { onSaveBaseline(null); setEditingBaseline(false); return; }
    try {
      const parsed = JSON.parse(trimmed);
      onSaveBaseline(parsed);
    } catch {
      // If not valid JSON, store as plain string wrapped in object
      onSaveBaseline({ notes: trimmed });
    }
    setEditingBaseline(false);
  }

  const borderColor = isWarning
    ? 'border-amber-500/40 bg-amber-500/5'
    : client.success_definition
      ? 'border-emerald-500/20 bg-emerald-500/5'
      : 'border-ink-700 bg-ink-800/40';

  return (
    <div className={`rounded-lg border ${borderColor} p-4 space-y-3`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isWarning && <span className="text-amber-400 text-sm">⚠</span>}
          <span className="text-xs uppercase tracking-wide text-slate-500 font-medium">Success Definition</span>
        </div>
        {client.success_definition_captured_at && (
          <span className="text-[10px] text-slate-600 tabular-nums">
            Captured {fmtDate(client.success_definition_captured_at)}
          </span>
        )}
      </div>

      {isWarning && (
        <div className="text-xs text-amber-300/80 -mt-1">
          Day {daysSinceCreation} — success definition should be captured by day 14
        </div>
      )}

      {/* Definition field */}
      {editingDef ? (
        <div>
          <textarea
            autoFocus
            className="input h-24 text-sm"
            placeholder="What does success look like for this client? (e.g. 'Post 3x/week on IG and grow to 10K followers in 6 months')"
            value={defDraft}
            onChange={e => setDefDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') setEditingDef(false); }}
          />
          <div className="flex justify-end gap-2 mt-2">
            <button className="btn btn-sm text-xs text-slate-400 hover:text-slate-200" onClick={() => setEditingDef(false)}>Cancel</button>
            <button className="btn btn-primary btn-sm" onClick={commitDef}>Save</button>
          </div>
        </div>
      ) : (
        <button onClick={openDefEdit} className="group w-full text-left">
          {client.success_definition ? (
            <div className="text-sm text-slate-200 whitespace-pre-wrap">
              {client.success_definition}
              <span className="text-slate-600 group-hover:text-emerald-400 text-[10px] ml-1 transition">✎</span>
            </div>
          ) : (
            <div className="text-sm text-slate-500 italic group-hover:text-slate-300 transition">
              + Click to define what success looks like for this client…
            </div>
          )}
        </button>
      )}

      {/* Baseline metrics */}
      <div className="border-t border-ink-800/60 pt-2">
        <div className="text-[10px] uppercase tracking-wide text-slate-600 mb-1">Baseline Metrics</div>
        {editingBaseline ? (
          <div>
            <textarea
              autoFocus
              className="input h-20 text-xs font-mono"
              placeholder='e.g. {"followers": 2500, "avg_views": 800, "posting_freq": "1x/week"}'
              value={baselineDraft}
              onChange={e => setBaselineDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Escape') setEditingBaseline(false); }}
            />
            <div className="flex justify-end gap-2 mt-1">
              <button className="btn btn-sm text-xs text-slate-400 hover:text-slate-200" onClick={() => setEditingBaseline(false)}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={commitBaseline}>Save</button>
            </div>
          </div>
        ) : (
          <button onClick={openBaselineEdit} className="group w-full text-left">
            {client.baseline_metrics ? (
              <div className="text-xs text-slate-400 font-mono whitespace-pre-wrap">
                {typeof client.baseline_metrics === 'object'
                  ? Object.entries(client.baseline_metrics).map(([k, v]) => `${k}: ${v}`).join(' · ')
                  : String(client.baseline_metrics)}
                <span className="text-slate-600 group-hover:text-emerald-400 text-[10px] ml-1 transition">✎</span>
              </div>
            ) : (
              <div className="text-xs text-slate-600 italic group-hover:text-slate-400 transition">
                + Add baseline metrics…
              </div>
            )}
          </button>
        )}
      </div>

      {/* Service start date */}
      {(client.service_start_date || client.success_definition) && (
        <div className="border-t border-ink-800/60 pt-2 flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wide text-slate-600">Service start</span>
          <input
            type="date"
            value={client.service_start_date || ''}
            onChange={e => onSaveServiceStart(e.target.value || null)}
            className="bg-ink-800 border border-ink-700 rounded-md text-xs px-2 py-1 text-slate-300"
          />
        </div>
      )}
    </div>
  );
}

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
