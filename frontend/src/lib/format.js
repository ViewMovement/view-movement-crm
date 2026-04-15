export function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
export function fmtRelative(iso) {
  if (!iso) return '—';
  const d = new Date(iso), now = new Date();
  const days = Math.round((d - now) / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'in 1 day';
  if (days === -1) return '1 day ago';
  return days > 0 ? `in ${days} days` : `${-days} days ago`;
}
export function touchpointLabel(type) {
  return { loom_sent: 'Loom sent', call_offered: 'Call offered', call_completed: 'Call completed',
    note: 'Note', status_change: 'Status change', system: 'System' }[type] || type;
}
