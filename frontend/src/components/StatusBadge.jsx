import { useState, useRef, useEffect } from 'react';

const LABELS = { green: 'Healthy', yellow: 'Watch', red: 'At Risk', churned: 'Churned' };
const DOT = {
  green: 'bg-emerald-400',
  yellow: 'bg-yellow-400',
  red: 'bg-red-400',
  churned: 'bg-slate-500',
};
const BG = {
  green: 'bg-emerald-400/10 text-emerald-300',
  yellow: 'bg-yellow-400/10 text-yellow-300',
  red: 'bg-red-400/10 text-red-300',
  churned: 'bg-slate-500/10 text-slate-400',
};

export default function StatusBadge({ status, onChangeStatus }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClick(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const label = LABELS[status] || status;

  if (!onChangeStatus) {
    return (
      <span className={'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ' + (BG[status] || '')}>
        <span className={'w-2 h-2 rounded-full ' + (DOT[status] || '')}></span>
        {label}
      </span>
    );
  }

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium cursor-pointer ' + (BG[status] || '')}
      >
        <span className={'w-2 h-2 rounded-full ' + (DOT[status] || '')}></span>
        {label}
      </button>
      {open && (
        <div className="absolute z-50 mt-1 bg-ink-800 border border-ink-700 rounded-lg shadow-lg py-1 min-w-[120px]">
          {Object.keys(LABELS).map(s => (
            <button
              key={s}
              onClick={() => { onChangeStatus(s); setOpen(false); }}
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-ink-700 flex items-center gap-2"
            >
              <span className={'w-2 h-2 rounded-full ' + (DOT[s] || '')}></span>
              {LABELS[s]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
