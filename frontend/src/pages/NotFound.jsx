import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="max-w-md mx-auto text-center py-20">
      <div className="text-7xl mb-6 opacity-30">404</div>
      <h1 className="text-2xl font-semibold tracking-tight mb-2">Nothing here</h1>
      <p className="text-sm text-slate-400 mb-8">That page doesn't exist (or moved). Head back to Today to keep the ball rolling.</p>
      <Link to="/" className="inline-block px-4 py-2 rounded-md bg-emerald-500 hover:bg-emerald-400 text-ink-950 text-sm font-medium transition">Back to Today</Link>
    </div>
  );
}
