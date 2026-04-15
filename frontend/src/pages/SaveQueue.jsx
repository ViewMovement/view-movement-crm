import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useToast } from '../lib/toast.jsx';
import { useData } from '../lib/data.jsx';
import ClientDetailDrawer from '../components/ClientDetailDrawer.jsx';
import { SectionHeader, Empty, Skeleton, StatusDot } from '../components/primitives.jsx';

const COLUMNS = [
  { key: 'proposed',    title: 'Proposed',    hint: 'New save opportunity.' },
  { key: 'in_progress', title: 'In Progress', hint: 'Actively working it.' },
  { key: 'saved',       title: 'Saved',       hint: 'Client retained.' },
  { key: 'lost',        title: 'Lost',        hint: 'Final churn.' }
];

export default function SaveQueue() {
  const [plans, setPlans] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [newFor, setNewFor] = useState(null);
  const { show } = useToast();
  const { clients, refresh } = useData();

  async function load() {
    const p = await api.listSavePlans();
    setPlans(p);
  }
  useEffect(() => { load(); }, []);

  async function move(id, status) {
    await api.updateSavePlan(id, { status });
    load(); refresh(true);
    show({ message: `→ ${status.replace('_', ' ')}` });
  }

  async function createPlan(client_id, proposal) {
    await api.createSavePlan({ client_id, proposal });
    setNewFor(null);
    load(); refresh(true);
    show({ message: 'Save plan created.' });
  }

  if (plans === null) return <div className="space-y-3"><Skeleton rows={6} className="h-14 w-full" /></div>;

  const byStatus = Object.fromEntries(COLUMNS.map(c => [c.key, []]));
  for (const p of plans) (byStatus[p.status] = byStatus[p.status] || []).push(p);

  // Eligible clients to open a plan for: cancelling, red, or churned without an open plan.
  const openPlanClientIds = new Set(plans.filter(p => p.status === 'proposed' || p.status === 'in_progress').map(p => p.client_id));
  const candidates = (clients || []).filter(c =>
    (c.cohort === 'cancelling' || c.status === 'red' || c.status === 'churned') &&
    !openPlanClientIds.has(c.id)
  );

  return (
    <>
      <SectionHeader
        title="Save Queue"
        subtitle={`${byStatus.proposed.length + byStatus.in_progress.length} active · ${byStatus.saved.length} saved · ${byStatus.lost.length} lost`}
        right={
          <button className="btn btn-primary btn-sm" onClick={() => setNewFor('pick')}>+ New plan</button>
        }
      />

      <div className="grid md:grid-cols-4 gap-4">
        {COLUMNS.map(col => (
          <div key={col.key} className="rounded-lg border border-ink-700 bg-ink-900/40 p-3 min-h-[400px]">
            <div className="flex items-baseline justify-between mb-1">
              <div className="font-medium text-sm text-slate-100">{col.title}</div>
              <span className="text-xs text-slate-500 tabular-nums">{byStatus[col.key].length}</span>
            </div>
            <div className="text-[11px] text-slate-500 mb-3">{col.hint}</div>
            <div className="space-y-2">
              {byStatus[col.key].length === 0 && (
                <div className="text-xs text-slate-500 italic py-6 text-center">—</div>
              )}
              {byStatus[col.key].map(p => (
                <div key={p.id} className="rounded-md border border-ink-700 bg-ink-900 p-3">
                  <button className="text-left w-full" onClick={() => setOpenId(p.client_id)}>
                    <div className="flex items-center gap-2 mb-1">
                      <StatusDot status={p.clients?.status} label={false} />
                      <span className="font-medium text-sm truncate">{p.clients?.name || '—'}</span>
                    </div>
                  </button>
                  {p.proposal && <div className="text-xs text-slate-400 line-clamp-3 mb-2">{p.proposal}</div>}
                  <div className="flex items-center gap-1 text-[11px]">
                    {COLUMNS.filter(c => c.key !== p.status).map(c => (
                      <button key={c.key} onClick={() => move(p.id, c.key)}
                        className="text-slate-400 hover:text-slate-100 px-1.5 py-0.5 rounded hover:bg-ink-700">
                        →{c.title.split(' ')[0]}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {newFor === 'pick' && (
        <NewPlanDialog candidates={candidates} onClose={() => setNewFor(null)} onCreate={createPlan} />
      )}

      {openId && <ClientDetailDrawer clientId={openId} onClose={() => setOpenId(null)} />}
    </>
  );
}

function NewPlanDialog({ candidates, onClose, onCreate }) {
  const [clientId, setClientId] = useState('');
  const [proposal, setProposal] = useState('');
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-ink-900 border border-ink-700 rounded-xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
        <div className="font-semibold mb-3">New save plan</div>
        <label className="text-xs text-slate-400 block mb-1">Client</label>
        <select value={clientId} onChange={e => setClientId(e.target.value)}
          className="input w-full mb-3">
          <option value="">Select a client…</option>
          {candidates.map(c => <option key={c.id} value={c.id}>{c.name} — {c.status}</option>)}
        </select>
        <label className="text-xs text-slate-400 block mb-1">Proposal</label>
        <textarea value={proposal} onChange={e => setProposal(e.target.value)}
          placeholder="What's the pitch to save them?" className="input w-full h-24 mb-4" />
        <div className="flex justify-end gap-2">
          <button className="btn btn-sm" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary btn-sm" disabled={!clientId} onClick={() => onCreate(clientId, proposal)}>Create</button>
        </div>
      </div>
    </div>
  );
}
