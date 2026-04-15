import { Link } from 'react-router-dom';
import StatusBadge from './StatusBadge.jsx';
import { fmtDate, fmtRelative, touchpointLabel } from '../lib/format.js';
import { api } from '../lib/api.js';

export default function ClientCard({ client, onChange }) {
  async function doAction(type) { await api.action(client.id, type); onChange?.(); }
  async function setStatus(status) { await api.updateClient(client.id, { status }); onChange?.(); }

  const loom = client.timers?.loom;
  const call = client.timers?.call_offer;

  return (
    <div className="card p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link to={`/clients/${client.id}`} className="font-semibold hover:underline truncate block">
            {client.name}
          </Link>
          <div className="text-xs text-slate-400 truncate">
            {client.package ? `${client.package} reels` : 'Package —'} ·
            {' '}Billing: {client.billing_date ? `${client.billing_date}${suffix(client.billing_date)}` : '—'}
            {client.days_until_billing != null && <> ({client.days_until_billing}d)</>}
          </div>
        </div>
        <StatusBadge status={client.status} onChange={setStatus} />
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs">
        <TimerBlock label="Loom" timer={loom} />
        <TimerBlock label="Call Offer" timer={call} />
      </div>

      <div className="text-xs text-slate-400 truncate">
        Last: {client.last_touchpoint
          ? `${touchpointLabel(client.last_touchpoint.type)} · ${fmtDate(client.last_touchpoint.created_at)}`
          : '—'}
      </div>

      <div className="flex gap-2">
        <button className="btn flex-1" onClick={() => doAction('loom_sent')}>Loom Sent</button>
        <button className="btn flex-1" onClick={() => doAction('call_offered')}>Call Offered</button>
        <button className="btn flex-1" onClick={() => doAction('call_completed')}>Call Done</button>
      </div>
    </div>
  );
}

function TimerBlock({ label, timer }) {
  if (!timer) return <div className="rounded bg-ink-900/50 p-2">{label}: —</div>;
  const overdue = timer.is_overdue;
  return (
    <div className={`rounded p-2 ${overdue ? 'bg-red-500/10 border border-red-500/40' : 'bg-ink-900/50'}`}>
      <div className="text-slate-400">{label}</div>
      <div className={overdue ? 'text-red-300 font-medium' : 'text-slate-200'}>
        {fmtRelative(timer.next_due_at)}
      </div>
    </div>
  );
}

function suffix(n) {
  return n === 1 ? 'st' : n === 14 ? 'th' : '';
}
