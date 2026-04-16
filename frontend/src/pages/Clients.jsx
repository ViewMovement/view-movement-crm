import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useData } from '../lib/data.jsx';
import { api } from '../lib/api.js';
import { useToast } from '../lib/toast.jsx';
import ClientDetailDrawer from '../components/ClientDetailDrawer.jsx';
import { Empty, SectionHeader, Skeleton, statusMeta, StatusDot, TabIntro } from '../components/primitives.jsx';
import { fmtRelative, fmtMRR } from '../lib/format.js';

const STATUS_ORDER = { churned: 0, red: 1, yellow: 2, green: 3 };

export default function Clients() {
  const { clients, loading, refresh } = useData();
  const { show } = useToast();
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

  if (loading) return <Skeleton rows={12} className="h-11 w-full" />;

  return (
    <>
      <TabIntro id="clients" title="What is this?">
        Your full client roster. Filter by health (<span className="text-emerald-300">Healthy</span> / <span className="text-amber-300">Watch</span> / <span className="text-rose-300">At Risk</span> / Churned), search by name or email, and sort by status, recency, or next billing date. Click a row to open the detail drawer where you can take actions, add notes, change status, and see every touchpoint.
      </TabIntro>
      <SectionHeader
        title="Clients"
        subtitle={`${counts.all} total · ${counts.green} healthy · ${counts.yellow} watch · ${counts.red} at risk · ${counts.churned} churned`}
        right={
          <button onClick={() => setShowAddForm(true)} className="btn btn-primary btn-sm">+ Add Client</button>
        }
      />

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Chip label={`All (${counts.all})`}   active={filter === 'all'}     onClick={() => setFilter('all')} />
        <Chip label={`Healthy (${counts.green})`}  active={filter === 'green'}   onClick={() => setFilter('green')} />
        <Chip label={`Watch (${counts.yellow})`}   active={filter === 'yellow'}  onClick={() => setFilter('yellow')} />
        <Chip label={`At Risk (${counts.red})`}    active={filter === 'red'}     onClick={() => setFilter('red')} />
        <Chip label={`Churned (${counts.churned})`} active={filter === 'churned'} onClick={() => setFilter('churned')} />
        <div className="flex-1" />
        <input className="input w-64" placeholder="Search name, email, company…"
          value={query} onChange={e => setQuery(e.target.value)} />
        <select className="input w-40" value={sort} onChange={e => setSort(e.target.value)}>
          <option value="status">Sort: Status</option>
          <option value="name">Sort: Name</option>
          <option value="recent">Sort: Newest</option>
          <option value="billing">Sort: Billing</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <Empty icon="◎" title="No clients match" hint="Try clearing filters or search." />
      ) : (
        <div className="rounded-xl border border-ink-800 overflow-hidden divide-y divide-ink-800">
          <div className="grid grid-cols-12 gap-3 px-4 py-2.5 text-[11px] uppercase tracking-wide text-slate-500 bg-ink-900/60">
            <div className="col-span-4">Client</div>
            <div className="col-span-2">Status</div>
            <div className="col-span-2">Next Loom</div>
            <div className="col-span-2">Next Call</div>
            <div className="col-span-2 text-right">Billing</div>
          </div>
          {filtered.map(c => <Row key={c.id} client={c} onOpen={() => setOpenId(c.id)} />)}
        </div>
      )}

      {openId && <ClientDetailDrawer clientId={openId} onClose={() => setOpenId(null)} />}
      {showAddForm && <AddClientModal onClose={() => setShowAddForm(false)} onSave={handleAddClient} />}
    </>
  );
}

/* ─── Add Client Modal ─── */

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
    // Convert numeric fields
    if (payload.billing_date) payload.billing_date = Number(payload.billing_date);
    else delete payload.billing_date;
    if (payload.mrr) payload.mrr = Number(payload.mrr);
    else delete payload.mrr;
    // Clean empty strings
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
        className="relative bg-ink-900 border border-ink-700 rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto animate-slide-up"
        onClick={e => e.stopPropagation()}>

        <div className="sticky top-0 bg-ink-900/95 backdrop-blur border-b border-ink-800 px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-lg font-semibold text-slate-100">Add New Client</h2>
          <button type="button" onClick={onClose}
            className="text-slate-400 hover:text-white w-8 h-8 grid place-items-center rounded hover:bg-ink-800">✕</button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Core info */}
          <fieldset>
            <legend className="text-[11px] uppercase tracking-wider text-slate-500 mb-3">Client Information</legend>
            <div className="space-y-3">
              <FormField label="Client name *" required>
                <input className="input w-full" placeholder="e.g. Acme Corp" autoFocus
                  value={form.name} onChange={e => set('name', e.target.value)} required />
              </FormField>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Email">
                  <input className="input w-full" type="email" placeholder="client@example.com"
                    value={form.email} onChange={e => set('email', e.target.value)} />
                </FormField>
                <FormField label="Company">
                  <input className="input w-full" placeholder="Company name"
                    value={form.company} onChange={e => set('company', e.target.value)} />
                </FormField>
              </div>
            </div>
          </fieldset>

          {/* Package & billing */}
          <fieldset>
            <legend className="text-[11px] uppercase tracking-wider text-slate-500 mb-3">Package & Billing</legend>
            <div className="grid grid-cols-3 gap-3">
              <FormField label="Package (reels/mo)">
                <select className="input w-full" value={form.package} onChange={e => set('package', e.target.value)}>
                  {PACKAGES.map(p => <option key={p} value={p}>{p} reels</option>)}
                  <option value="custom">Custom</option>
                </select>
              </FormField>
              <FormField label="MRR ($)">
                <input className="input w-full" type="number" min="0" step="100" placeholder="3300"
                  value={form.mrr} onChange={e => set('mrr', e.target.value)} />
              </FormField>
              <FormField label="Billing day (1-31)">
                <input className="input w-full" type="number" min="1" max="31" placeholder="15"
                  value={form.billing_date} onChange={e => set('billing_date', e.target.value)} />
              </FormField>
            </div>
          </fieldset>

          {/* Status & lifecycle */}
          <fieldset>
            <legend className="text-[11px] uppercase tracking-wider text-slate-500 mb-3">Status & Lifecycle</legend>
            <div className="grid grid-cols-3 gap-3">
              <FormField label="Health status">
                <select className="input w-full" value={form.status} onChange={e => set('status', e.target.value)}>
                  {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </FormField>
              <FormField label="Cohort">
                <select className="input w-full" value={form.cohort} onChange={e => set('cohort', e.target.value)}>
                  {COHORTS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </FormField>
              <FormField label="Stripe status">
                <select className="input w-full" value={form.stripe_status} onChange={e => set('stripe_status', e.target.value)}>
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

          {/* Content & notes */}
          <fieldset>
            <legend className="text-[11px] uppercase tracking-wider text-slate-500 mb-3">Content & Notes</legend>
            <div className="space-y-3">
              <FormField label="Content source">
                <input className="input w-full" placeholder="e.g. Client sends raw footage via Google Drive"
                  value={form.content_source} onChange={e => set('content_source', e.target.value)} />
              </FormField>
              <FormField label="Action needed">
                <input className="input w-full" placeholder="Initial action items for this client"
                  value={form.action_needed} onChange={e => set('action_needed', e.target.value)} />
              </FormField>
              <FormField label="Notes / reason">
                <textarea className="input w-full h-16" placeholder="Any additional context…"
                  value={form.reason} onChange={e => set('reason', e.target.value)} />
              </FormField>
            </div>
          </fieldset>
        </div>

        <div className="sticky bottom-0 bg-ink-900/95 backdrop-blur border-t border-ink-800 px-6 py-4 flex items-center justify-end gap-3">
          <button type="button" onClick={onClose} className="btn btn-sm">Cancel</button>
          <button type="submit" disabled={saving || !form.name.trim()} className="btn btn-primary btn-sm px-6">
            {saving ? 'Adding…' : 'Add Client'}
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

/* ─── Table components ─── */

function Chip({ label, active, onClick }) {
  return <button onClick={onClick} className={`chip ${active ? 'chip-active' : ''}`}>{label}</button>;
}

function ord(n) {
  const s = ['th','st','nd','rd'], v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

function Row({ client, onOpen }) {
  const loom = client.timers?.loom;
  const call = client.timers?.call_offer;
  return (
    <div onClick={onOpen}
         className="grid grid-cols-12 gap-3 px-4 py-3 hover:bg-ink-800/60 cursor-pointer items-center text-sm transition">
      <div className="col-span-4 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <StatusDot status={client.status} label={false} />
          <span className="font-medium truncate">{client.name}</span>
        </div>
        <div className="text-xs text-slate-500 truncate">
          {client.mrr ? <span className="text-emerald-400/80 font-medium tabular-nums mr-2">{fmtMRR(client.mrr, { compact: true })}/mo</span> : null}
          <span>{client.email || client.company || '—'}</span>
        </div>
      </div>
      <div className="col-span-2 text-slate-300">{statusMeta(client.status).label}</div>
      <div className={`col-span-2 tabular-nums ${loom?.is_overdue ? 'text-rose-300' : 'text-slate-300'}`}>
        {loom ? fmtRelative(loom.next_due_at) : '—'}
      </div>
      <div className={`col-span-2 tabular-nums ${call?.is_overdue ? 'text-rose-300' : 'text-slate-300'}`}>
        {call ? fmtRelative(call.next_due_at) : '—'}
      </div>
      <div className="col-span-2 text-right text-slate-300 tabular-nums">
        {client.billing_date ? `${client.billing_date}${ord(client.billing_date)} · ${client.days_until_billing}d` : '—'}
      </div>
    </div>
  );
}
