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
// MRR helpers. Numbers in the DB are raw dollars (e.g. 3300 = $3,300/mo).
export function fmtMRR(n, opts = {}) {
  const v = Number(n);
  if (!v || isNaN(v)) return opts.blank || '—';
  // Compact: $3.3k, $12k, $120k, $1.2M
  if (opts.compact) {
    if (v >= 1_000_000) return `$${(v/1_000_000).toFixed(1)}M`;
    if (v >= 10_000) return `$${Math.round(v/1000)}k`;
    if (v >= 1_000) return `$${(v/1000).toFixed(1).replace(/\.0$/,'')}k`;
    return `$${v}`;
  }
  return `$${v.toLocaleString()}`;
}
export function sumMRR(clients, predicate = () => true) {
  return (clients || []).reduce((s, c) => s + (predicate(c) ? (Number(c.mrr) || 0) : 0), 0);
}

export function touchpointLabel(type) {
  return { loom_sent: 'Loom sent', call_offered: 'Call offered', call_completed: 'Call completed',
    note: 'Note', status_change: 'Status change', system: 'System' }[type] || type;
}
