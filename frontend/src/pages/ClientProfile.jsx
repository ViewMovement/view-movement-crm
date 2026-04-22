import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { fmtDate, fmtRelative, fmtDateTime } from '../lib/format.js';
import StatusBadge from '../components/StatusBadge.jsx';
import LifecycleChecklist from '../components/LifecycleChecklist.jsx';

const RISK_OPTIONS = ['0-30 days', '31-60 days', '61-90 days', '90+ days', 'Unknown'];
const PACKAGE_OPTIONS = ['', '12 reels', '30 reels (posting)', '30 reels (no posting)', '60 reels (posting)', '60 reels (no posting)'];
const STRIPE_OPTIONS = ['', 'active', 'past_due', 'canceled', 'trialing', 'unpaid', 'incomplete'];

export default function ClientProfile() {
  const { id } = useParams();
  const [client, setClient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [loomModal, setLoomModal] = useState(false);
  const [loomUrl, setLoomUrl] = useState('');
  const [loomSaving, setLoomSaving] = useState(false);

  const load = useCallback(() => {
    api.getClient(id).then(setClient).catch(console.error).finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function changeStatus(newStatus) {
    await api.updateClient(id, { status: newStatus });
    load();
  }

  async function updateField(field, value) {
    await api.updateClient(id, { [field]: value });
    load();
  }

  async function doAction(action, content) {
    setSaving(true);
    await api.postAction(id, action, content);
    load();
    setSaving(false);
  }

  async function handleLoomSubmit() {
    if (!loomUrl.trim()) return;
    setLoomSaving(true);
    await api.postAction(id, 'loom_sent', loomUrl.trim());
    setLoomUrl('');
    setLoomModal(false);
    setLoomSaving(false);
    load();
  }

  async function addNote() {
    if (!note.trim()) return;
    setSaving(true);
    await api.postNote(id, note);
    setNote('');
    load();
    setSaving(false);
  }

  async function doResetTimer(timerType) {
    await api.resetTimer(id, timerType);
    load();
  }

  if (loading) return <p className="text-slate-400">Loading...</p>;
  if (!client) return <p className="text-red-400">Client not found</p>;

  const timers = client.timers || {};
  const touchpoints = client.touchpoints || [];
  const loomEntries = touchpoints.filter(tp => tp.type === 'loom_sent' && tp.content && tp.content.startsWith('http'));

  return (
    <div className="max-w-3xl mx-auto">
      {/* Back link */}
      <Link to="/pipeline" className="text-sm text-slate-400 hover:text-white mb-4 inline-block">&#8592; Pipeline</Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-white">{client.name}</h2>
          {client.company && <p className="text-sm text-slate-400">{client.company}</p>}
          {client.email && <p className="text-xs text-slate-500">{client.email}</p>}
        </div>
        <StatusBadge status={client.status} onChangeStatus={changeStatus} />
      </div>

      {/* Fields grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
        {/* Package — editable dropdown */}
        <div className="bg-ink-900 border border-ink-700 rounded-lg p-3">
          <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Package</p>
          <select
            value={client.package || ''}
            onChange={e => updateField('package', e.target.value || null)}
            className="bg-ink-800 border border-ink-700 rounded px-2 py-1 text-sm text-white w-full"
          >
            <option value="">Not set</option>
            {PACKAGE_OPTIONS.filter(Boolean).map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        {/* Billing Date — dropdown */}
        <div className="bg-ink-900 border border-ink-700 rounded-lg p-3">
          <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Billing Date</p>
          <select
            value={client.billing_date || ''}
            onChange={e => updateField('billing_date', e.target.value ? parseInt(e.target.value) : null)}
            className="bg-ink-800 border border-ink-700 rounded px-2 py-1 text-sm text-white w-full"
          >
            <option value="">Not set</option>
            <option value="1">1st</option>
            <option value="14">14th</option>
          </select>
        </div>

        {/* Content Source — editable text */}
        <EditableFieldCard
          label="Content Source"
          value={client.content_source || ''}
          placeholder="e.g. YouTube, TikTok..."
          onSave={val => updateField('content_source', val || null)}
        />

        {/* MRR — editable number */}
        <EditableFieldCard
          label="MRR"
          value={client.mrr || ''}
          placeholder="e.g. 2500"
          type="number"
          prefix="$"
          onSave={val => updateField('mrr', val ? parseFloat(val) : null)}
        />

        {/* Stripe Status — editable dropdown */}
        <div className="bg-ink-900 border border-ink-700 rounded-lg p-3">
          <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Stripe Status</p>
          <select
            value={client.stripe_status || ''}
            onChange={e => updateField('stripe_status', e.target.value || null)}
            className="bg-ink-800 border border-ink-700 rounded px-2 py-1 text-sm text-white w-full"
          >
            <option value="">Not set</option>
            {STRIPE_OPTIONS.filter(Boolean).map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {/* Risk Horizon — dropdown */}
        <div className="bg-ink-900 border border-ink-700 rounded-lg p-3">
          <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Risk Horizon</p>
          <select
            value={client.risk_horizon || ''}
            onChange={e => updateField('risk_horizon', e.target.value || null)}
            className="bg-ink-800 border border-ink-700 rounded px-2 py-1 text-sm text-white w-full"
          >
            <option value="">Unknown</option>
            {RISK_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>

        <FieldCard label="Date Added" value={fmtDate(client.created_at)} />
        <FieldCard label="Onboarding Call" value={client.onboarding_call_completed ? 'Completed ' + fmtDate(client.onboarding_call_date) : 'Not yet'} />
      </div>

      {/* Info cards (conditional) */}
      {(client.reason || client.save_plan_analysis || client.action_needed) && (
        <div className="space-y-2 mb-6">
          {client.reason && <InfoCard label="Reason" text={client.reason} />}
          {client.save_plan_analysis && <InfoCard label="Save Plan / Analysis" text={client.save_plan_analysis} />}
          {client.action_needed && <InfoCard label="Action Needed" text={client.action_needed} />}
        </div>
      )}

      {/* Lifecycle checklist */}
      <div className="bg-ink-900 border border-ink-700 rounded-xl p-4 mb-6">
        <LifecycleChecklist
          clientId={client.id}
          lifecycleSteps={client.lifecycle_steps}
          onUpdate={updated => setClient(prev => ({ ...prev, lifecycle_steps: updated.lifecycle_steps }))}
        />
      </div>

      {/* Timers */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
        <TimerCard
          label="Loom Timer"
          timer={timers.loom}
          actionLabel="Loom Sent"
          onAction={() => setLoomModal(true)}
          onReset={() => doResetTimer('loom')}
          disabled={saving}
        />
        <TimerCard
          label="Call Offer Timer"
          timer={timers.call_offer}
          actionLabel="Call Offered"
          onAction={() => doAction('call_offered')}
          onReset={() => doResetTimer('call_offer')}
          disabled={saving}
        />
      </div>

      {/* Expectations Loom timer (if active) */}
      {timers.expectations_loom && (
        <div className="mb-6">
          <TimerCard
            label="Expectations Loom (72h deadline)"
            timer={timers.expectations_loom}
            actionLabel="Expectations Loom Sent"
            onAction={() => doAction('expectations_loom_sent')}
            disabled={saving}
          />
        </div>
      )}

      {/* Loom URL Modal */}
      {loomModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setLoomModal(false)}>
          <div className="bg-ink-900 border border-ink-700 rounded-xl p-5 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-white mb-3">Log Loom Video</h3>
            <p className="text-xs text-slate-400 mb-3">Paste the Loom link below to log this touchpoint.</p>
            <input
              type="url"
              value={loomUrl}
              onChange={e => setLoomUrl(e.target.value)}
              placeholder="https://www.loom.com/share/..."
              autoFocus
              className="w-full bg-ink-800 border border-ink-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 mb-3"
              onKeyDown={e => { if (e.key === 'Enter' && loomUrl.trim()) handleLoomSubmit(); }}
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setLoomModal(false); setLoomUrl(''); }}
                className="px-3 py-1.5 bg-ink-800 hover:bg-ink-700 border border-ink-700 text-slate-300 text-sm rounded-lg"
              >Cancel</button>
              <button
                onClick={handleLoomSubmit}
                disabled={loomSaving || !loomUrl.trim()}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm rounded-lg"
              >{loomSaving ? 'Saving...' : 'Log Loom'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Notes + actions */}
      <div className="bg-ink-900 border border-ink-700 rounded-xl p-4 mb-6">
        <h3 className="text-sm font-semibold text-white mb-3">Add a Note</h3>
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Write a note..."
          className="w-full bg-ink-800 border border-ink-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 resize-none h-20 focus:outline-none focus:border-blue-500 mb-2"
        />
        <div className="flex gap-2">
          <button
            onClick={addNote}
            disabled={saving || !note.trim()}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm rounded-lg"
          >Save Note</button>
          {!client.onboarding_call_completed && (
            <button
              onClick={() => doAction('call_completed')}
              disabled={saving}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm rounded-lg"
            >Log Call Completed</button>
          )}
        </div>
      </div>

      {/* Loom History */}
      {loomEntries.length > 0 && (
        <div className="bg-ink-900 border border-ink-700 rounded-xl p-4 mb-6">
          <h3 className="text-sm font-semibold text-white mb-3">Loom Videos</h3>
          <div className="space-y-2">
            {loomEntries.map(tp => (
              <div key={tp.id} className="flex items-center gap-3 text-sm">
                <span className="text-xs text-slate-500 shrink-0 w-24">{fmtDateTime(tp.created_at)}</span>
                <a
                  href={tp.content}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 text-xs truncate"
                >{tp.content}</a>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Touchpoint history */}
      <div className="bg-ink-900 border border-ink-700 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-white mb-3">Activity History</h3>
        {touchpoints.length === 0 && <p className="text-xs text-slate-500">No activity yet</p>}
        <div className="space-y-2">
          {touchpoints.map(tp => (
            <div key={tp.id} className="flex items-start gap-3 text-sm">
              <span className="text-xs text-slate-500 shrink-0 w-24">{fmtDateTime(tp.created_at)}</span>
              <span className="text-xs font-medium text-slate-400 shrink-0 w-28">{formatType(tp.type)}</span>
              <span className="text-slate-300 text-xs">
                {tp.type === 'loom_sent' && tp.content && tp.content.startsWith('http')
                  ? <a href={tp.content} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">{tp.content}</a>
                  : tp.content}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function FieldCard({ label, value }) {
  return (
    <div className="bg-ink-900 border border-ink-700 rounded-lg p-3">
      <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-sm text-white">{value}</p>
    </div>
  );
}

function EditableFieldCard({ label, value, placeholder, type = 'text', prefix, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  function handleSave() {
    setEditing(false);
    if (draft !== value) onSave(draft);
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') { setDraft(value); setEditing(false); }
  }

  if (editing) {
    return (
      <div className="bg-ink-900 border border-ink-700 rounded-lg p-3">
        <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">{label}</p>
        <input
          type={type}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoFocus
          className="bg-ink-800 border border-ink-700 rounded px-2 py-1 text-sm text-white w-full focus:outline-none focus:border-blue-500"
        />
      </div>
    );
  }

  const display = value
    ? (prefix ? prefix + Number(value).toLocaleString() : value)
    : '\u2014';

  return (
    <div
      className="bg-ink-900 border border-ink-700 rounded-lg p-3 cursor-pointer hover:border-ink-600 group"
      onClick={() => { setDraft(value); setEditing(true); }}
    >
      <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1 flex items-center justify-between">
        {label}
        <span className="text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity text-[9px]">edit</span>
      </p>
      <p className="text-sm text-white">{display}</p>
    </div>
  );
}

function InfoCard({ label, text }) {
  return (
    <div className="bg-ink-900 border border-ink-700 rounded-lg p-3">
      <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-sm text-slate-300">{text}</p>
    </div>
  );
}

function TimerCard({ label, timer, actionLabel, onAction, onReset, disabled }) {
  if (!timer) {
    return (
      <div className="bg-ink-900 border border-ink-700 rounded-lg p-4">
        <p className="text-sm font-medium text-white mb-1">{label}</p>
        <p className="text-xs text-slate-500">No timer set</p>
      </div>
    );
  }

  const overdue = timer.is_overdue;
  const rel = fmtRelative(timer.next_due_at);

  return (
    <div className={'bg-ink-900 border rounded-lg p-4 ' + (overdue ? 'border-red-500/50' : 'border-ink-700')}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-medium text-white">{label}</p>
        <span className={'text-xs px-2 py-0.5 rounded-full font-medium ' + (overdue ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400')}>
          {overdue ? 'Overdue' : 'On track'}
        </span>
      </div>
      <p className="text-xs text-slate-400 mb-1">Due: {fmtDate(timer.next_due_at)}</p>
      <p className={'text-sm font-medium mb-3 ' + (overdue ? 'text-red-400' : 'text-slate-300')}>{rel}</p>
      <div className="flex gap-2">
        <button
          onClick={onAction}
          disabled={disabled}
          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs rounded-lg"
        >{actionLabel}</button>
        {onReset && (
          <button
            onClick={onReset}
            disabled={disabled}
            className="px-3 py-1.5 bg-ink-800 hover:bg-ink-700 border border-ink-700 text-slate-300 text-xs rounded-lg"
          >Reset</button>
        )}
      </div>
    </div>
  );
}

function formatType(type) {
  const map = {
    loom_sent: 'Loom Sent',
    call_offered: 'Call Offered',
    call_completed: 'Call Done',
    expectations_loom_sent: 'Exp. Loom',
    note: 'Note',
    status_change: 'Status',
    system: 'System',
  };
  return map[type] || type;
}
