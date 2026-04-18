import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useData } from '../lib/data.jsx';
import { api } from '../lib/api.js';
import { useToast } from '../lib/toast.jsx';
import ClientDetailDrawer from '../components/ClientDetailDrawer.jsx';
import { Empty, SectionHeader, Skeleton, statusMeta, StatusDot, TabIntro } from '../components/primitives.jsx';
import { fmtRelative, fmtMRR } from '../lib/format.js';
import { useRole } from '../lib/role.jsx';

const STATUS_ORDER = { churned: 0, red: 1, yellow: 2, green: 3 };

const STATUS_CONFIG = {
  green:   { label: 'Healthy', bg: 'bg-emerald-500', ring: 'ring-emerald-500/30', pill: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  yellow:  { label: 'Watch',   bg: 'bg-amber-500',   ring: 'ring-amber-500/30',   pill: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  red:     { label: 'At Risk', bg: 'bg-rose-500',     ring: 'ring-rose-500/30',    pill: 'bg-rose-500/15 text-rose-300 border-rose-500/30' },
  churned: { label: 'Churned', bg: 'bg-slate-500',    ring: 'ring-slate-500/30',   pill: 'bg-slate-500/15 text-slate-400 border-slate-500/30' },
};

export default function Clients() {
  const { clients, loading, refresh } = useData();
  const { show } = useToast();
  const { canSeeFinancials } = useRole();
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('status');
  const [openId, setOpenId] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);

  useEffect(() => {
    const focus = params.get('focus');
    if (focus) { setOpenId(focus); params.delete('focus'); setParams(params, { replace: true }); }
  }, [params, setParams]);

  const filtered = useMemo(() => {
    let rows = clients || [];
    if (filter !== 'all') rows = rows.filter(c => c.status === filter);
    if (query) {
      const q = query.toLowerCase();
      rows = rows.filter(c =>
        c.name?.toLowerCase().includes(q) ||
        (c.email || '').toLowerCase().includes(q) ||
        (c.company || '').toLowerCase().includes(q)
      );
    }
    const sorted = [...rows];
    if (sort === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === 'recent') sorted.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    else if (sort === 'billing') sorted.sort((a, b) => (a.days_until_billing ?? 999) - (b.days_until_billing ?? 999));
    else sorted.sort((a, b) => {
      const s = (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9);
      return s !== 0 ? s : a.name.localeCompare(b.name);
    });
    return sorted;
  }, [clients, filter, query, sort]);

  const counts = useMemo(() => {
    const by = { all: clients?.length || 0, green: 0, yellow: 0, red: 0, churned: 0 };
    for (const c of clients || []) by[c.status] = (by[c.status] || 0) + 1;
    return by;
  }, [clients]);

  async function handleAddClient(data) {
    try {
      const newClient = await api.createClient(data);
      refresh(true);
      setShowAddForm(false);
      show({ message: `${data.name} added.` });
      setOpenId(newClient.id);
    } catch (e) {
      show({ message: `Error: ${e.message}` });
    }
  }

  if (loading) return <Skeleton rows={8} className="h-24 w-full rounded-xl" />;

  return (
    <>
      {/* Header */}
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-50">Clients</h1>
          <p className="text-slate-400 mt-1">
            {counts.all} total Â· {counts.green} healthy Â· {counts.yellow} watch Â· {counts.red} at risk Â· {counts.churned} churned
          </p>
        </div>
        <button onClick={() => setShowAddForm(true)} className="btn btn-primary rounded-xl px-5 py-2.5 text-sm font-semibold">
          + Add Client
        </button>
      </div>

      {/* Filter pills â big and tappable */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <FilterPill label="All" count={counts.all} active={filter === 'all'} onClick={() => setFilter('all')} />
        <FilterPill label="Healthy" count={counts.green} active={filter === 'green'} onClick={() => setFilter('green')} color="emerald" />
        <FilterPill label="Watch" count={counts.yellow} active={filter === 'yellow'} onClick={() => setFilter('yellow')} color="amber" />
        <FilterPill label="At Risk" count={counts.red} active={filter === 'red'} onClick={() => setFilter('red')} color="rose" />
        <FilterPill label="Churned" count={counts.churned} active={filter === 'churned'} onClick={() => setFilter('churned')} color="slate" />
      </div>

      {/* Search + sort */}
      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">ð</span>
          <input className="input w-full pl-9 py-2.5 rounded-xl" placeholder="Search name, email, companyâ¦"
            value={query} onChange={e => setQuery(e.target.value)} />
        </div>
        <select className="input py-2.5 rounded-xl" value={sort} onChange={e => setSort(e.target.value)}>
          <option value="status">Sort: Status</option>
          <option value="name">Sort: Name</option>
          <option value="recent">Sort: Newest</option>
          <option value="billing">Sort: Billing</option>
        </select>
      </div>

      {/* Client cards */}
      {filtered.length === 0 ? (
        <Empty icon="â" title="No clients match" hint="Try clearing filters or search." />
      ) : (
        <div className="space-y-3">
          {filtered.map(c => <ClientCard key={c.id} client={c} onOpen={() => setOpenId(c.id)} canSeeFinancials={canSeeFinancials} />)}
        </div>
      )}

      {openId && <ClientDetailDrawer clientId={openId} onClose={() => setOpenId(null)} />}
      {showAddForm && <AddClientModal onClose={() => setShowAddForm(false)} onSave={handleAddClient} />}
    </>
  );
}

/* âââ Client Card âââ */

function ClientCard({ client, onOpen, canSeeFinancials }) {
  const config = STATUS_CONFIG[client.status] || STATUS_CONFIG.green;
  const loom = client.timers?.loom;
  const call = client.timers?.call_offer;

  return (
    <button onClick={onOpen}
      className="w-full flex items-center gap-5 rounded-2xl border border-ink-700 bg-ink-900/40 px-5 py-4 hover:bg-ink-800/60 hover:border-ink-600 cursor-pointer transition text-left group">

      {/* Status indicator */}
      <div className={`h-3 w-3 rounded-full shrink-0 ${config.bg} ring-4 ${config.ring}`} />

      {/* Client info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-base text-slate-100 group-hover:text-white transition truncate">{client.name}</span>
          <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border shrink-0 ${config.pill}`}>
            {config.label}
          </span>
        </div>
        <div className="flex items-center gap-4 mt-1.5 text-sm text-slate-500">
          {canSeeFinancials && client.mrr ? (
            <span className="text-emerald-400/80 font-medium tabular-nums">{fmtMRR(client.mrr, { compact: true })}/mo</span>
          ) : null}
          {client.email && <span className="truncate">{client.email}</span>}
          {!client.email && client.company && <span className="truncate">{client.company}</span>}
        </div>
      </div>

      {/* Timer badges */}
      <div className="flex items-center gap-3 shrink-0">
        {loom && (
          <TimerBadge
            label="Loom"
            value={fmtRelative(loom.next_due_at)}
            overdue={loom.is_overdue}
            icon="ð¥"
          />
        )}
        {call && (
          <TimerBadge
            label="Call"
            value={fmtRelative(call.next_due_at)}
            overdue={call.is_overdue}
            icon="ð"
          />
        )}
      </div>

      {/* Billing */}
      {client.billing_date && (
        <div className="text-right shrink-0 hidden md:block">
          <div className="text-xs text-slate-500">Billing</div>
          <div className="text-sm font-medium tabular-nums text-slate-300">{client.billing_date}{ord(client.billing_date)} Â· {client.days_until_billing}d</div>
        </div>
      )}

      <span className="text-slate-600 group-hover:text-slate-400 transition text-lg shrink-0">â</span>
    </button>
  );
}

function TimerBadge({ label, value, overdue, icon }) {
  return (
    <div className={`px-3 py-1.5 rounded-lg text-center border ${
      overdue
        ? 'border-rose-500/30 bg-rose-500/10'
        : 'border-ink-700 bg-ink-800/60'
    }`}>
      <div className="text-[10px] text-slate-500 leading-none mb-0.5">{icon} {label}</div>
      <div className={`text-xs font-medium tabular-nums ${overdue ? 'text-rose-300' : 'text-slate-300'}`}>{value}</div>
    </div>
  );
}

function FilterPill({ label, count, active, onClick, color }) {
  const colorClasses = {
    emerald: active ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300' : '',
    amber: active ? 'bg-amber-500/20 border-amber-500/50 text-amber-300' : '',
    rose: active ? 'bg-rose-500/20 border-rose-500/50 text-rose-300' : '',
    slate: active ? 'bg-slate-500/20 border-slate-500/50 text-slate-300' : '',
  };

  return (
    <button onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition ${
        active
          ? (colorClasses[color] || 'bg-ink-700 border-ink-500 text-white')
          : 'border-ink-700 bg-ink-900/40 text-slate-400 hover:bg-ink-800 hover:text-slate-300'
      }`}>
      {label}
      <span className={`tabular-nums text-xs px-1.5 py-0.5 rounded-full ${
        active ? 'bg-white/10' : 'bg-ink-800'
      }`}>{count}</span>
    </button>
  );
}

function ord(n) {
  const s = ['th','st','nd','rd'], v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

/* âââ Add Client Modal âââ */

const PACKAGES = ['12', '30', '60'];
const STATUSES = [
  { value: 'green', label: 'Healthy' },
  { value: 'yellow', label: 'Watch' },
  { value: 'red', label: 'At Risk' },
  { value: 'churned', label: 'Churned' }
];
const STRIPE_STATUSES = ['Active', 'Cancelled', 'PIF', 'Not Setup Yet'];
const COHORTS = [
  { value: 'new', label: 'New (onboarding)' },
  { value: 'active_happy', label: 'Active (happy)' },
  { value: 'active_hands_off', label: 'Active (hands-off)' },
  { value: 'cancelling', label: 'Cancelling' },
  { value: 'churned', label: 'Churned' }
];

function AddClientModal({ onClose, onSave }) {
  const { canSeeFinancials } = useRole();
  const [form, setForm] = useState({
    name: '', email: '', company: '',
    package: '12', billing_date: '', mrr: '',
    status: 'green', cohort: 'new',
    stripe_status: 'Not Setup Yet',
    content_source: '',
    onboarding_flag: true,
    action_needed: '', reason: ''
  });
  const [saving, setSaving] = useState(false);

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    const payload = { ...form };
    if (payload.billing_date) payload.billing_date = Number(payload.billing_date);
    else delete payload.billing_date;
    if (payload.mrr) payload.mrr = Number(payload.mrr);
    else delete payload.mrr;
    for (const k of Object.keys(payload)) {
      if (payload[k] === '') delete payload[k];
    }
    await onSave(payload);
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px] animate-fade" />
      <form onSubmit={handleSubmit}
        className="relative bg-ink-900 border border-ink-700 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto animate-slide-up"
        onClick={e => e.stopPropagation()}>

        <div className="sticky top-0 bg-ink-900/95 backdrop-blur border-b border-ink-800 px-6 py-4 flex items-center justify-between z-10 rounded-t-2xl">
          <h2 className="text-lg font-semibold text-slate-100">Add New Client</h2>
          <button type="button" onClick={onClose}
            className="text-slate-400 hover:text-white w-8 h-8 grid place-items-center rounded-lg hover:bg-ink-800">â</button>
        </div>

        <div className="px-6 py-5 space-y-5">
          <fieldset>
            <legend className="text-[11px] uppercase tracking-wider text-slate-500 mb-3">Client Information</legend>
            <div className="space-y-3">
              <FormField label="Client name *" required>
                <input className="input w-full rounded-xl" placeholder="e.g. Acme Corp" autoFocus
                  value={form.name} onChange={e => set('name', e.target.value)} required />
              </FormField>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Email">
                  <input className="input w-full rounded-xl" type="email" placeholder="client@example.com"
                    value={form.email} onChange={e => set('email', e.target.value)} />
                </FormField>
                <FormField label="Company">
                  <input className="input w-full rounded-xl" placeholder="Company name"
                    value={form.company} onChange={e => set('company', e.target.value)} />
                </FormField>
              </div>
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-[11px] uppercase tracking-wider text-slate-500 mb-3">Package & Billing</legend>
            <div className={`grid ${canSeeFinancials ? 'grid-cols-3' : 'grid-cols-2'} gap-3`}>
              <FormField label="Package (reels/mo)">
                <select className="input w-full rounded-xl" value={form.package} onChange={e => set('package', e.target.value)}>
                  {PACKAGES.map(p => <option key={p} value={p}>{p} reels</option>)}
                  <option value="custom">Custom</option>
                </select>
              </FormField>
              {canSeeFinancials && (
                <FormField label="MRR ($)">
                  <input className="input w-full rounded-xl" type="number" min="0" step="100" placeholder="3300"
                    value={form.mrr} onChange={e => set('mrr', e.target.value)} />
                </FormField>
              )}
              <FormField label="Billing day (1-31)">
                <input className="input w-full rounded-xl" type="number" min="1" max="31" placeholder="15"
                  value={form.billing_date} onChange={e => set('billing_date', e.target.value)} />
              </FormField>
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-[11px] uppercase tracking-wider text-slate-500 mb-3">Status & Lifecycle</legend>
            <div className="grid grid-cols-3 gap-3">
              <FormField label="Health status">
                <select className="input w-full rounded-xl" value={form.status} onChange={e => set('status', e.target.value)}>
                  {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </FormField>
              <FormField label="Cohort">
                <select className="input w-full rounded-xl" value={form.cohort} onChange={e => set('cohort', e.target.value)}>
                  {COHORTS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </FormField>
              <FormField label="Stripe status">
                <select className="input w-full rounded-xl" value={form.stripe_status} onChange={e => set('stripe_status', e.target.value)}>
                  {STRIPE_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </FormField>
            </div>
            <div className="mt-3">
              <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                <input type="checkbox" checked={form.onboarding_flag}
                  onChange={e => set('onboarding_flag', e.target.checked)}
                  className="rounded border-ink-600 bg-ink-800 text-emerald-500 focus:ring-emerald-500/30" />
                Client is in onboarding
              </label>
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-[11px] uppercase tracking-wider text-slate-500 mb-3">Content & Notes</legend>
            <div className="space-y-3">
              <FormField label="Content source">
                <input className="input w-full rounded-xl" placeholder="e.g. Client sends raw footage via Google Drive"
                  value={form.content_source} onChange={e => set('content_source', e.target.value)} />
              </FormField>
              <FormField label="Action needed">
                <input className="input w-full rounded-xl" placeholder="Initial action items for this client"
                  value={form.action_needed} onChange={e => set('action_needed', e.target.value)} />
              </FormField>
              <FormField label="Notes / reason">
                <textarea className="input w-full h-16 rounded-xl" placeholder="Any additional contextâ¦"
                  value={form.reason} onChange={e => set('reason', e.target.value)} />
              </FormField>
            </div>
          </fieldset>
        </div>

        <div className="sticky bottom-0 bg-ink-900/95 backdrop-blur border-t border-ink-800 px-6 py-4 flex items-center justify-end gap-3 rounded-b-2xl">
          <button type="button" onClick={onClose} className="btn btn-sm rounded-xl">Cancel</button>
          <button type="submit" disabled={saving || !form.name.trim()} className="btn btn-primary btn-sm px-6 rounded-xl">
            {saving ? 'Addingâ¦' : 'Add Client'}
          </button>
        </div>
      </form>
    </div>
  );
}

function FormField({ label, required, children }) {
  return (
    <label className="block">
      <span className="text-xs text-slate-400 mb-1 block">{label}</span>
      {children}
    </label>
  );
}
