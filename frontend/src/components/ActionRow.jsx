import { useState } from 'react';
import { api } from '../lib/api.js';
import { useData } from '../lib/data.jsx';
import { useToast } from '../lib/toast.jsx';
import { statusMeta } from './primitives.jsx';

const BORDER = {
  now:   'border-l-rose-500',
  today: 'border-l-amber-500',
  soon:  'border-l-slate-600'
};

export default function ActionRow({ item, bucket, selected, onToggleSelect, onOpen }) {
  const { refresh } = useData();
  const { show } = useToast();
  const [busy, setBusy] = useState(false);

  const primaryLabel =
    item.timer_type === 'loom' ? 'Loom Sent'
    : item.timer_type === 'call_offer' ? 'Call Offered'
    : 'Mark Done';
  const actionType =
    item.timer_type === 'loom' ? 'loom_sent'
    : item.timer_type === 'call_offer' ? 'call_offered'
    : 'call_completed';

  async function primary(e) {
    e.stopPropagation();
    setBusy(true);
    try {
      await api.action(item.client_id, actionType);
      if (item.timer_type === 'onboarding_checkin') await api.dismissOnboard(item.client_id);
      refresh(true);
      show({
        message: `${primaryLabel} · ${item.client.name}`,
        action: {
          label: 'Undo',
          onClick: async () => { await api.undoLast(item.client_id); refresh(true); show({ message: 'Undone.' }); }
        }
      });
    } catch (e) { show({ message: e.message, tone: 'error' }); }
    finally { setBusy(false); }
  }

  async function snooze(days, e) {
    e.stopPropagation();
    const timerType = item.timer_type === 'onboarding_checkin' ? null : item.timer_type;
    if (!timerType) { await api.dismissOnboard(item.client_id); refresh(true); return; }
    setBusy(true);
    try {
      await api.snooze(item.client_id, timerType, days);
      refresh(true);
      show({ message: `Snoozed ${days}d · ${item.client.name}` });
    } catch (e) { show({ message: e.message, tone: 'error' }); }
    finally { setBusy(false); }
  }

  const urgency = item.is_overdue
    ? (item.days_overdue > 0 ? `${item.days_overdue}d late` : 'Due')
    : `in ${item.days_until_due}d`;

  const m = statusMeta(item.client.status);

  return (
    <div onClick={onOpen}
         className={`group cursor-pointer card pl-4 pr-3 py-3 border-l-4 ${BORDER[bucket] || 'border-l-slate-700'} flex items-center gap-3 hover:bg-ink-800 transition`}>
      <input
        type="checkbox"
        checked={selected}
        onClick={e => e.stopPropagation()}
        onChange={onToggleSelect}
        className="shrink-0 w-4 h-4 accent-emerald-500"
      />
      <div className="shrink-0 text-[11px] uppercase tracking-wide text-slate-400 w-20 tabular-nums">{urgency}</div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={`h-1.5 w-1.5 rounded-full ${m.dot} shrink-0`} />
          <span className="font-medium truncate">{item.client.name}</span>
          <span className="text-xs text-slate-500 truncate">· {item.label}</span>
        </div>
        {item.client.action_needed && (
          <div className="text-xs text-slate-400 truncate mt-0.5">{item.client.action_needed}</div>
        )}
      </div>
      <div className="opacity-60 group-hover:opacity-100 transition flex items-center gap-1">
        <button disabled={busy} className="btn btn-sm" onClick={(e) => snooze(1, e)}>Snooze 1d</button>
        <button disabled={busy} className="btn btn-primary btn-sm" onClick={primary}>{primaryLabel}</button>
      </div>
    </div>
  );
}
