import { useState } from 'react';
import { useAuth } from '../lib/auth.jsx';
import { Navigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';

export default function Login() {
  const user = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to="/today" replace />;

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    setLoading(false);
  }

  return (
    <div className="h-screen flex items-center justify-center bg-ink-950">
      <form onSubmit={handleSubmit} className="bg-ink-900 border border-ink-700 rounded-xl p-8 w-full max-w-sm space-y-4">
        <div className="text-center mb-4">
          <h1 className="text-xl font-bold text-white">View Movement</h1>
          <p className="text-sm text-slate-400">Client Success CRM</p>
        </div>
        {error && <p className="text-red-400 text-sm text-center">{error}</p>}
        <input
          type="email" placeholder="Email" value={email}
          onChange={e => setEmail(e.target.value)}
          className="w-full bg-ink-800 border border-ink-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
        />
        <input
          type="password" placeholder="Password" value={password}
          onChange={e => setPassword(e.target.value)}
          className="w-full bg-ink-800 border border-ink-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
        />
        <button
          type="submit" disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium rounded-lg py-2 text-sm transition-colors"
        >
          {loading ? 'Signing in...' : 'Sign In'}
        </button>
      </form>
    </div>
  );
}
