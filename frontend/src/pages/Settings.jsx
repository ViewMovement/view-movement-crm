import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useToast } from '../lib/toast.jsx';
import { useAuth } from '../lib/auth.jsx';
import { useRole } from '../lib/role.jsx';

export default function Settings() {
  const [s, setS] = useState(null);
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const { user } = useAuth();
  const { isAdmin, role } = useRole();

  useEffect(() => { api.getSettings().then(setS).catch(() => setS({ loom_interval_days: 21, call_interval_days: 60, greeting_name: '' })); }, []);

  if (!s) return <div className="text-slate-400">Loading settings…</div>;

  async function save() {
    setSaving(true);
    try {
      const next = await api.saveSettings({
        loom_interval_days: Number(s.loom_interval_days),
        call_interval_days: Number(s.call_interval_days),
        greeting_name: s.greeting_name || null
      });
      setS(next);
      toast?.push?.('Settings saved');
    } catch (e) {
      toast?.push?.('Save failed: ' + e.message);
    } finally { setSaving(false); }
  }

  function exportCsv(kind) {
    window.open(`${import.meta.env.VITE_API_URL || ''}/api/export/${kind}.csv?t=${Date.now()}`, '_blank');
  }

  const ROLE_LABEL = { admin: 'Admin', retention: 'Retention', ops: 'Ops Manager' };

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <header>
        <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-1">Settings</div>
        <h1 className="text-3xl font-semibold tracking-tight">Preferences</h1>
        <div className="text-sm text-slate-400 mt-1">
          Signed in as {user?.email}
          <span className="ml-2 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-ink-800 border border-ink-700 text-slate-500">{ROLE_LABEL[role] || role}</span>
        </div>
      </header>

      <section className="p-6 rounded-xl border border-ink-800 bg-ink-900/40 space-y-5">
        <div>
          <div className="font-medium text-slate-200 mb-1">Greeting name</div>
          <div className="text-xs text-slate-500 mb-2">Shown on the Today page as "Good morning, {'{name}'}". Leave blank to use your email.</div>
          <input value={s.greeting_name || ''} onChange={e => setS({ ...s, greeting_name: e.target.value })}
            className="w-full px-3 py-2 rounded-md bg-ink-950 border border-ink-700 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
            placeholder="e.g. Ty" />
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <div className="font-medium text-slate-200 mb-1">Loom cadence</div>
            <div className="text-xs text-slate-500 mb-2">Days between scheduled Loom updates per client.</div>
            <div className="flex items-center gap-2">
              <input type="number" min="1" max="180" value={s.loom_interval_days} onChange={e => setS({ ...s, loom_interval_days: e.target.value })}
                className="w-20 px-3 py-2 rounded-md bg-ink-950 border border-ink-700 text-sm text-slate-100 text-center tabular-nums focus:border-emerald-500 focus:outline-none" />
              <span className="text-sm text-slate-400">days</span>
            </div>
          </div>

          <div>
            <div className="font-medium text-slate-200 mb-1">Call-offer cadence</div>
            <div className="text-xs text-slate-500 mb-2">Days between proactive call offers per client.</div>
            <div className="flex items-center gap-2">
              <input type="number" min="1" max="365" value={s.call_interval_days} onChange={e => setS({ ...s, call_interval_days: e.target.value })}
                className="w-20 px-3 py-2 rounded-md bg-ink-950 border border-ink-700 text-sm text-slate-100 text-center tabular-nums focus:border-emerald-500 focus:outline-none" />
              <span className="text-sm text-slate-400">days</span>
            </div>
          </div>
        </div>

        <div className="pt-4 border-t border-ink-800 flex justify-end">
          <button onClick={save} disabled={saving}
            className="px-4 py-2 rounded-md bg-emerald-500 hover:bg-emerald-400 text-ink-950 text-sm font-medium transition disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </section>

      {/* Role Management — Admin only */}
      {isAdmin && <RoleManager />}

      <section className="p-6 rounded-xl border border-ink-800 bg-ink-900/40">
        <div className="font-medium text-slate-200 mb-3">Export data</div>
        <div className="text-xs text-slate-500 mb-4">Download a CSV snapshot for reporting or backup.</div>
        <div className="flex gap-2 flex-wrap">
          <ExportButton onClick={() => exportCsv('clients')} label="Clients" />
          <ExportButton onClick={() => exportCsv('touchpoints')} label="Touchpoints (90d)" />
          <ExportButton onClick={() => exportCsv('flags')} label="Flags" />
          <ExportButton onClick={() => exportCsv('save-plans')} label="Save plans" />
        </div>
      </section>

      <section className="p-6 rounded-xl border border-ink-800 bg-ink-900/40">
        <div className="font-medium text-slate-200 mb-3">Keyboard shortcuts</div>
        <div className="grid md:grid-cols-2 gap-x-8 gap-y-2 text-sm">
          {SHORTCUTS.map(([k, v]) => (
            <div key={k} className="flex justify-between items-baseline border-b border-ink-800/60 py-1">
              <span className="text-slate-300">{v}</span>
              <kbd className="text-[10px] bg-ink-950 border border-ink-700 rounded px-1.5 py-0.5 tabular-nums">{k}</kbd>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

/* ─── Role Management (Admin only) ─── */

const ROLE_OPTIONS = [
  { value: 'admin', label: 'Admin', desc: 'Full access to everything' },
  { value: 'retention', label: 'Retention', desc: 'Financial data, dashboard, billing, save queue' },
  { value: 'ops', label: 'Ops Manager', desc: 'Daily tasks, triage, clients, pipeline, Slack Pulse — no financials' }
];

function RoleManager() {
  const [roles, setRoles] = useState([]);
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState('ops');
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  useEffect(() => {
    api.listRoles().then(setRoles).catch(() => setRoles([])).finally(() => setLoading(false));
  }, []);

  async function addOrUpdate() {
    const email = newEmail.trim().toLowerCase();
    if (!email) return;
    try {
      await api.setRole(email, newRole);
      const updated = await api.listRoles();
      setRoles(updated);
      setNewEmail('');
      toast?.push?.(`Role set: ${email} → ${newRole}`);
    } catch (e) { toast?.push?.('Error: ' + e.message); }
  }

  async function changeRole(email, role) {
    try {
      await api.setRole(email, role);
      const updated = await api.listRoles();
      setRoles(updated);
      toast?.push?.(`${email} → ${role}`);
    } catch (e) { toast?.push?.('Error: ' + e.message); }
  }

  async function remove(email) {
    try {
      await api.deleteRole(email);
      const updated = await api.listRoles();
      setRoles(updated);
      toast?.push?.(`Removed role for ${email}`);
    } catch (e) { toast?.push?.('Error: ' + e.message); }
  }

  return (
    <section className="p-6 rounded-xl border border-amber-500/20 bg-amber-500/5 space-y-4">
      <div>
        <div className="font-medium text-slate-200 mb-1">Team Roles</div>
        <div className="text-xs text-slate-500 mb-3">
          Control what each team member can see. Ops users cannot see financial data, retention tabs, or the dashboard.
        </div>
      </div>

      {/* Role descriptions */}
      <div className="grid md:grid-cols-3 gap-2 text-xs">
        {ROLE_OPTIONS.map(r => (
          <div key={r.value} className="rounded-md border border-ink-700 bg-ink-900/60 p-2.5">
            <div className="font-medium text-slate-200">{r.label}</div>
            <div className="text-slate-500 mt-0.5">{r.desc}</div>
          </div>
        ))}
      </div>

      {/* Current roles */}
      {loading ? (
        <div className="text-xs text-slate-500">Loading…</div>
      ) : (
        <div className="space-y-1.5">
          {roles.map(r => (
            <div key={r.email} className="flex items-center gap-3 rounded-md bg-ink-900/60 border border-ink-700 px-3 py-2">
              <span className="flex-1 text-sm text-slate-200 truncate">{r.email}</span>
              <select value={r.role} onChange={e => changeRole(r.email, e.target.value)}
                className="bg-ink-800 border border-ink-700 rounded-md text-xs px-2 py-1 text-slate-300">
                <option value="admin">Admin</option>
                <option value="retention">Retention</option>
                <option value="ops">Ops</option>
              </select>
              <button onClick={() => remove(r.email)}
                className="text-xs text-slate-500 hover:text-rose-300 transition">Remove</button>
            </div>
          ))}
          {roles.length === 0 && (
            <div className="text-xs text-slate-500">No roles assigned yet. Users default to Ops.</div>
          )}
        </div>
      )}

      {/* Add new */}
      <div className="flex items-center gap-2 pt-2 border-t border-ink-800">
        <input className="input flex-1" placeholder="team@viewmovement.com"
          value={newEmail} onChange={e => setNewEmail(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') addOrUpdate(); }} />
        <select value={newRole} onChange={e => setNewRole(e.target.value)}
          className="bg-ink-800 border border-ink-700 rounded-md text-xs px-2 py-2 text-slate-300">
          <option value="admin">Admin</option>
          <option value="retention">Retention</option>
          <option value="ops">Ops</option>
        </select>
        <button onClick={addOrUpdate} disabled={!newEmail.trim()}
          className="btn btn-primary btn-sm">Add</button>
      </div>
    </section>
  );
}

function ExportButton({ onClick, label }) {
  return (
    <button onClick={onClick}
      className="px-3 py-2 rounded-md border border-ink-700 bg-ink-900 hover:bg-ink-800 text-sm text-slate-200 transition">
      ↓ {label}
    </button>
  );
}

const SHORTCUTS = [
  ['H', 'Today (home)'],
  ['T', 'Triage board'],
  ['C', 'Clients'],
  ['P', 'Pipeline'],
  ['B', 'Billing'],
  ['A', 'Activity'],
  ['S', 'Save Queue'],
  ['F', 'Flags'],
  ['R', 'Reports'],
  ['G', 'Digest'],
  [',', 'Settings'],
  ['?', 'Show shortcuts overlay'],
  ['⌘K / /', 'Command palette']
];
