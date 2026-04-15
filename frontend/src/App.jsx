import { Link, Outlet } from 'react-router-dom';
import { useAuth } from './lib/auth.jsx';

export default function App() {
  const { user, signOut } = useAuth();
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-ink-800 bg-ink-900/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <div className="h-7 w-7 rounded bg-emerald-500/90 grid place-items-center text-ink-950 font-bold">V</div>
            <div className="font-semibold">View Movement · Client Success</div>
          </Link>
          <div className="flex items-center gap-3 text-sm text-slate-400">
            <span>{user?.email}</span>
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
