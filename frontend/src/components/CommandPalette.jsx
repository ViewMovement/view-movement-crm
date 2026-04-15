import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../lib/data.jsx';

const NAV = [
  { label: 'Go to Triage', path: '/' },
  { label: 'Go to Clients', path: '/clients' },
  { label: 'Go to Pipeline', path: '/pipeline' },
  { label: 'Go to Billing', path: '/billing' },
  { label: 'Go to Activity', path: '/activity' },
  { label: 'Go to Save Queue', path: '/save-queue' },
  { label: 'Go to Flags', path: '/flags' },
  { label: 'Go to Weekly Digest', path: '/digest' },
  { label: 'Open Master Sheet ↗', path: 'https://docs.google.com/spreadsheets/d/15AvJa6_1Dfe0UTmOjoFLeKHD-GzHuRasUG7ZZ2kYWG0/edit?usp=sharing', external: true }
];

export default function CommandPalette({ open, onClose }) {
  const { clients } = useData();
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const nav = useNavigate();
  const inputRef = useRef(null);

  useEffect(() => { if (open) { setQ(''); setIdx(0); setTimeout(() => inputRef.current?.focus(), 20); } }, [open]);

  const items = useMemo(() => {
    const query = q.trim().toLowerCase();
    const navHits = NAV.filter(n => !query || n.label.toLowerCase().includes(query))
      .map(n => ({ kind: 'nav', label: n.label, action: () => n.external ? window.open(n.path, '_blank') : nav(n.path) }));
    const clientHits = (clients || [])
      .filter(c => !query || c.name.toLowerCase().includes(query) || (c.email || '').toLowerCase().includes(query))
      .slice(0, 20)
      .map(c => ({ kind: 'client', label: c.name, sub: statusLabel(c.status), action: () => nav(`/clients?focus=${c.id}`) }));
    return [...navHits, ...clientHits];
  }, [q, clients, nav]);

  if (!open) return null;

  function onKey(e) {
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(i => Math.min(i + 1, items.length - 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setIdx(i => Math.max(i - 1, 0)); }
    if (e.key === 'Enter') {
      e.preventDefault();
      items[idx]?.action();
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm grid place-items-start pt-[12vh] px-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl bg-ink-800/95 border border-ink-600 shadow-2xl overflow-hidden"
           onClick={e => e.stopPropagation()}>
        <input
          ref={inputRef}
          value={q}
          onChange={e => { setQ(e.target.value); setIdx(0); }}
          onKeyDown={onKey}
          placeholder="Search clients or jump to a view…"
          className="w-full bg-transparent px-5 py-4 text-sm outline-none border-b border-ink-700"
        />
        <ul className="max-h-[50vh] overflow-auto py-2">
          {items.length === 0 && <li className="px-5 py-3 text-sm text-slate-500">No matches</li>}
          {items.map((it, i) => (
            <li key={i}
                onMouseEnter={() => setIdx(i)}
                onClick={() => { it.action(); onClose(); }}
                className={`px-5 py-2.5 flex items-center justify-between cursor-pointer ${
                  idx === i ? 'bg-ink-700' : ''
                }`}>
              <span className="flex items-center gap-3">
                <span className="text-slate-500 text-xs w-14">{it.kind === 'nav' ? 'Go to' : 'Client'}</span>
                <span className="text-sm">{it.label}</span>
              </span>
              {it.sub && <span className="text-xs text-slate-500">{it.sub}</span>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function statusLabel(s) {
  return { green: 'Healthy', yellow: 'Watch', red: 'At Risk', churned: 'Churned' }[s] || s;
}
