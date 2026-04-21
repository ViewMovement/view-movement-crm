import { useState } from 'react';
import { api } from '../lib/api.js';
import { PIPELINE_SECTIONS, getStepNumber, countCompleted, TOTAL_STEPS, getClientStage } from '../lib/lifecycle.js';

const SECTION_COLORS = {
  onboarding:        { bg: 'bg-emerald-500/8',  check: 'bg-emerald-500 border-emerald-500', text: 'text-emerald-300', header: 'text-emerald-400' },
  first_week:        { bg: 'bg-blue-500/8',     check: 'bg-blue-500 border-blue-500',       text: 'text-blue-300',    header: 'text-blue-400' },
  retention:         { bg: 'bg-violet-500/8',    check: 'bg-violet-500 border-violet-500',   text: 'text-violet-300',  header: 'text-violet-400' },
  handoff:           { bg: 'bg-amber-500/8',     check: 'bg-amber-500 border-amber-500',     text: 'text-amber-300',   header: 'text-amber-400' },
  retention_handoff: { bg: 'bg-pink-500/8',      check: 'bg-pink-500 border-pink-500',       text: 'text-pink-300',    header: 'text-pink-400' },
  twelve_month:      { bg: 'bg-cyan-500/8',      check: 'bg-cyan-500 border-cyan-500',       text: 'text-cyan-300',    header: 'text-cyan-400' },
};

export default function LifecycleChecklist({ clientId, steps: lifecycleSteps, onChange }) {
  const [saving, setSaving] = useState(null);
  const [error, setError] = useState(null);
  const [collapsed, setCollapsed] = useState({});

  const currentSteps = lifecycleSteps || {};
  const completed = countCompleted(currentSteps);
  const currentStage = getClientStage(currentSteps);
  const allDone = completed === TOTAL_STEPS;

  async function toggle(step, currentValue) {
    setError(null);
    setSaving(step);
    try {
      await api.toggleLifecycleStep(clientId, step, !currentValue);
      onChange?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(null);
    }
  }

  const toggleSection = (id) => setCollapsed(prev => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold">Lifecycle Progress</h3>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
          allDone ? 'bg-emerald-500/15 text-emerald-300'
            : completed > 0 ? 'bg-amber-500/15 text-amber-300'
            : 'bg-slate-500/15 text-slate-400'
        }`}>
          {completed}/{TOTAL_STEPS}
        </span>
      </div>

      {/* Overall progress bar */}
      <div className="h-2 rounded-full bg-ink-700 mb-5 overflow-hidden">
        <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-violet-500 to-cyan-500 transition-all duration-500"
          style={{ width: `${(completed / TOTAL_STEPS) * 100}%` }} />
      </div>

      {error && (
        <div className="mb-3 text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded px-3 py-2">
          {error}
        </div>
      )}

      <div className="space-y-3">
        {PIPELINE_SECTIONS.map(section => {
          const colors = SECTION_COLORS[section.id];
          const sectionDone = section.steps.filter(s => currentSteps[s.key]).length;
          const sectionTotal = section.steps.length;
          const sectionComplete = sectionDone === sectionTotal;
          const isCurrent = section.id === currentStage;
          const isCollapsed = collapsed[section.id];

          return (
            <div key={section.id} className={`rounded-lg border ${isCurrent ? 'border-slate-600' : 'border-ink-700'} overflow-hidden`}>
              <button
                onClick={() => toggleSection(section.id)}
                className={`w-full text-left px-3 py-2.5 flex items-center gap-3 transition-colors ${
                  isCurrent ? colors.bg : 'bg-ink-900/30 hover:bg-ink-900/50'
                }`}
              >
                <svg className={`w-3 h-3 text-slate-400 transition-transform ${isCollapsed ? '' : 'rotate-90'}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
                <div className="flex-1 flex items-center justify-between">
                  <span className={`text-sm font-medium ${sectionComplete ? 'text-slate-500 line-through' : colors.header}`}>
                    {section.label}
                  </span>
                  <span className={`text-xs ${sectionComplete ? 'text-emerald-400' : 'text-slate-500'}`}>
                    {sectionDone}/{sectionTotal}
                  </span>
                </div>
              </button>

              {!isCollapsed && (
                <div className="px-1 py-1">
                  {section.steps.map(s => {
                    const checked = !!currentSteps[s.key];
                    const isSaving = saving === s.key;
                    const stepNum = getStepNumber(s.key);

                    return (
                      <button
                        key={s.key}
                        onClick={() => !isSaving && toggle(s.key, checked)}
                        disabled={isSaving}
                        className={`w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                          checked ? 'hover:bg-ink-900/40' : 'hover:bg-ink-900/60'
                        }`}
                      >
                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                          checked ? colors.check : 'border-slate-600'
                        }`}>
                          {checked && <span className="text-white text-xs font-bold">&#10003;</span>}
                          {isSaving && <span className="text-slate-300 text-xs animate-pulse">...</span>}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-500 font-mono w-5">{stepNum}</span>
                            <span className={`text-sm ${checked ? 'text-slate-500 line-through' : 'text-slate-200'}`}>
                              {s.label}
                            </span>
                          </div>
                          <div className="text-xs text-slate-500 ml-7 truncate">{s.desc}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
