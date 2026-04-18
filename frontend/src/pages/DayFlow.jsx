import { useEffect, useState, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useToast } from '../lib/toast.jsx';
import { useData } from '../lib/data.jsx';
import ClientDetailDrawer from '../components/ClientDetailDrawer.jsx';
import { Skeleton } from '../components/primitives.jsx';
import { useRole } from '../lib/role.jsx';

const MASTER_SHEET_URL = 'https://docs.google.com/spreadsheets/d/15AvJa6_1Dfe0UTmOjoFLeKHD-GzHuRasUG7ZZ2kYWG0/edit?usp=sharing';

/* ââââââ SOP-aligned phases for Operations Manager ââââââ */

const PHASES = [
  {
    n: 1,
    label: 'Urgent Triage',
    icon: '\uD83D\uDD34',
    time: '15\u201330 min',
    desc: 'Handle critical flags, Slack, Discord, and Slack Pulse',
    steps: [
      { key: 'triage', label: 'Open CRM Triage board \u2014 handle all urgent flags', link: '/board', linkLabel: 'Open Triage' },
      { key: 'slack', label: 'Check Slack DMs and notifications \u2014 respond to anything urgent within 1 hour', external: true },
      { key: 'discord', label: 'Check Discord notifications \u2014 unblock overnight contractor requests immediately', external: true },
      { key: 'pulse', label: 'Check Slack Pulse for AI-flagged urgent items', link: '/slack-pulse', linkLabel: 'Open Slack Pulse' },
    ]
  },
  {
    n: 2,
    label: 'Client Channel Sweep',
    icon: '\uD83D\uDCAC',
    time: '15\u201330 min',
    desc: 'Go through Slack channels and ensure nothing is unanswered',
    steps: [
      { key: 'channels', label: 'Go through each client Slack channel \u2014 ensure no messages are unanswered', external: true },
      { key: 'relay', label: 'Check that Emmanuel relayed any client feedback to Discord', external: true },
      { key: 'touchpoints', label: 'Add touchpoints where needed \u2014 log notes in the CRM', link: '/clients', linkLabel: 'Open Clients' },
      { key: 'flag', label: 'Flag any retention concerns for the Retention Specialist via CRM', link: '/clients', linkLabel: 'Open Clients' },
    ]
  },
  {
    n: 3,
    label: 'Master Sheet Audit',
    icon: '\uD83D\uDCCA',
    time: '30\u201360 min',
    desc: 'Audit each client for quota pacing, SLA compliance, and statuses',
    steps: [
      { key: 'quota', label: 'For each client: check quota pacing, SLA compliance, CD started within 24h', externalUrl: MASTER_SHEET_URL, linkLabel: 'Open Master Sheet' },
      { key: 'reels', label: 'Verify 2+ reels ready to post and statuses are accurate', externalUrl: MASTER_SHEET_URL, linkLabel: 'Open Master Sheet' },
      { key: 'message', label: 'Message anyone who is behind \u2014 raise CRM flags as needed', external: true },
    ]
  },
  {
    n: 4,
    label: 'Ongoing Monitoring',
    icon: '\uD83D\uDCE1',
    time: 'Rest of day',
    desc: 'Monitor Slack, Discord, and CRM throughout the day',
    steps: [
      { key: 'monitor_slack', label: 'Monitor Slack and Discord throughout the day', external: true },
      { key: 'activity', label: 'Check CRM Activity feed periodically', link: '/activity', linkLabel: 'Open Activity' },
      { key: 'incoming', label: 'Handle incoming requests as they arrive', external: true },
    ]
  },
];

export default function DayFlow() {
  const [day, setDay] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [activePhase, setActivePhase] = useState(null);
  const { show } = useToast();
  const { refresh } = useData();
  const nav = useNavigate();

  const load = useCallback(async () => {
    try { setDay(await api.day()); } catch (e) { show({ message: e.message }); }
  }, [show]);

  useEffect(() => { load(); }, [load]);

  // Auto-expand the first incomplete phase
  useEffect(() => {
    if (!day) return;
    const { routine } = day;
    if (!routine.phase_1_done) setActivePhase(1);
    else if (!routine.phase_2_done) setActivePhase(2);
    else if (!routine.phase_3_done) setActivePhase(3);
    else if (!routine.phase_4_done) setActivePhase(4);
    else setActivePhase(null);
  }, [day]);

  if (!day) return <div className="space-y-4 py-8"><Skeleton rows={4} className="h-24 w-full rounded-xl" /></div>;

  const { greeting, ops_queue, billing, routine, counts } = day;
  const userFirst = (day.user_email || '').split('@')[0].split('.')[0];
  const { canSeeFinancials } = useRole();

  const phaseDone = [routine.phase_1_done, routine.phase_2_done, routine.phase_3_done, routine.phase_4_done];
  const completedPhases = phaseDone.filter(Boolean).length;
  const allPhases = completedPhases === 4;

  async function togglePhase(n) {
    await api.togglePhase(n);
    load();
  }

  return (
    <>
      {/* ââ Hero ââ */}
      <section className="mb-8 pt-2">
        <h1 className="text-4xl font-bold tracking-tight text-slate-50 capitalize">
          {greeting}, {userFirst}.
        </h1>
        <p className="text-lg text-slate-400 mt-2">
          {allPhases
            ? "You\u2019re done for the day. Nice work. \uD83C\uDF32"
            : "Here\u2019s your daily game plan \u2014 work through each phase."}
        </p>
      </section>

      {/* ââ Overall progress bar ââ */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-slate-300">Daily progress</span>
          <span className="text-sm tabular-nums text-slate-400">{completedPhases}/4 phases</span>
        </div>
        <div className="h-3 rounded-full bg-ink-800 overflow-hidden">
          <div className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-all duration-700 ease-out rounded-full"
            style={{ width: `${(completedPhases / 4) * 100}%` }} />
        </div>
      </section>

      {/* ââ Billing banner ââ */}
      {billing.is_check_day && (
        <button onClick={() => nav('/billing')}
          className="mb-6 w-full rounded-2xl border-2 border-amber-500/40 bg-amber-500/5 px-6 py-5 text-left hover:bg-amber-500/10 transition flex items-center gap-4">
          <span className="text-3xl">{'\uD83D\uDCB3'}</span>
          <div className="flex-1">
            <div className="text-lg font-semibold text-amber-200">Billing verification day</div>
            <div className="text-sm text-amber-300/70 mt-0.5">Today is the {billing.relevant_day}{suffix(billing.relevant_day)} \u2014 run your billing checklist.</div>
          </div>
          <span className="text-xl text-amber-200">{'\u2192'}</span>
        </button>
      )}

      {/* ââââââ PHASE CARDS ââââââ */}
      <section className="space-y-4 mb-10">
        {PHASES.map((phase, i) => {
          const done = phaseDone[i];
          const isActive = activePhase === phase.n;

          return (
            <div key={phase.n}
              className={`rounded-2xl border-2 transition-all duration-300 overflow-hidden ${
                done
                  ? 'border-emerald-500/30 bg-emerald-500/5'
                  : isActive
                    ? 'border-slate-500/40 bg-ink-900/80'
                    : 'border-ink-700 bg-ink-900/40'
              }`}>
              {/* Phase header â always visible */}
              <button
                onClick={() => setActivePhase(isActive ? null : phase.n)}
                className="w-full flex items-center gap-4 px-6 py-5 text-left hover:bg-white/[0.02] transition">
                {/* Status circle */}
                <div className={`h-12 w-12 rounded-full grid place-items-center text-xl shrink-0 ${
                  done
                    ? 'bg-emerald-500 text-white'
                    : 'bg-ink-800 border-2 border-ink-600'
                }`}>
                  {done ? '\u2713' : phase.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <span className={`text-lg font-semibold ${done ? 'text-emerald-300' : 'text-slate-100'}`}>
                      {phase.label}
                    </span>
                    {!done && (
                      <span className="text-xs text-slate-500">{phase.time}</span>
                    )}
                    {/* Show urgent count badge on Phase 1 */}
                    {phase.n === 1 && counts.urgent > 0 && !done && (
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/20 text-rose-300 tabular-nums">
                        {counts.urgent} flag{counts.urgent !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-slate-500 mt-0.5">{phase.desc}</div>
                </div>
                <span className={`text-lg text-slate-500 transition-transform ${isActive ? 'rotate-180' : ''}`}>{'\u25BE'}</span>
              </button>

              {/* Phase content â expanded */}
              {isActive && !done && (
                <div className="px-6 pb-6 border-t border-ink-700/50">
                  {/* Phase 1 gets urgent flag cards if any exist */}
                  {phase.n === 1 && (ops_queue || []).length > 0 && (
                    <div className="pt-5 mb-4">
                      <div className="text-xs uppercase tracking-wider text-rose-400/70 font-medium mb-3">
                        Urgent flags ({ops_queue.length})
                      </div>
                      <div className="space-y-2">
                        {ops_queue.map(item => (
                          <button key={item.id} onClick={() => setOpenId(item.client.id)}
                            className="w-full flex items-center gap-4 rounded-xl border border-rose-500/30 bg-rose-500/5 px-5 py-3 hover:bg-rose-500/10 transition text-left group">
                            <div className="h-8 w-8 rounded-full bg-rose-500/15 grid place-items-center shrink-0">
                              <span className="text-sm">{'\uD83D\uDD34'}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-sm text-slate-100 group-hover:text-white transition">{item.next_action.label}</div>
                              <div className="text-xs text-rose-300/60 mt-0.5">{item.next_action.hint}</div>
                            </div>
                            <span className="text-slate-500 group-hover:text-slate-300 transition">{'\u2192'}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Onboarding clients in Phase 1 if any */}
                  {phase.n === 1 && (day.onboarding_heroes || []).length > 0 && (
                    <div className="pt-3 mb-4">
                      <div className="text-xs uppercase tracking-wider text-emerald-400/70 font-medium mb-3">
                        Onboarding clients ({day.onboarding_heroes.length})
                      </div>
                      <div className="space-y-2">
                        {day.onboarding_heroes.map(h => (
                          <button key={h.client.id} onClick={() => setOpenId(h.client.id)}
                            className="w-full flex items-center gap-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-5 py-3 hover:brightness-110 transition text-left">
                            <div className="h-8 w-8 rounded-full bg-emerald-500/15 grid place-items-center shrink-0">
                              <span className="text-sm">{'\uD83C\uDF31'}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-sm text-slate-100">{h.client.name}</div>
                              <div className="text-xs text-emerald-300/70 mt-0.5">
                                {h.completed}/{h.total} steps
                                {h.next_step && <span className="text-slate-500 ml-2">Next: {h.next_step.label}</span>}
                              </div>
                            </div>
                            <div className="w-16 shrink-0">
                              <div className="h-1.5 rounded-full bg-ink-800 overflow-hidden">
                                <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${(h.completed / h.total) * 100}%` }} />
                              </div>
                            </div>
                            <span className="text-slate-500">{'\u2192'}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Checklist steps */}
                  <div className={`space-y-3 ${phase.n === 1 && ((ops_queue || []).length > 0 || (day.onboarding_heroes || []).length > 0) ? '' : 'pt-5'}`}>
                    <div className="text-xs uppercase tracking-wider text-slate-500 font-medium mb-2">Checklist</div>
                    {phase.steps.map(step => (
                      <div key={step.key}
                        className="flex items-start gap-3 rounded-xl border border-ink-700/50 bg-ink-800/30 px-5 py-4">
                        <div className="h-5 w-5 rounded-full border-2 border-ink-600 shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-slate-200 leading-relaxed">{step.label}</div>
                        </div>
                        {step.link && (
                          <Link to={step.link}
                            className="text-xs text-emerald-400 hover:text-emerald-300 transition shrink-0 whitespace-nowrap">
                            {step.linkLabel} {'\u2192'}
                          </Link>
                        )}
                        {step.externalUrl && (
                          <a href={step.externalUrl} target="_blank" rel="noreferrer"
                            className="text-xs text-emerald-400 hover:text-emerald-300 transition shrink-0 whitespace-nowrap">
                            {step.linkLabel} {'\u2197'}
                          </a>
                        )}
                      </div>
                    ))}
                  </div>

                  <button onClick={() => togglePhase(phase.n)}
                    className="mt-6 w-full btn btn-primary py-3 text-base font-semibold rounded-xl">
                    Mark Phase {phase.n} Complete {'\u2713'}
                  </button>
                </div>
              )}

              {/* Completed phase â collapsed summary */}
              {done && isActive && (
                <div className="px-6 pb-5 border-t border-emerald-500/20">
                  <div className="flex items-center justify-between pt-4">
                    <span className="text-sm text-emerald-300/70">Phase complete</span>
                    <button onClick={() => togglePhase(phase.n)} className="text-xs text-slate-500 hover:text-slate-300 transition">
                      Undo
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </section>

      {openId && <ClientDetailDrawer clientId={openId} onClose={() => { setOpenId(null); load(); }} />}
    </>
  );
}

function suffix(n) { return n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'; }
