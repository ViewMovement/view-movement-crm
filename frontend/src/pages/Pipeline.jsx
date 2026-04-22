import { useEffect, useState, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { PIPELINE_SECTIONS, getClientStage, countSectionCompleted, countCompleted, TOTAL_STEPS } from '../lib/lifecycle.js';
import StatusBadge from '../components/StatusBadge.jsx';

const SECTION_COLORS = {
  onboarding:        { bg: 'bg-emerald-500/8',  border: 'border-emerald-500/30', text: 'text-emerald-400', pill: 'bg-emerald-500/15 text-emerald-300', bar: 'bg-emerald-500' },
  first_week:        { bg: 'bg-blue-500/8',     border: 'border-blue-500/30',    text: 'text-blue-400',    pill: 'bg-blue-500/15 text-blue-300',       bar: 'bg-blue-500' },
  retention:         { bg: 'bg-violet-500/8',    border: 'border-violet-500/30',  text: 'text-violet-400',  pill: 'bg-violet-500/15 text-violet-300',   bar: 'bg-violet-500' },
  handoff:           { bg: 'bg-amber-500/8',     border: 'border-amber-500/30',   text: 'text-amber-400',   pill: 'bg-amber-500/15 text-amber-300',     bar: 'bg-amber-500' },
  retention_handoff: { bg: 'bg-pink-500/8',      border: 'border-pink-500/30',    text: 'text-pink-400',    pill: 'bg-pink-500/15 text-pink-300',       bar: 'bg-pink-500' },
  twelve_month:      { bg: 'bg-cyan-500/8',      border: 'border-cyan-500/30',    text: 'text-cyan-400',    pill: 'bg-cyan-500/15 text-cyan-300',       bar: 'bg-cyan-500' },
};

export default function Pipeline() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState({});

  const load = useCallback(async () => {
    const c = await api.listClients();
    setClients(c);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggle = (id) => setCollapsed(prev => ({ ...prev, [id]: !prev[id] }));

  // Group clients into pipeline sections
  const grouped = useMemo(() => {
    const groups = {};
    for (const section of PIPELINE_SECTIONS) groups[section.id] = [];
    groups.complete = [];

    for (const client of clients) {
      // Skip churned clients - they're not in the active pipeline
      if (client.status === 'churned') continue;
      const stage = getClientStage(client.lifecycle_steps);
      if (groups[stage]) groups[stage].push(client);
    }
    return groups;
  }, [clients]);

  const churnedCount = useMemo(() => clients.filter(c => c.status === 'churned').length, [clients]);

  if (loading) return <div className="text-slate-400">Loading pipeline...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between mb-2">
        <div>
          <h2 className="text-lg font-semibold">Client Pipeline</h2>
          <p className="text-sm text-slate-400">
            {clients.length} total clients across {PIPELINE_SECTIONS.length} stages
            {churnedCount > 0 && <> &middot; {churnedCount} churned (hidden)</>}
          </p>
        </div>
      </div>

      {PIPELINE_SECTIONS.map((section, sIdx) => {
        const sectionClients = grouped[section.id] || [];
        const isCollapsed = collapsed[section.id];
        const colors = SECTION_COLORS[section.id];
        const stepOffset = PIPELINE_SECTIONS.slice(0, sIdx).reduce((n, s) => n + s.steps.length, 0);

        return (
          <section key={section.id}>
            <button
              onClick={() => toggle(section.id)}
              className={`w-full text-left rounded-xl border ${colors.border} ${colors.bg} px-5 py-4 transition-colors hover:brightness-110`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <svg className={`w-4 h-4 ${colors.text} transition-transform ${isCollapsed ? '' : 'rotate-90'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{section.label}</span>
                      <span className={`pill ${colors.pill}`}>{sectionClients.length}</span>
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      Steps {stepOffset + 1}&#8211;{stepOffset + section.steps.length} &middot; {section.description}
                    </div>
                  </div>
                </div>
              </div>
            </button>

            {!isCollapsed && sectionClients.length > 0 && (
              <div className="mt-2 space-y-2 pl-2">
                {sectionClients.map(client => (
                  <PipelineCard
                    key={client.id}
                    client={client}
                    section={section}
                    colors={colors}
                    onChange={load}
                  />
                ))}
              </div>
            )}

            {!isCollapsed && sectionClients.length === 0 && (
              <div className="mt-2 pl-2 text-sm text-slate-500 py-3 px-4">
                No clients in this stage
              </div>
            )}
          </section>
        );
      })}

      {grouped.complete?.length > 0 && (
        <section>
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-5 py-4">
            <div className="flex items-center gap-2">
              <span className="text-emerald-400">&#10003;</span>
              <span className="font-semibold">Complete</span>
              <span className="pill bg-emerald-500/15 text-emerald-300">{grouped.complete.length}</span>
            </div>
            <div className="text-xs text-slate-400 mt-0.5">All 22 lifecycle steps finished</div>
          </div>
          <div className="mt-2 space-y-2 pl-2">
            {grouped.complete.map(client => (
              <Link key={client.id} to={`/clients/${client.id}`}
                className="card px-4 py-3 flex items-center justify-between hover:bg-ink-700/50 transition-colors block">
                <div className="flex items-center gap-3">
                  <span className="text-emerald-400 text-sm">&#10003;</span>
                  <span className="font-medium">{client.name}</span>
                </div>
                <StatusBadge status={client.status} />
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function PipelineCard({ client, section, colors, onChange }) {
  const steps = client.lifecycle_steps || {};
  const done = section.steps.filter(s => steps[s.key]).length;
  const total = section.steps.length;
  const pct = Math.round((done / total) * 100);

  async function setStatus(status) {
    await api.updateClient(client.id, { status });
    onChange?.();
  }

  return (
    <Link to={`/clients/${client.id}`}
      className="card px-4 py-3 flex items-center gap-4 hover:bg-ink-700/50 transition-colors block">
      {/* Progress ring */}
      <div className="shrink-0 relative w-10 h-10">
        <svg viewBox="0 0 36 36" className="w-10 h-10 -rotate-90">
          <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeWidth="3" className="text-ink-700" />
          <circle cx="18" cy="18" r="15" fill="none" strokeWidth="3"
            className={colors.text}
            strokeDasharray={`${pct * 0.942} 100`}
            strokeLinecap="round" />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-slate-300">
          {done}/{total}
        </span>
      </div>

      {/* Client info */}
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{client.name}</div>
        <div className="text-xs text-slate-400 truncate">
          {client.package ? `${client.package} reels` : '-'}
          {client.company && <> &middot; {client.company}</>}
          {' '}&middot; {countCompleted(client.lifecycle_steps)}/{TOTAL_STEPS} total steps
        </div>
        {/* Section step progress bar */}
        <div className="mt-1.5 flex gap-1">
          {section.steps.map(s => (
            <div key={s.key}
              className={`h-1.5 rounded-full flex-1 ${steps[s.key] ? colors.bar : 'bg-ink-700'}`}
              title={`${s.label}: ${steps[s.key] ? 'Done' : 'Pending'}`} />
          ))}
        </div>
      </div>

      {/* Status */}
      <div className="shrink-0" onClick={e => e.preventDefault()}>
        <StatusBadge status={client.status} onChange={setStatus} />
      </div>
    </Link>
  );
}
import { useEffect, useState, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { PIPELINE_SECTIONS, getClientStage, countSectionCompleted, countCompleted, TOTAL_STEPS } from '../lib/lifecycle.js';
import StatusBadge from '../components/StatusBadge.jsx';

const SECTION_COLORS = {
  onboarding:        { bg: 'bg-emerald-500/8',  border: 'border-emerald-500/30', text: 'text-emerald-400', pill: 'bg-emerald-500/15 text-emerald-300', bar: 'bg-emerald-500' },
  first_week:        { bg: 'bg-blue-500/8',     border: 'border-blue-500/30',    text: 'text-blue-400',    pill: 'bg-blue-500/15 text-blue-300',       bar: 'bg-blue-500' },
  retention:         { bg: 'bg-violet-500/8',    border: 'border-violet-500/30',  text: 'text-violet-400',  pill: 'bg-violet-500/15 text-violet-300',   bar: 'bg-violet-500' },
  handoff:           { bg: 'bg-amber-500/8',     border: 'border-amber-500/30',   text: 'text-amber-400',   pill: 'bg-amber-500/15 text-amber-300',     bar: 'bg-amber-500' },
  retention_handoff: { bg: 'bg-pink-500/8',      border: 'border-pink-500/30',    text: 'text-pink-400',    pill: 'bg-pink-500/15 text-pink-300',       bar: 'bg-pink-500' },
  twelve_month:      { bg: 'bg-cyan-500/8',      border: 'border-cyan-500/30',    text: 'text-cyan-400',    pill: 'bg-cyan-500/15 text-cyan-300',       bar: 'bg-cyan-500' },
};

export default function Pipeline() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState({});

  const load = useCallback(async () => {
    const c = await api.listClients();
    setClients(c);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggle = (id) => setCollapsed(prev => ({ ...prev, [id]: !prev[id] }));

  // Group clients into pipeline sections
  const grouped = useMemo(() => {
    const groups = {};
    for (const section of PIPELINE_SECTIONS) groups[section.id] = [];
    groups.complete = [];

    for (const client of clients) {
      // Skip churned clients - they're not in the active pipeline
      if (client.status === 'churned') continue;
      const stage = getClientStage(client.lifecycle_steps);
      if (groups[stage]) groups[stage].push(client);
    }
    return groups;
  }, [clients]);

  const churnedCount = useMemo(() => clients.filter(c => c.status === 'churned').length, [clients]);

  if (loading) return <div className="text-slate-400">Loading pipeline...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between mb-2">
        <div>
          <h2 className="text-lg font-semibold">Client Pipeline</h2>
          <p className="text-sm text-slate-400">
            {clients.length} total clients across {PIPELINE_SECTIONS.length} stages
            {churnedCount > 0 && <> {'\u00B7'} {churnedCount} churned (hidden)</>}
          </p>
        </div>
      </div>

      {PIPELINE_SECTIONS.map((section, sIdx) => {
        const sectionClients = grouped[section.id] || [];
        const isCollapsed = collapsed[section.id];
        const colors = SECTION_COLORS[section.id];
        const stepOffset = PIPELINE_SECTIONS.slice(0, sIdx).reduce((n, s) => n + s.steps.length, 0);

        return (
          <section key={section.id}>
            <button
              onClick={() => toggle(section.id)}
              className={`w-full text-left rounded-xl border ${colors.border} ${colors.bg} px-5 py-4 transition-colors hover:brightness-110`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <svg className={`w-4 h-4 ${colors.text} transition-transform ${isCollapsed ? '' : 'rotate-90'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{section.label}</span>
                      <span className={`pill ${colors.pill}`}>{sectionClients.length}</span>
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      Steps {stepOffset + 1}{'\u2013'}{stepOffset + section.steps.length} {'\u00B7'} {section.description}
                    </div>
                  </div>
                </div>
              </div>
            </button>

            {!isCollapsed && sectionClients.length > 0 && (
              <div className="mt-2 space-y-2 pl-2">
                {sectionClients.map(client => (
                  <PipelineCard
                    key={client.id}
                    client={client}
                    section={section}
                    colors={colors}
                    onChange={load}
                  />
                ))}
              </div>
            )}

            {!isCollapsed && sectionClients.length === 0 && (
              <div className="mt-2 pl-2 text-sm text-slate-500 py-3 px-4">
                No clients in this stage
              </div>
            )}
          </section>
        );
      })}

      {grouped.complete?.length > 0 && (
        <section>
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-5 py-4">
            <div className="flex items-center gap-2">
              <span className="text-emerald-400">&#10003;</span>
              <span className="font-semibold">Complete</span>
              <span className="pill bg-emerald-500/15 text-emerald-300">{grouped.complete.length}</span>
            </div>
            <div className="text-xs text-slate-400 mt-0.5">All 22 lifecycle steps finished</div>
          </div>
          <div className="mt-2 space-y-2 pl-2">
            {grouped.complete.map(client => (
              <Link key={client.id} to={`/clients/${client.id}`}
                className="card px-4 py-3 flex items-center justify-between hover:bg-ink-700/50 transition-colors block">
                <div className="flex items-center gap-3">
                  <span className="text-emerald-400 text-sm">&#10003;</span>
                  <span className="font-medium">{client.name}</span>
                </div>
                <StatusBadge status={client.status} />
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function PipelineCard({ client, section, colors, onChange }) {
  const steps = client.lifecycle_steps || {};
  const done = section.steps.filter(s => steps[s.key]).length;
  const total = section.steps.length;
  const pct = Math.round((done / total) * 100);

  async function setStatus(status) {
    await api.updateClient(client.id, { status });
    onChange?.();
  }

  return (
    <Link to={`/clients/${client.id}`}
      className="card px-4 py-3 flex items-center gap-4 hover:bg-ink-700/50 transition-colors block">
      {/* Progress ring */}
      <div className="shrink-0 relative w-10 h-10">
        <svg viewBox="0 0 36 36" className="w-10 h-10 -rotate-90">
          <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeWidth="3" className="text-ink-700" />
          <circle cx="18" cy="18" r="15" fill="none" strokeWidth="3"
            className={colors.text}
            strokeDasharray={`${pct * 0.942} 100`}
            strokeLinecap="round" />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-slate-300">
          {done}/{total}
        </span>
      </div>

      {/* Client info */}
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{client.name}</div>
        <div className="text-xs text-slate-400 truncate">
          {client.package ? `${client.package} reels` : '-'}
          {client.company && <> {'\u00B7'} {client.company}</>}
          {' '}{'\u00B7'} {countCompleted(client.lifecycle_steps)}/{TOTAL_STEPS} total steps
        </div>
        {/* Section step progress bar */}
        <div className="mt-1.5 flex gap-1">
          {section.steps.map(s => (
            <div key={s.key}
              className={`h-1.5 rounded-full flex-1 ${steps[s.key] ? colors.bar : 'bg-ink-700'}`}
              title={`${s.label}: ${steps[s.key] ? 'Done' : 'Pending'}`} />
          ))}
        </div>
      </div>

      {/* Status */}
      <div className="shrink-0" onClick={e => e.preventDefault()}>
        <StatusBadge status={client.status} onChange={setStatus} />
      </div>
    </Link>
  );
}
