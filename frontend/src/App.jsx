import { NavLink, Outlet } from 'react-router-dom';

const NAV = [
  { to: '/today', label: 'Today' },
  { to: '/pipeline', label: 'Pipeline' },
  { to: '/billing', label: 'Billing' },
  { to: '/activity', label: 'Activity' },
];

export default function App() {
  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <aside className="w-56 bg-ink-900 border-r border-ink-700 flex flex-col py-6 px-4 shrink-0">
        <div className="mb-8">
          <h1 className="text-lg font-bold text-white">View Movement</h1>
          <p className="text-xs text-slate-400 mt-0.5">Client Success</p>
        </div>
        <nav className="flex flex-col gap-1">
          {NAV.map(n => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) =>
                'px-3 py-2 rounded-lg text-sm font-medium transition-colors ' +
                (isActive ? 'bg-ink-700 text-white' : 'text-slate-400 hover:text-white hover:bg-ink-800')
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      {/* Main content */}
      <main className="flex-1 overflow-y-auto bg-ink-950 p-6">
        <Outlet />
      </main>
    </div>
  );
}
