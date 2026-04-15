import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useToast } from '../lib/toast.jsx';
import ClientDetailDrawer from '../components/ClientDetailDrawer.jsx';
import { SectionHeader, Empty, Skeleton, StatusDot } from '../components/primitives.jsx';
import { fmtRelative } from '../lib/format.js';

export default function Flags() {
  const [state, setState] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [filter, setFilter] = useState('all');
  const { show } = useToast();

  async function load() { setState(await api.listFlags()); }
  useEffect(() => { load(); }, []);

  async function resolve(id) {
    await api.resolveFlag(id);
    load();
    show({ message: 'Resolved.' });
  }

  if (!state) return <div className="space-y-3"><Skeleton rows={6} className="h-14 w-full" /></div>;
  const types = state.types || {};
  const flags = state.flags || [];
  const shown = filter === 'all' ? flags : flags.filter(f => f.type === filter);

  const typeCounts = {};
  for (const f of flags) typeCounts[f.type] = (typeCounts[f.type] || 0) + 1;

  return (
    <>
      <SectionHeader title="Flags" subtitle={`${flags.length} open across ${Object.keys(typeCounts).length} type${Object.keys(typeCounts).length === 1 ? '' : 's'}`} />

      <div className="flex flex-wrap gap-1.5 mb-5">
        <FilterChip active={filter === 'all'} label={`All · ${flags.length}`} onClick={() => setFilter('all')} />
        {Object.keys(types).map(k => (
          <FilterChip key={k} active={filter === k}
            label={`${types[k].label} · ${typeCounts[k] || 0}`}
            onClick={() => setFilter(k)} />
        ))}
      </div>

      {shown.length === 0 ? (
        <Empty icon="✓" title="No flags." hint="Nothing needs a playbook right now." />
      ) : (
        <div className="space-y-3">
          {shown.map(f => {
            const def = types[f.type] || { label: f.type, playbook: [] };
            return (
              <div key={f.id} className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <StatusDot status={f.clients?.status} label={false} />
                      <button onClick={() => setOpenId(f.client_id)} className="font-medium hover:underline">{f.clients?.name || '—'}</button>
                      <span className="text-xs text-slate-400">· {def.label}</span>
                      <span className="text-xs text-slate-500 ml-auto">{fmtRelative(f.created_at)}</span>
                    </div>
                    {f.detail && <div className="text-sm text-slate-300 mb-2">{f.detail}</div>}
                    {def.playbook?.length > 0 && (
                      <ol className="text-xs text-slate-400 space-y-0.5 list-decimal list-inside">
                        {def.playbook.map((p, i) => <li key={i}>{p}</li>)}
                      </ol>
                    )}
                  </div>
                  <button className="btn btn-sm" onClick={() => resolve(f.id)}>Resolve</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {openId && <ClientDetailDrawer clientId={openId} onClose={() => setOpenId(null)} />}
    </>
  );
}

function FilterChip({ active, label, onClick }) {
  return (
    <button onClick={onClick}
      className={`chip ${active ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300' : ''}`}>
      {label}
    </button>
  );
}
