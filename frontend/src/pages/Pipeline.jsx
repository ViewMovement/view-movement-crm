import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import {
  PIPELINE_SECTIONS, getClientStage, countCompleted, countSectionCompleted, TOTAL_STEPS
} from '../lib/lifecycle.js';

const COLOR_MAP = {
  emerald: { header: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400', ring: 'text-emerald-400', bar: 'bg-emerald-400' },
  amber:   { header: 'bg-amber-500/10 border-amber-500/30 text-amber-400',     ring: 'text-amber-400',   bar: 'bg-amber-400' },
  pink:    { header: 'bg-pink-500/10 border-pink-500/30 text-pink-400',        ring: 'text-pink-400',    bar: 'bg-pink-400' },
  blue:    { header: 'bg-blue-500/10 border-blue-500/30 text-blue-400',        ring: 'text-blue-400',    bar: 'bg-blue-400' },
  violet:  { header: 'bg-violet-500/10 border-violet-500/30 text-violet-400',  ring: 'text-violet-400',  bar: 'bg-violet-400' },
  cyan:    { header: 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400',        ring: 'text-cyan-400',    bar: 'bg-cyan-400' },
};

const STATUS_DOT = {
  green: 'bg-emerald-400', yellow: 'bg-yellow-400', red: 'bg-red-400', churned: 'bg-slate-500',
};

export default function Pipeline() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState({});

  useEffect(() => {
    api.getClients().then(setClients).catch(console.error).finally(() => setLoading(false));
  }, []);

  // Group non-churned clients by lifecycle stage
  const grouped = useMemo(() => {
    const map = {};
    PIPELINE_SECTIONS.forEach(s => { map[s.id] = []; });
    map['complete'] = [];
    clients
      .filter(c => c.status !== 'churned')
      .forEach(c => {
        const stage = getClientStage(c.lifecycle_steps);
        if (map[stage]) map[stage].push(c);
      });
    return map;
  }, [clients]);

  function toggleCollapse(id) {
    setCollapsed(prev => ({ ...prev, [id]: !prev[id] }));
  }

  if (loading) return <p className="text-slate-400">Loading pipeline...</p>;

  // Compute step ranges for labels
  let stepOffset = 0;
  const sectionRanges = PIPELINE_SECTIONS.map(s => {
    const start = stepOffset + 1;
    stepOffset += s.steps.length;
    return { start, end: stepOffset };
  });

  return (
    <div className="max-w-4xl mx-auto">
      <h2 className="text-xl font-bold text-white mb-6">Pipeline</h2>
      <div className="space-y-4">
        {PIPELINE_SECTIONS.map((section, si) => {
          const sectionClients = grouped[section.id] || [];
          const colors = COLOR_MAP[section.color] || COLOR_MAP.emerald;
          const range = sectionRanges[si];
          const isCollapsed = collapsed[section.id];

          return (
            <div key={section.id} className="rounded-xl border border-ink-700 overflow-hidden">
              {/* Section header */}
              <button
                onClick={() => toggleCollapse(section.id)}
                className={'w-full flex items-center justify-between px-4 py-3 border-b ' + colors.header}
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold">{section.label}</span>
                  <span className="text-xs opacity-70">Steps {range.start}&ndash;{range.end}</span>
                  <span className="text-xs opacity-50">{section.description}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium">{sectionClients.length} client{sectionClients.length !== 1 ? 's' : ''}</span>
                  <span className="text-xs">{isCollapsed ? '\u25B6' : '\u25BC'}</span>
                </div>
              </button>
              {/* Client cards */}
              {!isCollapsed && sectionClients.length > 0 && (
                <div className="divide-y divide-ink-700/50">
                  {sectionClients.map(c => {
                    const totalDone = countCompleted(c.lifecycle_steps);
                    const sectionDone = countSectionCompleted(c.lifecycle_steps, section.id);
                    const sectionTotal = section.steps.length;
                    const pct = Math.round(sectionDone / sectionTotal * 100);

                    return (
                      <Link
                        key={c.id}
                        to={'/clients/' + c.id}
                        className="flex items-center gap-4 px-4 py-3 hover:bg-ink-900/50 transition-colors"
                      >
                        {/* Progress ring (simple text) */}
                        <div className={'text-center min-w-[40px] ' + colors.ring}>
                          <div className="text-lg font-bold leading-none">{sectionDone}</div>
                          <div className="text-[10px] opacity-70">/{sectionTotal}</div>
                        </div>
                        {/* Client info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={'w-2 h-2 rounded-full shrink-0 ' + (STATUS_DOT[c.status] || '')}></span>
                            <span className="text-sm font-medium text-white truncate">{c.name}</span>
                            {c.package && <span className="text-xs text-slate-500">{c.package} reels</span>}
                          </div>
                          {c.company && <p className="text-xs text-slate-500 mt-0.5 truncate">{c.company}</p>}
                        </div>
                        {/* Total progress */}
                        <div className="text-right shrink-0">
                          <span className="text-xs text-slate-400">{totalDone}/{TOTAL_STEPS} total</span>
                          <div className="w-20 bg-ink-700 rounded-full h-1 mt-1">
                            <div className={colors.bar + ' h-1 rounded-full transition-all'} style={{ width: pct + '%' }}></div>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
              {!isCollapsed && sectionClients.length === 0 && (
                <p className="text-xs text-slate-500 px-4 py-3">No clients in this stage</p>
              )}
            </div>
          );
        })}

        {/* Complete section */}
        {(grouped.complete || []).length > 0 && (
          <div className="rounded-xl border border-ink-700 overflow-hidden">
            <div className="px-4 py-3 bg-slate-500/10 border-b border-slate-500/30 flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-400">Complete</span>
              <span className="text-xs text-slate-500">{grouped.complete.length} client{grouped.complete.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="divide-y divide-ink-700/50">
              {grouped.complete.map(c => (
                <Link key={c.id} to={'/clients/' + c.id} className="flex items-center gap-4 px-4 py-3 hover:bg-ink-900/50">
                  <span className="text-emerald-400 text-lg">&#10003;</span>
                  <span className="text-sm text-white">{c.name}</span>
                  {c.company && <span className="text-xs text-slate-500">{c.company}</span>}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
