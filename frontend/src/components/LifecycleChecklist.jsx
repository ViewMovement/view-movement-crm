import { useState } from 'react';
import { api } from '../lib/api.js';
import { PIPELINE_SECTIONS, getStepNumber, countCompleted, TOTAL_STEPS, getClientStage } from '../lib/lifecycle.js';

const SECTION_COLORS = {
  emerald: { border: 'border-emerald-500/30', bg: 'bg-emerald-500/10', text: 'text-emerald-400', check: 'accent-emerald-400' },
  amber:   { border: 'border-amber-500/30',   bg: 'bg-amber-500/10',   text: 'text-amber-400',   check: 'accent-amber-400' },
  pink:    { border: 'border-pink-500/30',     bg: 'bg-pink-500/10',    text: 'text-pink-400',     check: 'accent-pink-400' },
  blue:    { border: 'border-blue-500/30',     bg: 'bg-blue-500/10',    text: 'text-blue-400',     check: 'accent-blue-400' },
  violet:  { border: 'border-violet-500/30',   bg: 'bg-violet-500/10',  text: 'text-violet-400',   check: 'accent-violet-400' },
  cyan:    { border: 'border-cyan-500/30',     bg: 'bg-cyan-500/10',    text: 'text-cyan-400',     check: 'accent-cyan-400' },
};

export default function LifecycleChecklist({ clientId, lifecycleSteps, onUpdate }) {
  const [saving, setSaving] = useState(null);
  const steps = lifecycleSteps || {};
  const completed = countCompleted(steps);
  const stage = getClientStage(steps);

  async function toggle(stepKey) {
    const newValue = !steps[stepKey];
    setSaving(stepKey);
    try {
      const updated = await api.toggleLifecycleStep(clientId, stepKey, newValue);
      if (onUpdate) onUpdate(updated);
    } catch (err) {
      console.error('Toggle error:', err);
    }
    setSaving(null);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-white">Client Lifecycle</h3>
        <span className="text-xs text-slate-400">{completed}/{TOTAL_STEPS} steps</span>
      </div>
      <div className="w-full bg-ink-700 rounded-full h-1.5 mb-4">
        <div
          className="bg-emerald-400 h-1.5 rounded-full transition-all"
          style={{ width: (completed / TOTAL_STEPS * 100) + '%' }}
        ></div>
      </div>
      <div className="space-y-3">
        {PIPELINE_SECTIONS.map(section => {
          const colors = SECTION_COLORS[section.color] || SECTION_COLORS.emerald;
          const isCurrent = stage === section.id;
          return (
            <div key={section.id} className={'rounded-lg border p-3 ' + colors.border + ' ' + (isCurrent ? colors.bg : '')}>
              <div className="flex items-center gap-2 mb-2">
                <span className={'text-xs font-semibold uppercase tracking-wide ' + colors.text}>{section.label}</span>
                <span className="text-xs text-slate-500">{section.description}</span>
              </div>
              <div className="space-y-1">
                {section.steps.map(step => {
                  const done = !!steps[step.key];
                  const isSaving = saving === step.key;
                  return (
                    <label
                      key={step.key}
                      className={'flex items-start gap-2 py-1 px-1 rounded cursor-pointer hover:bg-white/5 ' + (done ? 'opacity-60' : '')}
                    >
                      <input
                        type="checkbox"
                        checked={done}
                        disabled={isSaving}
                        onChange={() => toggle(step.key)}
                        className={'mt-0.5 ' + colors.check}
                      />
                      <div>
                        <span className={'text-sm ' + (done ? 'line-through text-slate-500' : 'text-slate-200')}>
                          {getStepNumber(step.key)}. {step.label}
                        </span>
                        <p className="text-xs text-slate-500">{step.desc}</p>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
