import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useToast } from '../lib/toast.jsx';
import { useData } from '../lib/data.jsx';
import { statusMeta, StatusDot, Skeleton } from './primitives.jsx';
import { fmtDate, fmtRelative, touchpointLabel, fmtMRR } from '../lib/format.js';
import HealthRing from './HealthRing.jsx';
import Sparkline from './Sparkline.jsx';
import { useRole } from '../lib/role.jsx';

const SITUATION_TYPES = [
  { key: 'missed_posting',        label: 'Missed posting' },
  { key: 'overdue_batch',         label: 'Overdue batch' },
  { key: 'non_responsive',        label: 'Non-responsive 48h+' },
  { key: 'delayed_onboarding',    label: 'Delayed onboarding' },
  { key: 'dark_contractor',       label: 'Dark contractor' },
  { key: 'retention_opportunity', label: 'Retention opportunity' },
  { key: 'sheet_mismatch',        label: 'Sheet mismatch' },
  { key: 'scripted_only',         label: 'Scripted only' },
  { key: 'out_of_scope',          label: 'Out of scope' },
  { key: 'failed_payment',        label: 'Failed payment' },
  { key: 'month10_review',       label: 'Month 10 retention review' },
  { key: 'month10_escalation',   label: 'Month 10 escalation' }
];

const RETENTION_REFERRAL_TYPES = [
  { key: 'views_complaint',        label: 'Views / performance complaint', icon: '📉' },
  { key: 'engagement_drop',        label: 'Engagement drop',              icon: '📭' },
  { key: 'at_risk',                label: 'At-risk / churn signal',       icon: '🚨' },
  { key: 'goal_adjustment_needed', label: 'Goal adjustment needed',       icon: '🎯' }
];

export default function ClientDetailDrawer({ clientId, onClose }) {
  const [client, setClient] = useState(null);
  const [note, setNote] = useState('');
  const [onboardingDefs, setOnboardingDefs] = useState([]);
  const [closeoutDefs, setCloseoutDefs] = useState([]);
  const [lifecycleDefs, setLifecycleDefs] = useState([]);
  const [openFlags, setOpenFlags] = useState([]);
  const [health, setHealth] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [looms, setLooms] = useState([]);
  const [showLoomModal, setShowLoomModal] = useState(false);
  const [showRetentionFlag, setShowRetentionFlag] = useState(false);
  const [retentionFlagDetail, setRetentionFlagDetail] = useState('');
  const [loomCadence, setLoomCadence] = useState(null);
  const { refresh } = useData();
  const { show } = useToast();
  const { canSeeFinancials } = useRole();

  const load = useCallback(async () => {
    if (!clientId) return;
    setClient(null);
    const [c, o, co, fl, lc] = await Promise.all([
      api.getClient(clientId),
      api.onboardingSteps().catch(() => []),
      api.closeoutSteps().catch(() => []),
      api.listFlags().catch(() => ({ flags: [] })),
      api.lifecycleSteps().catch(() => [])
    ]);
    setClient(c); setOnboardingDefs(o); setCloseoutDefs(co); setLifecycleDefs(lc);
    setOpenFlags((fl?.flags || []).filter(f => f.client_id === clientId));
    api.clientHealth(clientId).then(setHealth).catch(() => setHealth(null));
    api.clientReviews(clientId).then(setReviews).catch(() => setReviews([]));
    api.clientLooms(clientId).then(setLooms).catch(() => setLooms([]));
    api.getLoomCadence(clientId).then(setLoomCadence).catch(() => setLoomCadence(null));
  }, [clientId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape' && clientId) onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [clientId, onClose]);

  if (!clientId) return null;

  async function doAction(type, label) {
    await api.action(clientId, type);
    refresh(true); load();
    show({
      message: `${label} logged for ${client?.name || 'client'}.`,
      action: {
        label: 'Undo',
        onClick: async () => { await api.undoLast(clientId); refresh(true); load(); show({ message: 'Undone.' }); }
      }
    });
  }

  async function snooze(timerType, days) {
    await api.snooze(clientId, timerType, days);
    refresh(true); load();
    show({ message: `Snoozed ${days}d.` });
  }

  async function saveNote() {
    if (!note.trim()) return;
    await api.addNote(clientId, note.trim());
    setNote(''); load(); refresh(true);
    show({ message: 'Note saved.' });
  }

  async function setStatus(status) {
    await api.updateClient(clientId, { status });
    load(); refresh(true);
    show({ message: `Status → ${statusMeta(status).label}` });
  }

  async function setCohort(cohort) {
    await api.setCohort(clientId, cohort);
    load(); refresh(true);
    show({ message: `Cohort → ${cohort.replace(/_/g, ' ')}` });
  }

  async function saveField(field, value) {
    const payload = { [field]: value === undefined ? null : value };
    // For success_definition, also stamp the captured_at timestamp on first save
    if (field === 'success_definition' && value && !client?.success_definition) {
      payload.success_definition_captured_at = new Date().toISOString();
    }
    if (field === 'success_definition' && value) {
      payload.success_definition_last_reviewed_at = new Date().toISOString();
    }
    await api.updateClient(clientId, payload);
    load(); refresh(true);
    const labels = { mrr: 'MRR', billing_date: 'Billing date', package: 'Package', success_definition: 'Success definition', baseline_metrics: 'Baseline metrics', service_start_date: 'Service start date' };
    show({ message: `${labels[field] || field} updated.` });
  }

  async function toggleOnboardingStep(step) {
    try {
      await api.toggleOnboarding(clientId, step);
      load(); refresh(true);
    } catch (e) {
      if (e.message?.includes('gate_blocked') || e.message?.includes('Success definition')) {
        show({ message: 'Fill in the Success Definition above before completing this step.', tone: 'warning' });
      } else {
        show({ message: 'Error: ' + e.message });
      }
    }
  }

  async function toggleLifecycleStep(step) {
    try {
      await api.toggleLifecycle(clientId, step);
      load(); refresh(true);
    } catch (e) {
      if (e.message?.includes('gate_blocked') || e.message?.includes('Success definition')) {
        show({ message: 'Fill in the Success Definition above before completing this step.', tone: 'warning' });
      } else {
        show({ message: 'Error: ' + e.message });
      }
    }
  }

  async function toggleCloseoutStep(step) {
    await api.toggleCloseout(clientId, step);
    load(); refresh(true);
  }

  async function addFlag(type) {
    const result = await api.createFlag({ client_id: clientId, type });
    load(); refresh(true);
    if (result?.save_plan) {
      show({ message: 'Flag raised + save plan auto-created.' });
    } else {
      show({ message: 'Flag raised.' });
    }
  }

  async function flagForRetention(type) {
    const detail = retentionFlagDetail.trim() || undefined;
    const result = await api.createFlag({ client_id: clientId, type, detail });
    setRetentionFlagDetail('');
    setShowRetentionFlag(false);
    load(); refresh(true);
    const label = RETENTION_REFERRAL_TYPES.find(t => t.key === type)?.label || type;
    show({ message: result?.save_plan
      ? `Flagged for retention: ${label} + save plan created.`
      : `Flagged for retention: ${label}.`
    });
  }

  async function resolveFlag(id) {
    await api.resolveFlag(id);
    load(); refresh(true);
    show({ message: 'Flag resolved.' });
  }

  return (
    <div className="fixed inset-0 z-40 flex" onClick={onClose}>
      <div className="flex-1 bg-black/50 backdrop-blur-[2px] animate-fade" />
      <div
        className="w-full max-w-xl bg-ink-900 border-l border-ink-700 h-screen overflow-y-auto animate-slide-left"
        onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-ink-900/95 backdrop-blur border-b border-ink-800 px-6 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-3 min-w-0">
            {client && <StatusDot status={client.status} label={false} />}
            <div className="min-w-0">
              <div className="font-semibold truncate">{client?.name || 'Loading…'}</div>
              <div className="text-xs text-slate-400 truncate">
                {client?.email || client?.company || '—'}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {client && (
              <Link to={`/clients/${client.id}`} onClick={onClose}
                    className="text-xs text-slate-400 hover:text-slate-200 underline underline-offset-2">
                Full page
              </Link>
            )}
            <button onClick={onClose} className="text-slate-400 hover:text-white w-8 h-8 grid place-items-center rounded hover:bg-ink-800">✕</button>
          </div>
        </div>

        {!client ? (
          <div className="p-6"><Skeleton rows={6} /></div>
        ) : (
          <div className="p-6 space-y-6">
            {/* Meta grid */}
            <div className="grid grid-cols-3 gap-4 text-sm">
              <MetaCell label="Status" value={
                <select value={client.status} onChange={e => setStatus(e.target.value)}
                  className="bg-ink-800 border border-ink-700 rounded-md text-sm px-2 py-1 w-full">
                  <option value="green">Healthy</option>
                  <option value="yellow">Watch</option>
                  <option value="red">At Risk</option>
                  <option value="churned">Churned</option>
                </select>
              } />
              <MetaCell label="Package" value={client.package ? `${client.package} reels` : '—'} />
              {canSeeFinancials && (
                <MetaCell label="Billing" value={
                  <EditableNumber
                    value={client.billing_date}
                    display={client.billing_date
                      ? `${client.billing_date}${suffix(client.billing_date)} (${client.days_until_billing}d)`
                      : '—'}
                    placeholder="Day (1-31)"
                    min={1} max={31}
                    onSave={v => saveField('billing_date', v ? Number(v) : null)} />
                } />
              )}
              {canSeeFinancials && (
                <MetaCell label="MRR" value={
                  <EditableMRR
                    value={client.mrr}
                    onSave={v => saveField('mrr', v ? Number(v) : null)} />
                } />
              )}
              <MetaCell label="Source" value={client.content_source || '—'} />
              <MetaCell label="Cohort" value={
                <select value={client.cohort || ''} onChange={e => setCohort(e.target.value)}
                  className="bg-ink-800 border border-ink-700 rounded-md text-sm px-2 py-1 w-full">
                  <option value="" disabled>—</option>
                  <option value="new">New</option>
                  <option value="active_happy">Active (happy)</option>
                  <option value="active_hands_off">Active (hands-off)</option>
                  <option value="cancelling">Cancelling</option>
                  <option value="churned">Churned</option>
                </select>
              } />
            </div>

            {/* Success Definition — pinned at top per SOP */}
            <SuccessDefinitionBlock
              client={client}
              onSaveDefinition={v => saveField('success_definition', v)}
              onSaveBaseline={v => saveField('baseline_metrics', v)}
              onSaveServiceStart={v => saveField('service_start_date', v)}
            />

            {/* Health snapshot */}
            {health && (
              <div className="rounded-lg border border-ink-800 bg-ink-950/40 p-4 flex items-center gap-4">
                <HealthRing score={health.score} size={64} />
                <div className="flex-1 min-w-0">
                  <div className="text-xs uppercase tracking-wider text-slate-500">Health · {health.band.replace('_', ' ')}</div>
                  <div className="text-sm text-slate-300 mt-1">30-day activity</div>
                </div>
                <div className="w-40 h-10">
                  <Sparkline data={(health.sparkline || []).map(s => s.count)} height={40} />
                </div>
              </div>
            )}

            {/* Lifecycle checklist (onboarding → Day 80) — shown unless fully complete */}
            {lifecycleDefs.length > 0 && !lifecycleDefs.every(s => (client.lifecycle_steps || client.onboarding_steps || {})[s.key]) ? (
              <Stepper title="Client Lifecycle"
                defs={lifecycleDefs}
                done={client.lifecycle_steps || client.onboarding_steps || {}}
                onToggle={toggleLifecycleStep}
                client={client} />
            ) : null}

            {/* Closeout stepper (churned only) */}
            {client.status === 'churned' || client.cohort === 'cancelling' ? (
              <Stepper title={client.status === 'churned' ? 'Closeout' : 'Closeout (prepared)'}
                defs={closeoutDefs}
                done={client.closeout_steps || {}}
                onToggle={toggleCloseoutStep} />
            ) : null}

            {/* Situation flags */}
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-500 mb-2 flex items-center justify-between">
                <span>Situation flags {openFlags.length > 0 && <span className="text-amber-400">· {openFlags.length} open</span>}</span>
              </div>
              {openFlags.length > 0 && (
                <div className="space-y-1.5 mb-2">
                  {openFlags.map(f => (
                    <div key={f.id} className="flex items-center justify-between rounded-md border border-amber-500/30 bg-amber-500/5 px-2.5 py-1.5 text-sm">
                      <span>⚑ {SITUATION_TYPES.find(t => t.key === f.type)?.label || f.type}</span>
                      <button className="text-xs text-slate-400 hover:text-slate-100" onClick={() => resolveFlag(f.id)}>Resolve</button>
                    </div>
                  ))}
                </div>
              )}
              <select defaultValue="" onChange={e => { if (e.target.value) { addFlag(e.target.value); e.target.value=''; } }}
                className="bg-ink-800 border border-ink-700 rounded-md text-xs px-2 py-1.5 w-full">
                <option value="" disabled>+ Raise a flag…</option>
                {SITUATION_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
            </div>

            {/* Flag for Retention */}
            <div>
              {!showRetentionFlag ? (
                <button onClick={() => setShowRetentionFlag(true)}
                  className="w-full flex items-center justify-center gap-2 rounded-lg border border-violet-500/30 bg-violet-500/5 px-3 py-2 text-sm text-violet-300 hover:bg-violet-500/10 transition">
                  <span>⚑</span> Flag for Retention Specialist
                </button>
              ) : (
                <div className="rounded-lg border border-violet-500/30 bg-violet-500/5 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs uppercase tracking-wide text-violet-300">Flag for Retention</span>
                    <button onClick={() => { setShowRetentionFlag(false); setRetentionFlagDetail(''); }}
                      className="text-xs text-slate-500 hover:text-slate-300">Cancel</button>
                  </div>
                  <textarea
                    value={retentionFlagDetail}
                    onChange={e => setRetentionFlagDetail(e.target.value)}
                    placeholder="Context for the retention specialist (optional)…"
                    rows={2}
                    className="w-full bg-ink-800 border border-ink-700 rounded-md text-sm px-2.5 py-1.5 resize-none placeholder:text-slate-600"
                  />
                  <div className="grid grid-cols-2 gap-1.5">
                    {RETENTION_REFERRAL_TYPES.map(t => (
                      <button key={t.key} onClick={() => flagForRetention(t.key)}
                        className="flex items-center gap-1.5 rounded-md border border-ink-700 bg-ink-800/60 px-2 py-1.5 text-xs text-slate-300 hover:bg-violet-500/10 hover:border-violet-500/30 hover:text-violet-200 transition text-left">
                        <span>{t.icon}</span> {t.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Loom card — cadence + timer + history */}
            <LoomCard
              client={client}
              loomCadence={loomCadence}
              looms={looms}
              onSendLoom={() => setShowLoomModal(true)}
              onSnooze={(d) => snooze('loom', d)}
              onCadenceChange={async (days) => {
                await api.setLoomCadence(clientId, days);
                load(); refresh(true);
                show({ message: days ? `Loom cadence \u2192 every ${days} days` : 'Loom cadence \u2192 global default' });
              }}
            />

            {/* Call Offer timer */}
            <TimerBlock timer={client.timers?.call_offer} label="Call Offer"
              onAction={() => doAction('call_offered', 'Call Offered')}
              onSnooze={(d) => snooze('call_offer', d)} />

            {/* Reviews — Day 30/60/80 + QBRs */}
            {reviews.length > 0 && (
              <ReviewsBlock reviews={reviews} onUpdate={async (id, patch) => {
                await api.updateReview(id, patch);
                load(); refresh(true);
                show({ message: 'Review updated.' });
              }} onGenerate={async () => {
                await api.generateReviews(clientId);
                load();
                show({ message: 'Reviews generated.' });
              }} />
            )}

            {/* Loom History */}
            {looms.length > 0 && (
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500 mb-2">Loom History ({looms.length})</div>
                <div className="space-y-2">
                  {looms.slice(0, 5).map(l => (
                    <div key={l.id} className="rounded-md border border-ink-700 bg-ink-800/40 p-2.5 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-slate-200">{l.topic}</span>
                        <div className="flex items-center gap-2">
                          {l.client_responded ? (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Responded</span>
                          ) : l.client_ask ? (
                            <button onClick={async (e) => { e.stopPropagation(); await api.markLoomResponded(l.id); load(); show({ message: 'Marked as responded.' }); }}
                              className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 hover:bg-amber-500/20 transition">
                              Mark responded
                            </button>
                          ) : null}
                          <span className="text-[10px] text-slate-600 tabular-nums">{fmtDate(l.sent_at)}</span>
                        </div>
                      </div>
                      {l.performance_snapshot && <div className="text-sky-400/70 mt-1">📊 {l.performance_snapshot}</div>}
                      {l.wins && <div className="text-emerald-400/70 mt-0.5">✓ {l.wins}</div>}
                      {l.strategy_recommendation && <div className="text-violet-400/70 mt-0.5">💡 {l.strategy_recommendation}</div>}
                      {l.content_plan && <div className="text-amber-300/70 mt-0.5">📅 {l.content_plan}</div>}
                      {l.client_ask && <div className="text-rose-300/70 mt-0.5">❓ {l.client_ask}</div>}
                      {l.loom_url && <a href={l.loom_url} target="_blank" rel="noopener" className="text-blue-400 hover:underline mt-0.5 inline-block">View Loom</a>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actionable context — editable */}
            <div className="space-y-2">
              <EditableContextField
                label="Action needed"
                tone="emerald"
                value={client.action_needed || ''}
                placeholder="What needs to happen next for this client?"
                onSave={async (val) => {
                  await api.updateClient(clientId, { action_needed: val || null });
                  load(); refresh(true);
                  show({ message: 'Action needed updated.' });
                }}
              />
              <EditableContextField
                label="Reason / context"
                value={client.reason || ''}
                placeholder="Any context about this client's current situation…"
                onSave={async (val) => {
                  await api.updateClient(clientId, { reason: val || null });
                  load(); refresh(true);
                  show({ message: 'Reason updated.' });
                }}
              />
              {client.save_plan_analysis && <ContextBlock label="Save plan" value={client.save_plan_analysis} />}
            </div>

            {/* Note */}
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-500 mb-2">Add a note</div>
              <textarea className="input h-20" placeholder="Jot what happened…"
                value={note} onChange={e => setNote(e.target.value)} />
              <div className="flex justify-end mt-2">
                <button className="btn btn-primary btn-sm" onClick={saveNote} disabled={!note.trim()}>Save note</button>
              </div>
            </div>

            {/* Timeline */}
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-500 mb-3">Timeline</div>
              {(!client.touchpoints || client.touchpoints.length === 0) ? (
                <div className="text-sm text-slate-500">No touchpoints yet.</div>
              ) : (
                <ol className="relative border-l border-ink-700 ml-2 space-y-4">
                  {client.touchpoints.map(tp => (
                    <li key={tp.id} className="pl-4">
                      <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full bg-ink-600 ring-4 ring-ink-900" />
                      <div className="text-xs text-slate-500 tabular-nums">{fmtDate(tp.created_at)}</div>
                      <div className="text-sm font-medium mt-0.5">{touchpointLabel(tp.type)}</div>
                      {tp.content && <div className="text-sm text-slate-300 mt-0.5 whitespace-pre-wrap">{tp.content}</div>}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        )}
      </div>
      {showLoomModal && client && (
        <LoomSentModal
          clientName={client.name}
          onClose={() => setShowLoomModal(false)}
          onSubmit={async (data) => {
            await api.createLoom({ client_id: clientId, ...data });
            setShowLoomModal(false);
            load(); refresh(true);
            show({ message: `Loom logged for ${client.name}.`, action: {
              label: 'Undo',
              onClick: async () => { await api.undoLast(clientId); refresh(true); load(); show({ message: 'Undone.' }); }
            }});
          }}
        />
      )}
    </div>
  );
}

function LoomSentModal({ clientName, onClose, onSubmit }) {
  const [form, setForm] = useState({
    topic: '', performance_snapshot: '', wins: '',
    strategy_recommendation: '', content_plan: '', client_ask: '', loom_url: ''
  });
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.topic.trim()) return;
    setSaving(true);
    await onSubmit(form);
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" />
      <form onSubmit={handleSubmit}
        className="relative bg-ink-900 border border-ink-700 rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-ink-800">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-100">Log Loom</h2>
              <div className="text-xs text-slate-500 mt-0.5">for {clientName}</div>
            </div>
            <button type="button" onClick={onClose}
              className="text-slate-400 hover:text-white w-7 h-7 grid place-items-center rounded hover:bg-ink-800">✕</button>
          </div>
          <div className="text-[10px] text-slate-600 mt-2 leading-relaxed">
            Every Loom is a retention event. Lead with results, recommend strategy, end with an ask.
          </div>
        </div>
        <div className="px-5 py-4 space-y-4">
          {/* Topic */}
          <div>
            <div className="text-xs text-slate-400 mb-1">Topic / Subject *</div>
            <input className="input w-full" autoFocus required placeholder="e.g. April performance review + Q2 strategy shift"
              value={form.topic} onChange={e => setForm(f => ({ ...f, topic: e.target.value }))} />
          </div>

          {/* Beat 1: Performance Snapshot */}
          <div className="rounded-lg border border-sky-500/20 bg-sky-500/5 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-sky-300">Beat 1 — Performance Snapshot</span>
              <span className="text-[10px] text-slate-600">Lead with numbers. This is the "justify the spend" moment.</span>
            </div>
            <textarea className="input w-full h-16 text-sm" value={form.performance_snapshot}
              onChange={e => setForm(f => ({ ...f, performance_snapshot: e.target.value }))}
              placeholder="Your last 4 reels averaged 2,400 views (up from 1,800). Best performer: the behind-the-scenes reel at 8.5K views. Follower count: 12,340 → 12,890 (+550 this month). Engagement rate holding at 3.2%." />
          </div>

          {/* Beat 2: Wins */}
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-emerald-300">Beat 2 — Wins</span>
              <span className="text-[10px] text-slate-600">Anchor the value. What's working? Specific callouts.</span>
            </div>
            <textarea className="input w-full h-14 text-sm" value={form.wins}
              onChange={e => setForm(f => ({ ...f, wins: e.target.value }))}
              placeholder="The hook-first format is clearly resonating — 3 of your top 5 reels this month used it. Your audience responds strongest to [specific content type]. The collab reel outperformed your average by 3x." />
          </div>

          {/* Beat 3: Strategy Recommendation */}
          <div className="rounded-lg border border-violet-500/20 bg-violet-500/5 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-violet-300">Beat 3 — Strategy Recommendation</span>
              <span className="text-[10px] text-slate-600">Don't just report — advise. Proactive shifts.</span>
            </div>
            <textarea className="input w-full h-16 text-sm" value={form.strategy_recommendation}
              onChange={e => setForm(f => ({ ...f, strategy_recommendation: e.target.value }))}
              placeholder="Based on what's performing, I'd recommend we shift your mix to 60% educational / 40% personal next month. I also noticed your CTA link is going to your homepage — if we swap that to a direct lead capture page, you'll convert more of these views into actual leads." />
          </div>

          {/* Beat 4: Content Plan */}
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-amber-300">Beat 4 — Content Plan</span>
              <span className="text-[10px] text-slate-600">What's coming. Makes every month feel intentional.</span>
            </div>
            <textarea className="input w-full h-14 text-sm" value={form.content_plan}
              onChange={e => setForm(f => ({ ...f, content_plan: e.target.value }))}
              placeholder="This week: 3 reels dropping (topic-based hooks). Next month: testing carousel-style reels + one trending audio piece. I'm also prepping a series concept around [theme] that I think could be a breakout." />
          </div>

          {/* Beat 5: Client Ask */}
          <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-rose-300">Beat 5 — The Ask</span>
              <span className="text-[10px] text-slate-600">Engagement hook. If they don't respond, it's an early warning.</span>
            </div>
            <textarea className="input w-full h-14 text-sm" value={form.client_ask}
              onChange={e => setForm(f => ({ ...f, client_ask: e.target.value }))}
              placeholder="Can you send me 2-3 raw clips from your upcoming event? Also — what's your #1 goal for Q2: more followers, more leads, or more brand deals? That'll shape how I angle the content." />
          </div>

          {/* Loom URL */}
          <div>
            <div className="text-xs text-slate-400 mb-1">Loom URL (optional)</div>
            <input className="input w-full" placeholder="https://www.loom.com/share/..."
              value={form.loom_url} onChange={e => setForm(f => ({ ...f, loom_url: e.target.value }))} />
          </div>
        </div>
        <div className="px-5 py-3 border-t border-ink-800 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn btn-sm">Cancel</button>
          <button type="submit" disabled={saving || !form.topic.trim()} className="btn btn-primary btn-sm px-5">
            {saving ? 'Saving…' : 'Log Loom Sent'}
          </button>
        </div>
      </form>
    </div>
  );
}

function MetaCell({ label, value }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">{label}</div>
      <div className="text-slate-200">{value}</div>
    </div>
  );
}

function ContextBlock({ label, value, tone }) {
  const color = tone === 'emerald' ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-ink-700 bg-ink-800/50';
  return (
    <div className={`rounded-lg border ${color} p-3`}>
      <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">{label}</div>
      <div className="text-sm text-slate-200 whitespace-pre-wrap">{value}</div>
    </div>
  );
}

function EditableContextField({ label, value, placeholder, tone, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);

  // Sync draft when value changes externally
  useEffect(() => { setDraft(value); }, [value]);

  const color = tone === 'emerald'
    ? 'border-emerald-500/30 bg-emerald-500/5'
    : 'border-ink-700 bg-ink-800/50';

  const save = async () => {
    const trimmed = draft.trim();
    if (trimmed === (value || '').trim()) { setEditing(false); return; }
    setSaving(true);
    try { await onSave(trimmed); } finally { setSaving(false); setEditing(false); }
  };

  if (editing) {
    return (
      <div className={`rounded-lg border ${color} p-3`}>
        <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">{label}</div>
        <textarea
          className="input w-full h-20 text-sm"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder={placeholder}
          autoFocus
          onKeyDown={e => { if (e.key === 'Escape') { setDraft(value); setEditing(false); } }}
        />
        <div className="flex items-center gap-2 mt-2">
          <button className="btn btn-primary btn-sm" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button className="btn btn-sm" onClick={() => { setDraft(value); setEditing(false); }}>Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-lg border ${color} p-3 group cursor-pointer hover:border-slate-500/40 transition`}
      onClick={() => setEditing(true)}>
      <div className="flex items-center justify-between">
        <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">{label}</div>
        <span className="text-[10px] text-slate-600 opacity-0 group-hover:opacity-100 transition">Edit</span>
      </div>
      {value ? (
        <div className="text-sm text-slate-200 whitespace-pre-wrap">{value}</div>
      ) : (
        <div className="text-sm text-slate-500 italic">{placeholder}</div>
      )}
    </div>
  );
}

const CADENCE_PRESETS = [
  { label: 'Weekly', days: 7 },
  { label: 'Biweekly', days: 14 },
  { label: 'Every 3 weeks', days: 21 },
  { label: 'Monthly', days: 30 },
  { label: 'Every 6 weeks', days: 42 },
  { label: 'Every 2 months', days: 60 },
];

function LoomCard({ client, loomCadence, looms, onSendLoom, onSnooze, onCadenceChange }) {
  const [showCadencePicker, setShowCadencePicker] = useState(false);
  const [customDays, setCustomDays] = useState('');
  const timer = client.timers?.loom;
  const overdue = timer?.is_overdue;
  const effectiveCadence = loomCadence?.effective_cadence || 21;
  const lastLoom = looms?.[0];

  function cadenceLabel(days) {
    const preset = CADENCE_PRESETS.find(p => p.days === days);
    if (preset) return preset.label;
    return `Every ${days} days`;
  }

  async function handlePreset(days) {
    await onCadenceChange(days);
    setShowCadencePicker(false);
  }

  async function handleCustom() {
    const n = parseInt(customDays, 10);
    if (n >= 3 && n <= 90) {
      await onCadenceChange(n);
      setCustomDays('');
      setShowCadencePicker(false);
    }
  }

  async function handleResetToGlobal() {
    await onCadenceChange(null);
    setShowCadencePicker(false);
  }

  return (
    <div className={`rounded-lg border p-4 ${overdue ? 'border-rose-500/40 bg-rose-500/5' : 'border-violet-500/30 bg-violet-500/5'}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-base">\u{1F3A5}</span>
          <span className="text-sm font-semibold text-slate-200">Loom</span>
        </div>
        <span className={`pill text-[10px] ${overdue ? 'bg-rose-500/15 text-rose-300' : 'bg-violet-500/15 text-violet-300'}`}>
          {overdue ? 'Overdue' : 'On track'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="rounded-md bg-ink-800/60 border border-ink-700 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-0.5">Cadence</div>
          <button
            onClick={() => setShowCadencePicker(!showCadencePicker)}
            className="text-sm text-violet-300 hover:text-violet-200 transition font-medium flex items-center gap-1">
            {cadenceLabel(effectiveCadence)}
            {!loomCadence?.cadence_days && <span className="text-[9px] text-slate-500 ml-1">(global)</span>}
            <span className="text-[10px] text-slate-600">\u25BE</span>
          </button>
        </div>
        <div className="rounded-md bg-ink-800/60 border border-ink-700 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-0.5">Next due</div>
          {timer ? (
            <div className={`text-sm font-medium tabular-nums ${overdue ? 'text-rose-300' : 'text-slate-200'}`}>
              {fmtRelative(timer.next_due_at)}
            </div>
          ) : (
            <div className="text-sm text-slate-500">No timer</div>
          )}
        </div>
      </div>

      {showCadencePicker && (
        <div className="rounded-md border border-violet-500/30 bg-ink-900 p-2 mb-3 space-y-1">
          {CADENCE_PRESETS.map(p => (
            <button key={p.days} onClick={() => handlePreset(p.days)}
              className={`w-full text-left px-2.5 py-1.5 rounded text-xs transition ${
                effectiveCadence === p.days
                  ? 'bg-violet-500/20 text-violet-200 border border-violet-500/30'
                  : 'text-slate-300 hover:bg-ink-800'
              }`}>
              {p.label} <span className="text-slate-500">({p.days}d)</span>
            </button>
          ))}
          <div className="flex items-center gap-2 mt-1 pt-1 border-t border-ink-700">
            <input type="number" min={3} max={90}
              className="bg-ink-800 border border-ink-700 rounded px-2 py-1 text-xs w-16 outline-none focus:ring-1 focus:ring-violet-500/40"
              placeholder="Days" value={customDays} onChange={e => setCustomDays(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCustom(); }} />
            <button onClick={handleCustom}
              className="text-xs text-violet-300 hover:text-violet-200 px-2 py-1 rounded hover:bg-violet-500/10">Set custom</button>
            {loomCadence?.cadence_days && (
              <button onClick={handleResetToGlobal}
                className="text-xs text-slate-500 hover:text-slate-300 px-2 py-1 rounded hover:bg-ink-800 ml-auto">Reset to global</button>
            )}
          </div>
        </div>
      )}

      {lastLoom && (
        <div className="text-[11px] text-slate-500 mb-3 flex items-center gap-2">
          <span>Last: {lastLoom.topic}</span>
          <span className="text-slate-600">\u00B7</span>
          <span className="tabular-nums">{fmtDate(lastLoom.sent_at)}</span>
        </div>
      )}

      <div className="flex items-center gap-2">
        <button className="btn btn-primary btn-sm flex-1" onClick={onSendLoom}>Log Loom Sent</button>
        <select className="bg-ink-800 border border-ink-700 rounded-md text-xs px-2 py-1" defaultValue=""
          onChange={e => { if (e.target.value) { onSnooze(Number(e.target.value)); e.target.value=''; } }}>
          <option value="" disabled>Snooze\u2026</option>
          <option value="1">1 day</option>
          <option value="2">2 days</option>
          <option value="3">3 days</option>
          <option value="7">1 week</option>
        </select>
      </div>
    </div>
  );
}

function TimerBlock({ timer, label, onAction, onSnooze }) {
  if (!timer) return <div className="rounded-lg border border-ink-700 bg-ink-800/40 p-3 text-sm text-slate-500">{label}: —</div>;
  const overdue = timer.is_overdue;
  return (
    <div className={`rounded-lg border p-3 ${overdue ? 'border-rose-500/40 bg-rose-500/5' : 'border-ink-700 bg-ink-800/40'}`}>
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
        <span className={`pill ${overdue ? 'bg-rose-500/15 text-rose-300' : 'bg-emerald-500/10 text-emerald-300'}`}>
          {overdue ? 'Overdue' : 'On track'}
        </span>
      </div>
      <div className="mt-1 text-sm text-slate-300 tabular-nums">{fmtRelative(timer.next_due_at)}</div>
      <div className="flex items-center gap-2 mt-3">
        <button className="btn btn-primary btn-sm flex-1" onClick={onAction}>{label === 'Loom' ? 'Loom Sent' : 'Call Offered'}</button>
        <select
          className="bg-ink-800 border border-ink-700 rounded-md text-xs px-2 py-1"
          defaultValue=""
          onChange={e => { if (e.target.value) { onSnooze(Number(e.target.value)); e.target.value=''; } }}>
          <option value="" disabled>Snooze…</option>
          <option value="1">1 day</option>
          <option value="2">2 days</option>
          <option value="3">3 days</option>
          <option value="7">1 week</option>
        </select>
      </div>
    </div>
  );
}

function suffix(n) { return n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'; }

function EditableMRR({ value, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  function open() { setDraft(value || ''); setEditing(true); }
  function cancel() { setEditing(false); }
  function commit() {
    const num = draft === '' ? null : Number(String(draft).replace(/[^0-9.]/g, ''));
    if (num !== null && isNaN(num)) { cancel(); return; }
    if (num !== (Number(value) || null)) onSave(num);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <span className="text-slate-400">$</span>
        <input
          type="number" autoFocus min={0} step={100}
          className="bg-ink-800 border border-emerald-500/50 rounded px-2 py-0.5 text-sm w-24 outline-none focus:ring-1 focus:ring-emerald-500/40"
          value={draft} onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') cancel(); }}
        />
      </div>
    );
  }

  return (
    <button onClick={open} className="group flex items-center gap-1 hover:text-emerald-300 transition text-left" title="Click to edit MRR">
      <span>{value ? `$${fmtMRR(value)}` : '—'}</span>
      <span className="text-slate-600 group-hover:text-emerald-400 text-[10px] transition">✎</span>
    </button>
  );
}

function EditableNumber({ value, display, placeholder, min, max, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  function open() { setDraft(value ?? ''); setEditing(true); }
  function cancel() { setEditing(false); }
  function commit() {
    const num = draft === '' ? null : Number(draft);
    if (num !== null && (isNaN(num) || (min != null && num < min) || (max != null && num > max))) { cancel(); return; }
    if (num !== (Number(value) || null)) onSave(num);
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        type="number" autoFocus min={min} max={max}
        className="bg-ink-800 border border-emerald-500/50 rounded px-2 py-0.5 text-sm w-20 outline-none focus:ring-1 focus:ring-emerald-500/40"
        placeholder={placeholder}
        value={draft} onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') cancel(); }}
      />
    );
  }

  return (
    <button onClick={open} className="group flex items-center gap-1 hover:text-emerald-300 transition text-left" title="Click to edit">
      <span>{display}</span>
      <span className="text-slate-600 group-hover:text-emerald-400 text-[10px] transition">✎</span>
    </button>
  );
}

function ReviewsBlock({ reviews, onUpdate, onGenerate }) {
  const [expandedId, setExpandedId] = useState(null);
  const [form, setForm] = useState({});

  const TYPE_LABELS = { day_30: 'Day 30 Review', day_60: 'Day 60 Review', day_80: 'Day 80 Review', qbr: 'QBR' };
  const STATUS_STYLES = {
    overdue: 'border-rose-500/30 bg-rose-500/5 text-rose-300',
    upcoming: 'border-amber-500/30 bg-amber-500/5 text-amber-300',
    pending: 'border-ink-700 bg-ink-800/40 text-slate-400',
    completed: 'border-emerald-500/20 bg-emerald-500/5 text-emerald-300',
    skipped: 'border-ink-700 bg-ink-800/20 text-slate-500'
  };

  function toggleExpand(review) {
    if (expandedId === review.id) { setExpandedId(null); return; }
    setExpandedId(review.id);
    setForm({
      goals_on_track: review.goals_on_track ?? null,
      success_progress: review.success_progress || '',
      content_feedback: review.content_feedback || '',
      engagement_notes: review.engagement_notes || '',
      concerns: review.concerns || '',
      action_items: review.action_items || '',
      retention_risk: review.retention_risk || '',
      nps_score: review.nps_score ?? ''
    });
  }

  function submitReview(reviewId) {
    const patch = { ...form, status: 'completed' };
    if (patch.nps_score === '') delete patch.nps_score;
    else patch.nps_score = Number(patch.nps_score);
    if (patch.goals_on_track === null) delete patch.goals_on_track;
    onUpdate(reviewId, patch);
    setExpandedId(null);
  }

  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-slate-500 mb-2 flex items-center justify-between">
        <span>Reviews</span>
        <span className="text-slate-400 tabular-nums">
          {reviews.filter(r => r.status === 'completed').length}/{reviews.length}
        </span>
      </div>
      <div className="space-y-2">
        {reviews.map(r => (
          <div key={r.id}>
            <button onClick={() => toggleExpand(r)}
              className={`w-full flex items-center gap-3 rounded-md border px-3 py-2 text-sm text-left transition ${STATUS_STYLES[r.status] || STATUS_STYLES.pending}`}>
              <span className={`h-4 w-4 rounded-full border grid place-items-center text-[10px] shrink-0 ${
                r.status === 'completed' ? 'bg-emerald-500 border-emerald-500 text-ink-950' : 'border-current'
              }`}>{r.status === 'completed' ? '✓' : r.status === 'overdue' ? '!' : '○'}</span>
              <span className="flex-1">{TYPE_LABELS[r.review_type] || r.review_type}</span>
              <span className="text-[10px] tabular-nums text-slate-500">
                {r.status === 'completed' ? `Done ${fmtDate(r.completed_at)}` : `Due ${fmtDate(r.due_at)}`}
              </span>
              <span className="text-[10px] text-slate-600">{expandedId === r.id ? '▾' : '▸'}</span>
            </button>

            {expandedId === r.id && r.status !== 'completed' && (
              <div className="mt-2 ml-7 space-y-3 rounded-md border border-ink-700 bg-ink-900/60 p-3">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-400">Goals on track?</span>
                  <div className="flex gap-1">
                    {[true, false].map(v => (
                      <button key={String(v)} onClick={() => setForm(f => ({ ...f, goals_on_track: v }))}
                        className={`text-xs px-2 py-0.5 rounded border ${form.goals_on_track === v
                          ? (v ? 'border-emerald-500 bg-emerald-500/20 text-emerald-300' : 'border-rose-500 bg-rose-500/20 text-rose-300')
                          : 'border-ink-600 text-slate-400 hover:border-slate-500'}`}>
                        {v ? 'Yes' : 'No'}
                      </button>
                    ))}
                  </div>
                </div>
                <ReviewField label="Success progress" value={form.success_progress} onChange={v => setForm(f => ({ ...f, success_progress: v }))} />
                <ReviewField label="Content feedback" value={form.content_feedback} onChange={v => setForm(f => ({ ...f, content_feedback: v }))} />
                <ReviewField label="Engagement notes" value={form.engagement_notes} onChange={v => setForm(f => ({ ...f, engagement_notes: v }))} />
                <ReviewField label="Concerns" value={form.concerns} onChange={v => setForm(f => ({ ...f, concerns: v }))} />
                <ReviewField label="Action items" value={form.action_items} onChange={v => setForm(f => ({ ...f, action_items: v }))} />
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-400">Retention risk</span>
                  <select value={form.retention_risk} onChange={e => setForm(f => ({ ...f, retention_risk: e.target.value }))}
                    className="bg-ink-800 border border-ink-700 rounded text-xs px-2 py-1 text-slate-300">
                    <option value="">—</option>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                  <span className="text-xs text-slate-400 ml-3">NPS</span>
                  <input type="number" min="0" max="10" value={form.nps_score}
                    onChange={e => setForm(f => ({ ...f, nps_score: e.target.value }))}
                    className="bg-ink-800 border border-ink-700 rounded text-xs px-2 py-1 w-12 text-center text-slate-300" placeholder="—" />
                </div>
                <div className="flex gap-2 justify-end pt-1">
                  <button className="btn btn-sm text-xs text-slate-400" onClick={() => { onUpdate(r.id, { status: 'skipped' }); setExpandedId(null); }}>Skip</button>
                  <button className="btn btn-primary btn-sm" onClick={() => submitReview(r.id)}>Complete Review</button>
                </div>
              </div>
            )}

            {expandedId === r.id && r.status === 'completed' && (
              <div className="mt-2 ml-7 space-y-1 rounded-md border border-ink-700 bg-ink-900/60 p-3 text-xs">
                {r.goals_on_track != null && <div><span className="text-slate-500">Goals on track:</span> <span className={r.goals_on_track ? 'text-emerald-300' : 'text-rose-300'}>{r.goals_on_track ? 'Yes' : 'No'}</span></div>}
                {r.success_progress && <div><span className="text-slate-500">Progress:</span> <span className="text-slate-300">{r.success_progress}</span></div>}
                {r.content_feedback && <div><span className="text-slate-500">Content:</span> <span className="text-slate-300">{r.content_feedback}</span></div>}
                {r.concerns && <div><span className="text-slate-500">Concerns:</span> <span className="text-rose-300">{r.concerns}</span></div>}
                {r.action_items && <div><span className="text-slate-500">Actions:</span> <span className="text-slate-300">{r.action_items}</span></div>}
                {r.retention_risk && <div><span className="text-slate-500">Risk:</span> <span className={r.retention_risk === 'high' ? 'text-rose-300' : r.retention_risk === 'medium' ? 'text-amber-300' : 'text-emerald-300'}>{r.retention_risk}</span></div>}
                {r.nps_score != null && <div><span className="text-slate-500">NPS:</span> <span className="text-slate-300">{r.nps_score}/10</span></div>}
              </div>
            )}
          </div>
        ))}
      </div>
      {reviews.length === 0 && (
        <button onClick={onGenerate} className="text-xs text-slate-500 hover:text-slate-300 transition mt-1">
          + Generate review schedule
        </button>
      )}
    </div>
  );
}

function ReviewField({ label, value, onChange }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-slate-600 mb-0.5">{label}</div>
      <textarea className="input h-12 text-xs" value={value} onChange={e => onChange(e.target.value)}
        placeholder={`${label}…`} />
    </div>
  );
}

function SuccessDefinitionBlock({ client, onSaveDefinition, onSaveBaseline, onSaveServiceStart }) {
  const [editingDef, setEditingDef] = useState(false);
  const [defDraft, setDefDraft] = useState('');
  const [editingBaseline, setEditingBaseline] = useState(false);
  const [baselineDraft, setBaselineDraft] = useState('');

  // Calculate days since creation
  const daysSinceCreation = client.created_at
    ? Math.floor((Date.now() - new Date(client.created_at).getTime()) / 86400000)
    : 0;
  const pastDay14 = daysSinceCreation > 14;
  const isEmpty = !client.success_definition;
  const isWarning = isEmpty && pastDay14 && client.status !== 'churned';

  function openDefEdit() {
    setDefDraft(client.success_definition || '');
    setEditingDef(true);
  }
  function commitDef() {
    const trimmed = defDraft.trim();
    if (trimmed !== (client.success_definition || '')) onSaveDefinition(trimmed || null);
    setEditingDef(false);
  }

  function openBaselineEdit() {
    const current = client.baseline_metrics;
    setBaselineDraft(typeof current === 'object' && current ? JSON.stringify(current, null, 2) : (current || ''));
    setEditingBaseline(true);
  }
  function commitBaseline() {
    const trimmed = baselineDraft.trim();
    if (!trimmed) { onSaveBaseline(null); setEditingBaseline(false); return; }
    try {
      const parsed = JSON.parse(trimmed);
      onSaveBaseline(parsed);
    } catch {
      // If not valid JSON, store as plain string wrapped in object
      onSaveBaseline({ notes: trimmed });
    }
    setEditingBaseline(false);
  }

  const borderColor = isWarning
    ? 'border-amber-500/40 bg-amber-500/5'
    : client.success_definition
      ? 'border-emerald-500/20 bg-emerald-500/5'
      : 'border-ink-700 bg-ink-800/40';

  return (
    <div className={`rounded-lg border ${borderColor} p-4 space-y-3`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isWarning && <span className="text-amber-400 text-sm">⚠</span>}
          <span className="text-xs uppercase tracking-wide text-slate-500 font-medium">Success Definition</span>
        </div>
        {client.success_definition_captured_at && (
          <span className="text-[10px] text-slate-600 tabular-nums">
            Captured {fmtDate(client.success_definition_captured_at)}
          </span>
        )}
      </div>

      {isWarning && (
        <div className="text-xs text-amber-300/80 -mt-1">
          Day {daysSinceCreation} — success definition should be captured by day 14
        </div>
      )}

      {/* Definition field */}
      {editingDef ? (
        <div>
          <textarea
            autoFocus
            className="input h-24 text-sm"
            placeholder="What does success look like for this client? (e.g. 'Post 3x/week on IG and grow to 10K followers in 6 months')"
            value={defDraft}
            onChange={e => setDefDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') setEditingDef(false); }}
          />
          <div className="flex justify-end gap-2 mt-2">
            <button className="btn btn-sm text-xs text-slate-400 hover:text-slate-200" onClick={() => setEditingDef(false)}>Cancel</button>
            <button className="btn btn-primary btn-sm" onClick={commitDef}>Save</button>
          </div>
        </div>
      ) : (
        <button onClick={openDefEdit} className="group w-full text-left">
          {client.success_definition ? (
            <div className="text-sm text-slate-200 whitespace-pre-wrap">
              {client.success_definition}
              <span className="text-slate-600 group-hover:text-emerald-400 text-[10px] ml-1 transition">✎</span>
            </div>
          ) : (
            <div className="text-sm text-slate-500 italic group-hover:text-slate-300 transition">
              + Click to define what success looks like for this client…
            </div>
          )}
        </button>
      )}

      {/* Baseline metrics */}
      <div className="border-t border-ink-800/60 pt-2">
        <div className="text-[10px] uppercase tracking-wide text-slate-600 mb-1">Baseline Metrics</div>
        {editingBaseline ? (
          <div>
            <textarea
              autoFocus
              className="input h-20 text-xs font-mono"
              placeholder='e.g. {"followers": 2500, "avg_views": 800, "posting_freq": "1x/week"}'
              value={baselineDraft}
              onChange={e => setBaselineDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Escape') setEditingBaseline(false); }}
            />
            <div className="flex justify-end gap-2 mt-1">
              <button className="btn btn-sm text-xs text-slate-400 hover:text-slate-200" onClick={() => setEditingBaseline(false)}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={commitBaseline}>Save</button>
            </div>
          </div>
        ) : (
          <button onClick={openBaselineEdit} className="group w-full text-left">
            {client.baseline_metrics ? (
              <div className="text-xs text-slate-400 font-mono whitespace-pre-wrap">
                {typeof client.baseline_metrics === 'object'
                  ? Object.entries(client.baseline_metrics).map(([k, v]) => `${k}: ${v}`).join(' · ')
                  : String(client.baseline_metrics)}
                <span className="text-slate-600 group-hover:text-emerald-400 text-[10px] ml-1 transition">✎</span>
              </div>
            ) : (
              <div className="text-xs text-slate-600 italic group-hover:text-slate-400 transition">
                + Add baseline metrics…
              </div>
            )}
          </button>
        )}
      </div>

      {/* Service start date */}
      {(client.service_start_date || client.success_definition) && (
        <div className="border-t border-ink-800/60 pt-2 flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wide text-slate-600">Service start</span>
          <input
            type="date"
            value={client.service_start_date || ''}
            onChange={e => onSaveServiceStart(e.target.value || null)}
            className="bg-ink-800 border border-ink-700 rounded-md text-xs px-2 py-1 text-slate-300"
          />
        </div>
      )}
    </div>
  );
}

function Stepper({ title, defs, done, onToggle, client }) {
  if (!defs.length) return null;
  const completed = defs.filter(s => done[s.key]).length;
  // Group steps by phase if phases exist
  const hasPhases = defs.some(s => s.phase);
  let lastPhase = null;

  const PHASE_LABELS = {
    pre: 'Pre-onboarding', discovery: 'Discovery', setup: 'Setup', launch: 'Launch',
    onboarding: 'Onboarding', first_week: 'First Week', retention_handoff: 'Retention Handoff',
    first_month: 'First Month', months_2_3: 'Months 2\u20133'
  };

  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-slate-500 mb-2 flex items-center justify-between">
        <span>{title}</span>
        <span className="text-slate-400 tabular-nums">{completed}/{defs.length}</span>
      </div>
      <div className="h-1 rounded-full bg-ink-800 overflow-hidden mb-3">
        <div className="h-full bg-emerald-500 transition-all" style={{ width: `${(completed / defs.length) * 100}%` }} />
      </div>
      <ol className="space-y-1">
        {defs.map((s, i) => {
          const isDone = !!done[s.key];
          // Check if this step is gated
          const isGated = s.gate === 'success_definition' && client && !client.success_definition && !isDone;
          // Phase divider
          const showPhase = hasPhases && s.phase && s.phase !== lastPhase;
          if (showPhase) lastPhase = s.phase;

          return (
            <li key={s.key}>
              {showPhase && (
                <div className="text-[10px] uppercase tracking-wider text-slate-600 mt-2 mb-1 pl-1">
                  {PHASE_LABELS[s.phase] || s.phase}
                </div>
              )}
              <button onClick={() => onToggle(s.key)}
                disabled={isGated}
                title={isGated ? 'Fill in the Success Definition first' : s.highlight ? 'Key milestone' : ''}
                className={`w-full flex items-center gap-3 rounded-md px-2.5 py-1.5 text-sm text-left transition ${
                  isDone ? 'bg-emerald-500/5 text-slate-300'
                    : isGated ? 'opacity-50 cursor-not-allowed text-slate-400'
                    : s.highlight && !isDone ? 'hover:bg-amber-500/10 text-amber-200 bg-amber-500/5 border border-amber-500/20'
                    : 'hover:bg-ink-800 text-slate-200'
                }`}>
                <span className={`h-4 w-4 rounded-full border grid place-items-center text-[10px] shrink-0 ${
                  isDone ? 'bg-emerald-500 border-emerald-500 text-ink-950'
                    : isGated ? 'border-amber-500/50 text-amber-500'
                    : s.highlight ? 'border-amber-400 text-amber-400'
                    : 'border-ink-600 text-slate-500'
                }`}>{isDone ? '✓' : isGated? '!' : s.highlight ? '☆' : (s.step || i + 1)}</span>
                <span className={`flex-1 ${isDone ? 'line-through text-slate-500' : ''}`}>
                  {s.label}
                  {isGated && <span className="text-[10px] text-amber-400 ml-2">requires success definition</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
