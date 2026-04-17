import { NavLink, Link } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { useData } from '../lib/data.jsx';
import { useRole } from '../lib/role.jsx';

const MASTER_SHEET_URL = 'https://docs.google.com/spreadsheets/d/15AvJa6_1Dfe0UTmOjoFLeKHD-GzHuRasUG7ZZ2kYWG0/edit?usp=sharing';

const OPS_ITEMS = [
  { to: '/',         label: 'Today',     icon: '☀', shortcut: 'H' },
  { to: '/board',    label: 'Triage',    icon: '◎', shortcut: 'T' },
  { to: '/clients',  label: 'Clients',   icon: '◧', shortcut: 'C' },
  { to: '/pipeline', label: 'Pipeline',  icon: '◇', shortcut: 'P' },
  { to: '/billing',  label: 'Billing',   icon: '◐', shortcut: 'B' },
  { to: '/activity', label: 'Activity',  icon: '◉', shortcut: 'A' }
];

const RETENTION_ITEMS = [
  { to: '/retention',   label: 'Retention',  icon: '◎', shortcut: 'N' },
  { to: '/save-queue',  label: 'Save Queue', icon: '◆', shortcut: 'S' },
  { to: '/flags',       label: 'Flags',      icon: '⚑', shortcut: 'F' },
  { to: '/digest',      label: 'Digest',     icon: '◈', shortcut: 'G' }
];

const INSIGHT_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: '▣', shortcut: 'D' },
  { to: '/reports',   label: 'Reports',   icon: '◑', shortcut: 'R' },
  { to: '/settings',  label: 'Settings',  icon: '⚙', shortcut: ',' }
];

export default function Sidebar({ onOpenPalette }) {
  const { user, signOut } = useAuth();
  const { today, clients, triage, flags, savePlans } = useData();
  const { role, canSeeFinancials, isAdmin } = useRole();
  const urgentCount = triage?.counts?.urgent || today?.length || 0;
  const pipelineCount = (clients || []).filter(c => isNewish(c) || c.status === 'churned').length;
  const openFlags = flags?.length || 0;
  const openSaves = (savePlans || []).filter(p => p.status === 'proposed' || p.status === 'in_progress').length;

  const badges = {
    '/': urgentCount,
    '/board': urgentCount,
    '/pipeline': pipelineCount,
    '/flags': openFlags,
    '/save-queue': openSaves
  };

  const ROLE_LABEL = { admin: 'Admin', retention: 'Retention', ops: 'Ops' };

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

      <nav className="px-3 mt-4 flex-1 space-y-0.5 overflow-y-auto">
        <SectionLabel>Ops Manager</SectionLabel>
        {OPS_ITEMS.map(item => <NavItem key={item.to} item={item} badge={badges[item.to]} />)}

        {canSeeFinancials && (
          <>
            <div className="h-3" />
            <SectionLabel>Retention</SectionLabel>
            {RETENTION_ITEMS.map(item => <NavItem key={item.to} item={item} badge={badges[item.to]} />)}
          </>
        )}

        {canSeeFinancials && (
          <>
            <div className="h-3" />
            <SectionLabel>Insight</SectionLabel>
            {INSIGHT_ITEMS.map(item => <NavItem key={item.to} item={item} />)}
          </>
        )}

        <div className="h-3" />
        <SectionLabel>External</SectionLabel>
        <NavItem item={{ to: '/slack-pulse', label: 'Slack Pulse', icon: '#' }} />
        <a href={MASTER_SHEET_URL} target="_blank" rel="noreferrer"
          className="flex items-center justify-between rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-ink-800 hover:text-white transition">
          <span className="flex items-center gap-3">
            <span className="text-slate-500 w-4 text-center">⇱</span>
            Master Sheet
          </span>
          <span className="text-[10px] text-slate-500">↗</span>
        </a>
      </nav>

      <div className="px-3 py-3 border-t border-ink-800 text-xs text-slate-500">
        <div className="truncate mb-1">{user?.email}</div>
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wider text-slate-600">{ROLE_LABEL[role] || role}</span>
          <button onClick={signOut} className="text-slate-400 hover:text-slate-200 transition">Sign out</button>
        </div>
      </div>
    </aside>
  );
}

function SectionLabel({ children }) {
  return <div className="text-[10px] uppercase tracking-wider text-slate-500 px-3 pt-1 pb-1">{children}</div>;
}

function NavItem({ item, badge }) {
  return (
    <NavLink to={item.to} end={item.to === '/'}
      className={({ isActive }) =>
        `flex items-center justify-between rounded-lg px-3 py-2 text-sm transition ${
          isActive ? 'bg-ink-700 text-white' : 'text-slate-300 hover:bg-ink-800 hover:text-white'
        }`
      }>
      <span className="flex items-center gap-3">
        <span className="text-slate-500 w-4 text-center">{item.icon}</span>
        {item.label}
      </span>
      {badge > 0 && (
        <span className="text-[11px] bg-emerald-500/20 text-emerald-300 rounded-full px-2 py-0.5 tabular-nums">{badge}</span>
      )}
    </NavLink>
  );
}

function isNewish(c) {
  if (!c.created_at) return false;
  return (Date.now() - new Date(c.created_at).getTime()) < 14 * 86400000;
}
