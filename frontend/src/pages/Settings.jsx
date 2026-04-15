import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useToast } from '../lib/toast.jsx';
import { useAuth } from '../lib/auth.jsx';

export default function Settings() {
  const [s, setS] = useState(null);
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const { user } = useAuth();

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

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <header>
        <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-1">Settings</div>
        <h1 className="text-3xl font-semibold tracking-tight">Preferences</h1>
        <div className="text-sm text-slate-400 mt-1">Signed in as {user?.email}</div>
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
