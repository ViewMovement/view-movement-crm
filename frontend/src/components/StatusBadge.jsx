const LABELS = { green: 'Healthy', yellow: 'Watch', red: 'At Risk', churned: 'Churned' };
const DOT = {
  green: 'bg-status-green', yellow: 'bg-status-yellow',
  red: 'bg-status-red', churned: 'bg-status-churned'
};

export default function StatusBadge({ status, onChange, editable = true }) {
  if (!editable) {
    return (
      <span className="pill bg-ink-700 border border-ink-600">
        <span className={`h-2 w-2 rounded-full ${DOT[status]}`}></span>
        {LABELS[status]}
      </span>
    );
  }
  return (
    <select
      value={status}
      onChange={e => onChange?.(e.target.value)}
      className="bg-ink-700 border border-ink-600 rounded-full text-xs px-2.5 py-1 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
    >
      <option value="green">● Healthy</option>
      <option value="yellow">● Watch</option>
      <option value="red">● At Risk</option>
      <option value="churned">● Churned</option>
    </select>
  );
}
