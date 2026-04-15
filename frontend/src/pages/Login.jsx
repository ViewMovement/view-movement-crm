import { useState } from 'react';
import { useAuth } from '../lib/auth.jsx';
import { Navigate } from 'react-router-dom';

export default function Login() {
  const { session, signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  if (session) return <Navigate to="/" replace />;

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErr(null);
    const { error } = await signIn(email, pw);
    setBusy(false);
    if (error) setErr(error.message);
  }

  return (
    <div className="min-h-screen grid place-items-center px-6">
      <form onSubmit={submit} className="card p-8 w-full max-w-sm">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-8 w-8 rounded bg-emerald-500 grid place-items-center text-ink-950 font-bold">V</div>
          <div>
            <div className="font-semibold">View Movement</div>
            <div className="text-xs text-slate-400">Client Success</div>
          </div>
        </div>
        <label className="block text-xs text-slate-400 mb-1">Email</label>
        <input className="input mb-3" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
        <label className="block text-xs text-slate-400 mb-1">Password</label>
        <input className="input mb-5" type="password" value={pw} onChange={e => setPw(e.target.value)} required />
        {err && <div className="text-red-400 text-sm mb-3">{err}</div>}
        <button className="btn btn-primary w-full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </div>
  );
}
