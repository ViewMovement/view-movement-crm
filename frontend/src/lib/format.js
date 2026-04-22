export function fmtDate(iso) {
  if (!iso) return '\u2014';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function fmtRelative(iso) {
  if (!iso) return '';
  const diff = new Date(iso) - new Date();
  const days = Math.round(diff / (1000 * 60 * 60 * 24));
  if (days < 0) return Math.abs(days) + 'd overdue';
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return days + 'd';
}

export function fmtDateTime(iso) {
  if (!iso) return '\u2014';
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}
