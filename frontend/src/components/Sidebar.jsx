import { NavLink, Link } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { useData } from '../lib/data.jsx';

const ITEMS = [
  { to: '/',         label: 'Today',    icon: '◎', shortcut: 'T' },
  { to: '/clients',  label: 'Clients',  icon: '◧', shortcut: 'C' },
  { to: '/pipeline', label: 'Pipeline', icon: '◇', shortcut: 'P' },
  { to: '/activity', label: 'Activity', icon: '◉', shortcut: 'A' },
  { to: '/digest',   label: 'Digest',   icon: '◈', shortcut: 'D' }
];

export default function Sidebar({ onOpenPalette }) {
  const { user, signOut } = useAuth();
  const { today, clients } = useData();
  const todayCount = today?.length || 0;
  const pipelineCount = (clients || []).filter(c => isNewish(c) || c.status === 'churned').length;

  return (
    <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-ink-800 bg-ink-900/60 backdrop-blur">
      <Link to="/" className="flex items-center gap-3 px-5 h-14 border-b border-ink-800">
        <div className="h-7 w-7 rounded-md bg-emerald-500 grid place-items-center text-ink-950 font-bold text-sm">V</div>
        <div className="leading-tight">
          <div className="font-semibold text-sm">View Movement</div>
          <div className="text-[11px] text-slate-400">Client Success</div>
        </div>
      </Link>

      <button
        onClick={onOpenPalette}
        className="mx-3 mt-4 flex items-center justify-between text-left text-sm text-slate-400 rounded-lg border border-ink-700 bg-ink-800/60 px-3 py-2 hover:bg-ink-700 transition">
        <span className="flex items-center gap-2"><span>⌕</span> Search or jump…</span>
        <kbd className="text-[10px] bg-ink-900 border border-ink-600 rounded px-1.5 py-0.5">⌘K</kbd>
      </button>

      <nav className="px-3 mt-4 flex-1 space-y-0.5">
        {ITEMS.map(item => (
          <NavLink key={item.to} to={item.to} end={item.to === '/'}
            className={({ isActive }) =>
              `flex items-center justify-between rounded-lg px-3 py-2 text-sm transition ${
                isActive ? 'bg-ink-700 text-white' : 'text-slate-300 hover:bg-ink-800 hover:text-white'
              }`
            }>
            <span className="flex items-center gap-3">
              <span className="text-slate-500 w-4 text-center">{item.icon}</span>
              {item.label}
            </span>
            {item.to === '/' && todayCount > 0 && (
              <span className="text-[11px] bg-emerald-500/20 text-emerald-300 rounded-full px-2 py-0.5 tabular-nums">{todayCount}</span>
            )}
            {item.to === '/pipeline' && pipelineCount > 0 && (
              <span className="text-[11px] bg-ink-700 text-slate-400 rounded-full px-2 py-0.5 tabular-nums">{pipelineCount}</span>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="px-3 py-3 border-t border-ink-800 text-xs text-slate-500">
        <div className="truncate mb-1">{user?.email}</div>
        <button onClick={signOut} className="text-slate-400 hover:text-slate-200 transition">Sign out</button>
      </div>
    </aside>
  );
}

function isNewish(c) {
  if (!c.created_at) return false;
  return (Date.now() - new Date(c.created_at).getTime()) < 14 * 86400000;
}
