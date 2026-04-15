import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';

const STATUS_BG = {
  churned: 'border-l-status-churned',
  red: 'border-l-status-red',
  yellow: 'border-l-status-yellow',
  green: 'border-l-status-green'
};

export default function TodaysActions({ items, onChange }) {
  async function handleAction(clientId, timerType) {
    const type = timerType === 'loom' ? 'loom_sent'
      : timerType === 'call_offer' ? 'call_offered'
      : timerType === 'onboarding_checkin' ? 'call_completed'
      : null;
    if (!type) return;
    await api.action(clientId, type);
    if (timerType === 'onboarding_checkin') await api.dismissOnboard(clientId);
    onChange?.();
  }

  if (!items?.length) {
    return (
      <div className="card p-8 text-center">
        <div className="text-2xl mb-1">🎉</div>
        <div className="font-semibold">Today's Actions is clear</div>
        <div className="text-slate-400 text-sm mt-1">No overdue or due-today items. Nice work.</div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((it, idx) => (
        <div key={`${it.client_id}-${it.timer_type}-${idx}`}
             className={`card pl-4 pr-3 py-3 border-l-4 ${STATUS_BG[it.client.status]} flex items-center justify-between gap-3`}>
          <div className="flex items-center gap-4 min-w-0">
            <div className="shrink-0 text-xs uppercase tracking-wide text-slate-400 w-16">
              {it.is_overdue
                ? (it.days_overdue > 0 ? `${it.days_overdue}d late` : 'Due')
                : `In ${it.days_until_due}d`}
            </div>
            <div className="min-w-0">
              <Link to={`/clients/${it.client_id}`} className="font-medium hover:underline truncate block">
                {it.client.name}
              </Link>
              <div className="text-xs text-slate-400 truncate">
                Needs: <span className="text-slate-200">{it.label}</span>
                {it.client.action_needed ? <> · {it.client.action_needed}</> : null}
              </div>
            </div>
          </div>
          <button className="btn btn-primary" onClick={() => handleAction(it.client_id, it.timer_type)}>
            {it.timer_type === 'loom' ? 'Loom Sent'
             : it.timer_type === 'call_offer' ? 'Call Offered'
             : 'Mark Done'}
          </button>
        </div>
      ))}
    </div>
  );
}
