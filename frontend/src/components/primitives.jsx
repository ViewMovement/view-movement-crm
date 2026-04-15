const STATUS_META = {
  green:   { label: 'Healthy', dot: 'bg-emerald-400', ring: 'border-l-emerald-500' },
  yellow:  { label: 'Watch',   dot: 'bg-amber-400',   ring: 'border-l-amber-500' },
  red:     { label: 'At Risk', dot: 'bg-rose-400',    ring: 'border-l-rose-500' },
  churned: { label: 'Churned', dot: 'bg-slate-500',   ring: 'border-l-slate-500' }
};

export function statusMeta(s) { return STATUS_META[s] || STATUS_META.green; }

export function StatusDot({ status, label = true, className = '' }) {
  const m = statusMeta(status);
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs text-slate-300 ${className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />
      {label && m.label}
    </span>
  );
}

export function Skeleton({ className = '', rows = 1 }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={`animate-pulse bg-ink-800 rounded ${className || 'h-10 w-full'}`} />
      ))}
    </div>
  );
}

export function Empty({ icon = '◎', title, hint, action }) {
  return (
    <div className="rounded-xl border border-dashed border-ink-700 bg-ink-900/30 p-10 text-center">
      <div className="text-3xl text-slate-500 mb-3">{icon}</div>
      <div className="font-medium text-slate-200">{title}</div>
      {hint && <div className="text-sm text-slate-400 mt-1">{hint}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function SectionHeader({ title, subtitle, right }) {
  return (
    <div className="flex items-end justify-between gap-3 mb-4 flex-wrap">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        {subtitle && <div className="text-sm text-slate-400 mt-0.5">{subtitle}</div>}
      </div>
      {right}
    </div>
  );
}
