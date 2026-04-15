import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useData } from '../lib/data.jsx';
import ClientDetailDrawer from '../components/ClientDetailDrawer.jsx';
import { Empty, SectionHeader, Skeleton, statusMeta, StatusDot } from '../components/primitives.jsx';
import { fmtRelative } from '../lib/format.js';

const STATUS_ORDER = { churned: 0, red: 1, yellow: 2, green: 3 };

export default function Clients() {
  const { clients, loading } = useData();
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('status'); // status | name | recent | billing
  const [openId, setOpenId] = useState(null);

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

  if (loading) return <Skeleton rows={12} className="h-11 w-full" />;

  return (
    <>
      <SectionHeader
        title="Clients"
        subtitle={`${counts.all} total · ${counts.green} healthy · ${counts.yellow} watch · ${counts.red} at risk · ${counts.churned} churned`}
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
    </>
  );
}

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
        <div className="text-xs text-slate-500 truncate">{client.email || client.company || '—'}</div>
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
