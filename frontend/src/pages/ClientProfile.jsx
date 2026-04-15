import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import StatusBadge from '../components/StatusBadge.jsx';
import { fmtDate, fmtRelative, touchpointLabel } from '../lib/format.js';

export default function ClientProfile() {
  const { id } = useParams();
  const [client, setClient] = useState(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => setClient(await api.getClient(id)), [id]);
  useEffect(() => { load(); }, [load]);
  if (!client) return <div className="text-slate-400">Loading…</div>;

  const loom = client.timers?.loom;
  const call = client.timers?.call_offer;

  async function patch(fields) { await api.updateClient(id, fields); load(); }
  async function doAction(type) { await api.action(id, type); load(); }
  async function saveNote() {
    if (!note.trim()) return;
    setSaving(true);
    await api.addNote(id, note.trim());
    setNote(''); setSaving(false); load();
  }
  async function resetTimer(t) { await api.resetTimer(id, t); load(); }

  return (
    <div className="space-y-6">
      <Link to="/" className="text-sm text-slate-400 hover:text-slate-200">← Back to dashboard</Link>

      <div className="card p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold">{client.name}</h1>
            <div className="text-sm text-slate-400 mt-1">
              {client.company || '—'} · {client.email || 'no email on file'}
            </div>
          </div>
          <StatusBadge status={client.status} onChange={s => patch({ status: s })} />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 text-sm">
          <Field label="Package" value={client.package ? `${client.package} reels` : '—'} editable onSave={v => patch({ package: v })} />
          <Field label="Billing date" value={client.billing_date ?? ''} placeholder="1 or 14" editable onSave={v => patch({ billing_date: v ? Number(v) : null })} />
          <Field label="Content source" value={client.content_source ?? ''} editable onSave={v => patch({ content_source: v })} />
          <Field label="MRR" value={client.mrr ?? ''} editable onSave={v => patch({ mrr: v ? Number(v) : null })} />
          <Field label="Stripe status" value={client.stripe_status ?? ''} editable onSave={v => patch({ stripe_status: v })} />
          <Field label="Risk horizon" value={client.risk_horizon ?? ''} editable onSave={v => patch({ risk_horizon: v })} />
          <Field label="Date added" value={fmtDate(client.created_at)} />
          <Field label="Onboarding call" value={client.onboarding_call_completed ? fmtDate(client.onboarding_call_date) : 'Not completed'} />
        </div>

        {(client.reason || client.save_plan_analysis || client.action_needed) && (
          <div className="grid md:grid-cols-3 gap-3 mt-4 text-sm">
            {client.reason && <Info label="Reason" value={client.reason} />}
            {client.save_plan_analysis && <Info label="Save plan" value={client.save_plan_analysis} />}
            {client.action_needed && <Info label="Action needed" value={client.action_needed} />}
          </div>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <TimerCard label="Loom timer" timer={loom} onReset={() => resetTimer('loom')} onAction={() => doAction('loom_sent')} actionLabel="Loom Sent" />
        <TimerCard label="Call Offer timer" timer={call} onReset={() => resetTimer('call_offer')} onAction={() => doAction('call_offered')} actionLabel="Call Offered" />
      </div>

      <div className="card p-5">
        <h3 className="font-semibold mb-2">Add a note</h3>
        <textarea className="input h-24" placeholder="What happened?" value={note} onChange={e => setNote(e.target.value)} />
        <div className="flex justify-between mt-3">
          <button className="btn" onClick={() => doAction('call_completed')}>Log "Call Completed"</button>
          <button className="btn btn-primary" onClick={saveNote} disabled={saving || !note.trim()}>
            {saving ? 'Saving…' : 'Save note'}
          </button>
        </div>
      </div>

      <div className="card p-5">
        <h3 className="font-semibold mb-3">Touchpoint history</h3>
        {client.touchpoints.length === 0 ? (
          <div className="text-slate-400 text-sm">No touchpoints yet.</div>
        ) : (
          <ul className="divide-y divide-ink-700">
            {client.touchpoints.map(tp => (
              <li key={tp.id} className="py-3 flex gap-4">
                <div className="text-xs text-slate-400 w-32 shrink-0">{fmtDate(tp.created_at)}</div>
                <div className="flex-1">
                  <div className="text-sm font-medium">{touchpointLabel(tp.type)}</div>
                  {tp.content && <div className="text-sm text-slate-300 whitespace-pre-wrap">{tp.content}</div>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Field({ label, value, placeholder, editable, onSave }) {
  const [v, setV] = useState(value ?? '');
  useEffect(() => { setV(value ?? ''); }, [value]);
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">{label}</div>
      {editable ? (
        <input className="input" value={v} placeholder={placeholder}
          onChange={e => setV(e.target.value)}
          onBlur={() => v !== (value ?? '') && onSave?.(v)} />
      ) : (
        <div className="text-slate-200">{value || '—'}</div>
      )}
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div className="rounded-lg bg-ink-900/60 border border-ink-700 p-3">
      <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">{label}</div>
      <div className="text-sm text-slate-200 whitespace-pre-wrap">{value}</div>
    </div>
  );
}

function TimerCard({ label, timer, onReset, onAction, actionLabel }) {
  if (!timer) return <div className="card p-5">{label}: no timer</div>;
  const overdue = timer.is_overdue;
  return (
    <div className={`card p-5 ${overdue ? 'border-red-500/50' : ''}`}>
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{label}</h3>
        <span className={`pill ${overdue ? 'bg-red-500/15 text-red-300' : 'bg-emerald-500/10 text-emerald-300'}`}>
          {overdue ? 'Overdue' : 'On track'}
        </span>
      </div>
      <div className="mt-2 text-sm text-slate-300">
        Next due: {fmtDate(timer.next_due_at)} ({fmtRelative(timer.next_due_at)})
      </div>
      <div className="mt-1 text-xs text-slate-400">Last reset: {fmtDate(timer.last_reset_at)}</div>
      <div className="flex gap-2 mt-4">
        <button className="btn btn-primary flex-1" onClick={onAction}>{actionLabel}</button>
        <button className="btn" onClick={onReset}>Manual reset</button>
      </div>
    </div>
  );
}
