import { Link, NavLink as RRNavLink, Outlet } from 'react-router-dom';
import { useAuth } from './lib/auth.jsx';

function NavTab({ to, children }) {
  return (
    <RRNavLink to={to} end
      className={({ isActive }) =>
        `px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
          isActive
            ? 'bg-ink-700 text-white'
            : 'text-slate-400 hover:text-slate-200 hover:bg-ink-800'
        }`
      }>
      {children}
    </RRNavLink>
  );
}

export default function App() {
  const { user, signOut } = useAuth();
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-ink-800 bg-ink-900/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link to="/" className="flex items-center gap-3">
              <div className="h-7 w-7 rounded bg-emerald-500/90 grid place-items-center text-ink-950 font-bold">V</div>
              <div className="font-semibold hidden sm:block">View Movement</div>
            </Link>
            <nav className="flex items-center gap-1">
              <NavTab to="/">Today</NavTab>
              <NavTab to="/pipeline">Pipeline</NavTab>
              <NavTab to="/clients">Clients</NavTab>
              <NavTab to="/billing">Billing</NavTab>
              <NavTab to="/activity">Activity</NavTab>
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm text-slate-400">
            <span className="hidden sm:inline">{user?.email}</span>
            <button className="btn btn-subtle" onClick={signOut}>Sign out</button>
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
