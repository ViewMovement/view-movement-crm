// Ops & Retention routes: triage, steppers, save plans, flags, billing.
import { Router } from 'express';
import { supabase } from '../lib/supabase.js';
import { logTouchpoint } from '../lib/clientOps.js';
import { addDays, daysUntilBilling, daysOverdue } from '../lib/cadence.js';

const router = Router();

// ---------- Constants ----------
export const ONBOARDING_STEPS = [
  { key: 'form_sent',            label: 'Onboarding form sent' },
  { key: 'form_filled',          label: 'Form filled out' },
  { key: 'call_scheduled',       label: 'Onboarding call scheduled' },
  { key: 'call_completed',       label: 'Onboarding call completed' },
  { key: 'discord_built',        label: 'Discord team built' },
  { key: 'content_source_ready', label: 'Content source set up' },
  { key: 'work_started',         label: 'Work started (reels in progress)' }
];

export const CLOSEOUT_STEPS = [
  { key: 'cancellation_ack',         label: 'Cancellation acknowledged' },
  { key: 'final_date_confirmed',     label: 'Final delivery date confirmed' },
  { key: 'production_notified',      label: 'Production team notified in Discord' },
  { key: 'remaining_delivered',      label: 'Remaining content delivered' },
  { key: 'handoff_sent',             label: 'Final handoff package sent' },
  { key: 'access_revoked',           label: 'Access revoked / team disbanded' }
];

export const SITUATION_TYPES = {
  missed_posting:         { label: 'Missed posting today',      playbook: ['Check Master Sheet status', 'Ping contractor in Discord', 'Confirm reel is ready', 'Follow up with client if needed'] },
  overdue_batch:          { label: 'Batch overdue (>3 days)',   playbook: ['Check contractor availability', 'Escalate to PM (Emmanuel)', 'Update status + notify client'] },
  non_responsive:         { label: 'Client non-responsive 48h+', playbook: ['Resend with different framing', 'Loom video touchpoint', 'Call offer', 'Escalate to retention'] },
  delayed_onboarding:     { label: 'Onboarding stalled',        playbook: ['Check form completion', 'Reoffer call slots', 'Call client directly'] },
  dark_contractor:        { label: 'Dark contractor',           playbook: ['Last seen check in Discord', 'Reassign workload', 'Coverage change'] },
  retention_opportunity:  { label: 'Retention opportunity',     playbook: ['Flag for strategist', 'Draft save proposal', 'Schedule strategist call'] },
  sheet_mismatch:         { label: 'Master Sheet mismatch',     playbook: ['Verify package vs quota', 'Fix sheet entry', 'Notify PM'] },
  scripted_only:          { label: 'Scripted-only client',      playbook: ['Confirm boundaries', 'Do not push posting cadence', 'Different cadence tier'] },
  out_of_scope:           { label: 'Out-of-scope request',      playbook: ['Clarify package limits', 'Offer upsell', 'Decline politely if not possible'] },
  failed_payment:         { label: 'Failed payment',            playbook: ['Check Stripe', 'Notify client', 'Pause delivery if 7+ days overdue'] }
};

// ---------- Triage (Ops home) ----------
router.get('/triage', async (_req, res) => {
  try {
    const now = new Date();
    const [{ data: clients }, { data: timers }, { data: flags }, { data: recentTps }] = await Promise.all([
      supabase.from('clients').select('*'),
      supabase.from('timers').select('*'),
      supabase.from('situation_flags').select('*').is('resolved_at', null),
      supabase.from('touchpoints').select('client_id, created_at, type').gte('created_at', addDays(now, -2).toISOString()).order('created_at', { ascending: false })
    ]);

    const timersByClient = {};
    for (const t of timers || []) {
      (timersByClient[t.client_id] = timersByClient[t.client_id] || []).push(t);
    }

    const flagsByClient = {};
    for (const f of flags || []) {
      (flagsByClient[f.client_id] = flagsByClient[f.client_id] || []).push(f);
    }

    // Phase 1: Urgent - failed payments, cancelling with red, no touchpoint 48h+ for red clients, open critical flags
    const urgent = [];
    // Phase 2: Client channel sweep - grouped by cohort, with overdue/due timers
    const sweep = { new: [], active_happy: [], active_hands_off: [], cancelling: [] };
    // Phase 4: Monitor - recent activity in last 2 days
    const monitor = (recentTps || []).slice(0, 40);

    for (const c of clients || []) {
      const cTimers = timersByClient[c.id] || [];
      const overdueTimers = cTimers.filter(t => new Date(t.next_due_at) <= now);
      const dueSoon = cTimers.filter(t => new Date(t.next_due_at) > now && new Date(t.next_due_at) <= addDays(now, 2));
      const cFlags = flagsByClient[c.id] || [];
      const criticalFlags = cFlags.filter(f => ['failed_payment','missed_posting','non_responsive','overdue_batch'].includes(f.type));

      // Urgent triggers
      if (criticalFlags.length) {
        urgent.push({ client: c, timers: cTimers, flags: cFlags, reason: criticalFlags[0].type });
        continue;
      }
      if (c.status === 'red' && overdueTimers.length) {
        urgent.push({ client: c, timers: cTimers, flags: cFlags, reason: 'red_overdue' });
        continue;
      }

      // Sweep buckets
      const cohort = c.cohort || (c.status === 'churned' ? 'churned' : 'active_happy');
      if (cohort === 'churned') continue; // churned handled in closeout view
      if (sweep[cohort] && (overdueTimers.length || dueSoon.length || cFlags.length)) {
        sweep[cohort].push({ client: c, timers: cTimers, flags: cFlags, due_soon: dueSoon.length > 0, overdue: overdueTimers.length > 0 });
      }
    }

    res.json({
      urgent,
      sweep,
      monitor,
      counts: {
        urgent: urgent.length,
        sweep_total: Object.values(sweep).reduce((a, b) => a + b.length, 0),
        open_flags: (flags || []).length
      }
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---------- Onboarding stepper ----------
router.get('/onboarding-steps', (_req, res) => res.json(ONBOARDING_STEPS));

router.post('/clients/:id/onboarding/:step/toggle', async (req, res) => {
  try {
    const { id, step } = req.params;
    const validKeys = ONBOARDING_STEPS.map(s => s.key);
    if (!validKeys.includes(step)) return res.status(400).json({ error: 'bad step' });
    const { data: client, error } = await supabase.from('clients').select('onboarding_steps').eq('id', id).single();
    if (error) throw error;
    const steps = { ...(client.onboarding_steps || {}) };
    if (steps[step]) delete steps[step];
    else steps[step] = new Date().toISOString();
    const allComplete = validKeys.every(k => steps[k]);
    const patch = { onboarding_steps: steps };
    if (allComplete) { patch.cohort = 'active_happy'; patch.onboarding_call_completed = true; }
    await supabase.from('clients').update(patch).eq('id', id);
    await logTouchpoint(id, 'system', `Onboarding: ${steps[step] ? 'completed' : 'reopened'} "${step}"`);
    res.json({ ok: true, steps, all_complete: allComplete });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---------- Closeout stepper ----------
router.get('/closeout-steps', (_req, res) => res.json(CLOSEOUT_STEPS));

router.post('/clients/:id/closeout/:step/toggle', async (req, res) => {
  try {
    const { id, step } = req.params;
    const validKeys = CLOSEOUT_STEPS.map(s => s.key);
    if (!validKeys.includes(step)) return res.status(400).json({ error: 'bad step' });
    const { data: client, error } = await supabase.from('clients').select('closeout_steps').eq('id', id).single();
    if (error) throw error;
    const steps = { ...(client.closeout_steps || {}) };
    if (steps[step]) delete steps[step];
    else steps[step] = new Date().toISOString();
    await supabase.from('clients').update({ closeout_steps: steps }).eq('id', id);
    await logTouchpoint(id, 'system', `Closeout: ${steps[step] ? 'completed' : 'reopened'} "${step}"`);
    res.json({ ok: true, steps });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---------- Save Plans (Retention kanban) ----------
router.get('/save-plans', async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('save_plans').select('*, clients(*)')
      .order('updated_at', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/save-plans', async (req, res) => {
  try {
    const { client_id, proposal, owner } = req.body || {};
    if (!client_id) return res.status(400).json({ error: 'client_id required' });
    const { data, error } = await supabase
      .from('save_plans').insert({ client_id, proposal, owner, status: 'proposed' }).select().single();
    if (error) throw error;
    await logTouchpoint(client_id, 'note', `Save plan proposed: ${proposal || '(no detail)'}`);
    res.status(201).json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/save-plans/:id', async (req, res) => {
  try {
    const updates = { ...req.body };
    const { data, error } = await supabase
      .from('save_plans').update(updates).eq('id', req.params.id).select().single();
    if (error) throw error;
    if (updates.status) {
      await logTouchpoint(data.client_id, 'note', `Save plan → ${updates.status}${updates.outcome ? `: ${updates.outcome}` : ''}`);
      if (updates.status === 'saved') {
        await supabase.from('clients').update({ status: 'green', cohort: 'active_happy' }).eq('id', data.client_id);
      } else if (updates.status === 'lost') {
        await supabase.from('clients').update({ status: 'churned', cohort: 'churned' }).eq('id', data.client_id);
      }
    }
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---------- Situation Flags ----------
router.get('/flags', async (req, res) => {
  try {
    const open = req.query.open !== 'false';
    let q = supabase.from('situation_flags').select('*, clients(*)').order('created_at', { ascending: false });
    if (open) q = q.is('resolved_at', null);
    const { data, error } = await q;
    if (error) throw error;
    res.json({ flags: data || [], types: SITUATION_TYPES });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/flags', async (req, res) => {
  try {
    const { client_id, type, detail } = req.body || {};
    if (!client_id || !SITUATION_TYPES[type]) return res.status(400).json({ error: 'bad input' });
    const { data, error } = await supabase
      .from('situation_flags').insert({ client_id, type, detail }).select().single();
    if (error) throw error;
    await logTouchpoint(client_id, 'system', `Flag raised: ${SITUATION_TYPES[type].label}${detail ? ` — ${detail}` : ''}`);
    res.status(201).json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/flags/:id/resolve', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('situation_flags').update({ resolved_at: new Date().toISOString(), resolved_by: req.body?.by || null })
      .eq('id', req.params.id).select().single();
    if (error) throw error;
    await logTouchpoint(data.client_id, 'system', `Flag resolved: ${data.type}`);
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---------- Billing Oversight ----------
router.get('/billing/today', async (_req, res) => {
  try {
    const today = new Date();
    const dom = today.getDate();
    const isCheckDay = dom === 1 || dom === 14;
    const relevantDay = isCheckDay ? dom : (dom > 14 ? 14 : 1);
    const periodDate = new Date(today.getFullYear(), today.getMonth(), relevantDay).toISOString().slice(0, 10);

    const { data: clients } = await supabase.from('clients').select('*').eq('billing_date', relevantDay).neq('status', 'churned');
    const { data: checks } = await supabase.from('billing_checks').select('*').eq('period_date', periodDate);
    const checksByClient = Object.fromEntries((checks || []).map(c => [c.client_id, c]));

    const rows = (clients || []).map(c => ({
      client: c,
      period_date: periodDate,
      check: checksByClient[c.id] || null,
      days_until_billing: daysUntilBilling(c.billing_date)
    }));
    res.json({
      period_date: periodDate,
      billing_day: relevantDay,
      is_check_day: isCheckDay,
      rows,
      counts: {
        total: rows.length,
        pending: rows.filter(r => !r.check || r.check.status === 'pending').length,
        ok: rows.filter(r => r.check?.status === 'ok').length,
        failed: rows.filter(r => r.check?.status === 'failed').length
      }
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/billing/check', async (req, res) => {
  try {
    const { client_id, period_date, status, note } = req.body || {};
    if (!client_id || !period_date) return res.status(400).json({ error: 'bad input' });
    // upsert
    const { data: existing } = await supabase.from('billing_checks')
      .select('id').eq('client_id', client_id).eq('period_date', period_date).maybeSingle();
    let row;
    if (existing) {
      const { data, error } = await supabase.from('billing_checks')
        .update({ status, note }).eq('id', existing.id).select().single();
      if (error) throw error; row = data;
    } else {
      const { data, error } = await supabase.from('billing_checks')
        .insert({ client_id, period_date, status, note }).select().single();
      if (error) throw error; row = data;
    }
    if (status === 'failed') {
      // raise failed_payment flag
      await supabase.from('situation_flags').insert({ client_id, type: 'failed_payment', detail: note || null });
    }
    await logTouchpoint(client_id, 'system', `Billing ${period_date}: ${status}${note ? ` — ${note}` : ''}`);
    res.json(row);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---------- Day Flow: single-queue monkey-proof daily driver ----------
// Returns a prioritized queue of work items, each with an explicit next_action,
// plus progress counters, onboarding heroes, billing pulse, and routine phase state.
router.get('/day', async (req, res) => {
  try {
    const userEmail = req.user?.email || 'anonymous';
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

    const [{ data: clients }, { data: timers }, { data: flags }, { data: todaysTps }, { data: routineRows }] = await Promise.all([
      supabase.from('clients').select('*').neq('status', 'churned'),
      supabase.from('timers').select('*'),
      supabase.from('situation_flags').select('*').is('resolved_at', null),
      supabase.from('touchpoints').select('client_id,type,created_at').gte('created_at', startOfDay),
      supabase.from('daily_routine').select('*').eq('user_email', userEmail).eq('routine_date', today).maybeSingle()
    ]);

    // Ensure routine row exists (defensive: tolerates missing table pre-migration)
    let routine = routineRows;
    if (!routine) {
      try {
        const { data } = await supabase.from('daily_routine').insert({ user_email: userEmail, routine_date: today }).select().single();
        routine = data;
      } catch { routine = null; }
    }

    const timersByClient = {};
    for (const t of timers || []) (timersByClient[t.client_id] = timersByClient[t.client_id] || []).push(t);
    const flagsByClient = {};
    for (const f of flags || []) (flagsByClient[f.client_id] = flagsByClient[f.client_id] || []).push(f);

    const CRITICAL_FLAGS = new Set(['failed_payment','missed_posting','non_responsive','overdue_batch']);

    const queue = [];
    const onboardingHeroes = [];

    for (const c of clients || []) {
      const cTimers = timersByClient[c.id] || [];
      const cFlags = flagsByClient[c.id] || [];
      const loomTimer = cTimers.find(t => t.timer_type === 'loom');
      const callTimer = cTimers.find(t => t.timer_type === 'call_offer');

      // Onboarding hero: cohort=new OR steps incomplete within first 14 days
      if (c.cohort === 'new' || (c.created_at && (Date.now() - new Date(c.created_at).getTime()) < 14 * 86400000)) {
        const steps = c.onboarding_steps || {};
        const totalSteps = 7;
        const completed = Object.keys(steps).length;
        if (completed < totalSteps) {
          onboardingHeroes.push({ client: c, completed, total: totalSteps });
        }
      }

      // Pick the single most important next_action per client
      let action = null;
      let urgency = 0;

      // 1. Critical flags → raise/work flag
      const crit = cFlags.find(f => CRITICAL_FLAGS.has(f.type));
      if (crit) {
        const labels = {
          failed_payment: `Resolve failed payment for ${c.name}`,
          missed_posting: `Check posting status for ${c.name}`,
          non_responsive: `Re-engage ${c.name} (non-responsive 48h+)`,
          overdue_batch: `Unblock overdue batch for ${c.name}`
        };
        action = { type: 'flag', flag_id: crit.id, flag_type: crit.type, label: labels[crit.type], hint: 'Open playbook' };
        urgency = 100;
      }
      // 2. Overdue loom timer
      else if (loomTimer && new Date(loomTimer.next_due_at) <= now) {
        const daysOver = Math.floor((now - new Date(loomTimer.next_due_at)) / 86400000);
        action = { type: 'send_loom', label: `Send Loom to ${c.name}`, hint: daysOver > 0 ? `${daysOver}d overdue` : 'Due today' };
        urgency = 60 + Math.min(20, daysOver);
        if (c.status === 'red') urgency += 15;
        if (c.cohort === 'cancelling') urgency += 10;
      }
      // 3. Overdue call offer
      else if (callTimer && new Date(callTimer.next_due_at) <= now) {
        const daysOver = Math.floor((now - new Date(callTimer.next_due_at)) / 86400000);
        action = { type: 'call_offer', label: `Offer a call to ${c.name}`, hint: daysOver > 0 ? `${daysOver}d overdue` : 'Due today' };
        urgency = 50 + Math.min(15, daysOver);
      }
      // 4. Due soon
      else if (loomTimer && new Date(loomTimer.next_due_at) <= new Date(now.getTime() + 2 * 86400000)) {
        const daysLeft = Math.ceil((new Date(loomTimer.next_due_at) - now) / 86400000);
        action = { type: 'send_loom', label: `Send Loom to ${c.name}`, hint: `Due in ${daysLeft}d — get ahead` };
        urgency = 30;
      }

      if (!action) continue;

      // Did we already act on this today? (filter out completed items)
      const todaysActions = (todaysTps || []).filter(t => t.client_id === c.id);
      const actedLoomToday = todaysActions.some(t => t.type === 'loom_sent');
      const actedCallToday = todaysActions.some(t => t.type === 'call_offered' || t.type === 'call_completed');
      if (action.type === 'send_loom' && actedLoomToday) continue;
      if (action.type === 'call_offer' && actedCallToday) continue;

      queue.push({
        id: `${c.id}:${action.type}`,
        client: { id: c.id, name: c.name, status: c.status, cohort: c.cohort, company: c.company },
        next_action: action,
        urgency,
        category: urgency >= 100 ? 'urgent' : (urgency >= 50 ? 'today' : 'heads_up'),
        flags: cFlags.length
      });
    }

    queue.sort((a, b) => b.urgency - a.urgency);

    // Progress: count touchpoints today as "done" + phases completed
    const doneToday = (todaysTps || []).filter(t => ['loom_sent','call_offered','call_completed'].includes(t.type)).length;
    const totalPlanned = doneToday + queue.length;

    // Billing pulse
    const dom = now.getDate();
    const isCheckDay = dom === 1 || dom === 14;
    const relevantDay = dom > 14 ? 14 : 1;

    res.json({
      greeting: greetingFor(now),
      user_email: userEmail,
      date: today,
      queue,
      progress: { done: doneToday, total: totalPlanned, queued: queue.length, percent: totalPlanned ? Math.round(doneToday * 100 / totalPlanned) : 100 },
      onboarding_heroes: onboardingHeroes,
      billing: { is_check_day: isCheckDay, relevant_day: relevantDay },
      routine: {
        phase_1_done: !!routine?.phase_1_done_at,
        phase_2_done: !!routine?.phase_2_done_at,
        phase_3_done: !!routine?.phase_3_done_at,
        phase_4_done: !!routine?.phase_4_done_at
      },
      counts: {
        urgent: queue.filter(q => q.category === 'urgent').length,
        today: queue.filter(q => q.category === 'today').length,
        heads_up: queue.filter(q => q.category === 'heads_up').length,
        open_flags: (flags || []).length,
        onboarding_active: onboardingHeroes.length
      }
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

function greetingFor(d) {
  const h = d.getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

// Toggle phase completion for today's routine
router.post('/day/phase/:n/toggle', async (req, res) => {
  try {
    const n = Number(req.params.n);
    if (![1,2,3,4].includes(n)) return res.status(400).json({ error: 'phase 1-4 only' });
    const userEmail = req.user?.email || 'anonymous';
    const today = new Date().toISOString().slice(0, 10);
    const col = `phase_${n}_done_at`;
    const { data: existing } = await supabase.from('daily_routine')
      .select('*').eq('user_email', userEmail).eq('routine_date', today).maybeSingle();
    const currentlyDone = !!existing?.[col];
    const newVal = currentlyDone ? null : new Date().toISOString();
    if (existing) {
      await supabase.from('daily_routine').update({ [col]: newVal }).eq('id', existing.id);
    } else {
      await supabase.from('daily_routine').insert({ user_email: userEmail, routine_date: today, [col]: newVal });
    }
    res.json({ ok: true, phase: n, done: !currentlyDone });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---------- Client ops: set cohort ----------
router.post('/clients/:id/cohort', async (req, res) => {
  try {
    const { cohort } = req.body || {};
    const valid = ['new','active_happy','active_hands_off','cancelling','churned'];
    if (!valid.includes(cohort)) return res.status(400).json({ error: 'bad cohort' });
    const { data, error } = await supabase.from('clients')
      .update({ cohort }).eq('id', req.params.id).select().single();
    if (error) throw error;
    await logTouchpoint(req.params.id, 'system', `Cohort → ${cohort}`);
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
