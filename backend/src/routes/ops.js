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
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const [{ data: clients }, { data: timers }, { data: flags }, { data: recentTps }, { data: pulseItems }, { data: todaysTps }] = await Promise.all([
      supabase.from('clients').select('*'),
      supabase.from('timers').select('*'),
      supabase.from('situation_flags').select('*').is('resolved_at', null),
      supabase.from('touchpoints').select('client_id, created_at, type, content').gte('created_at', addDays(now, -2).toISOString()).order('created_at', { ascending: false }),
      supabase.from('slack_pulse_items').select('*, channel:slack_channels(name, slack_channel_id)').is('seen_at', null).in('urgency', ['urgent', 'heads_up']).order('created_at', { ascending: false }).limit(20),
      supabase.from('touchpoints').select('client_id, type').gte('created_at', startOfDay)
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
    // Phase 2: Today — onboarding clients + pressing Slack pulse
    const onboarding = [];
    // Phase 3: Retention — Loom/call timer to-dos
    const retention = [];
    // Phase 4: Monitor - recent activity in last 2 days
    const clientNameById = Object.fromEntries((clients || []).map(c => [c.id, c.name]));
    const monitor = (recentTps || []).slice(0, 40).map(t => ({
      ...t,
      client_name: clientNameById[t.client_id] || 'Unknown'
    }));

    // Track today's actions so we can mark retention items as done
    const todaysActionsByClient = {};
    for (const t of todaysTps || []) {
      (todaysActionsByClient[t.client_id] = todaysActionsByClient[t.client_id] || []).push(t.type);
    }

    const urgentClientIds = new Set();

    for (const c of clients || []) {
      if (c.status === 'churned') continue;
      const cTimers = timersByClient[c.id] || [];
      const overdueTimers = cTimers.filter(t => new Date(t.next_due_at) <= now);
      const dueSoon = cTimers.filter(t => new Date(t.next_due_at) > now && new Date(t.next_due_at) <= addDays(now, 2));
      const cFlags = flagsByClient[c.id] || [];
      const criticalFlags = cFlags.filter(f => ['failed_payment','missed_posting','non_responsive','overdue_batch'].includes(f.type));

      // Urgent triggers
      if (criticalFlags.length) {
        urgent.push({ client: c, timers: cTimers, flags: cFlags, reason: criticalFlags[0].type });
        urgentClientIds.add(c.id);
        continue;
      }
      if (c.status === 'red' && overdueTimers.length) {
        urgent.push({ client: c, timers: cTimers, flags: cFlags, reason: 'red_overdue' });
        urgentClientIds.add(c.id);
        continue;
      }

      // Onboarding: cohort=new or has incomplete onboarding steps
      if (c.cohort === 'new') {
        const steps = c.onboarding_steps || {};
        const total = 7;
        const completed = Object.keys(steps).length;
        onboarding.push({ client: c, completed, total, flags: cFlags });
      }

      // Retention: loom/call timer actions
      const loomTimer = cTimers.find(t => t.timer_type === 'loom');
      const callTimer = cTimers.find(t => t.timer_type === 'call_offer');
      const clientActions = todaysActionsByClient[c.id] || [];
      const loomDoneToday = clientActions.includes('loom_sent');
      const callDoneToday = clientActions.includes('call_offered') || clientActions.includes('call_completed');

      if (loomTimer) {
        const loomOverdue = new Date(loomTimer.next_due_at) <= now;
        const loomDueSoon = !loomOverdue && new Date(loomTimer.next_due_at) <= addDays(now, 2);
        if (loomOverdue || loomDueSoon) {
          const daysOver = loomOverdue ? Math.floor((now - new Date(loomTimer.next_due_at)) / 86400000) : 0;
          retention.push({
            client: c, action_type: 'loom', overdue: loomOverdue, due_soon: loomDueSoon,
            days_overdue: daysOver, done_today: loomDoneToday,
            next_due: loomTimer.next_due_at, flags: cFlags
          });
        }
      }
      if (callTimer) {
        const callOverdue = new Date(callTimer.next_due_at) <= now;
        const callDueSoon = !callOverdue && new Date(callTimer.next_due_at) <= addDays(now, 2);
        if (callOverdue || callDueSoon) {
          const daysOver = callOverdue ? Math.floor((now - new Date(callTimer.next_due_at)) / 86400000) : 0;
          retention.push({
            client: c, action_type: 'call', overdue: callOverdue, due_soon: callDueSoon,
            days_overdue: daysOver, done_today: callDoneToday,
            next_due: callTimer.next_due_at, flags: cFlags
          });
        }
      }
    }

    // Sort retention: overdue first, then by days overdue desc, then due-soon
    retention.sort((a, b) => {
      if (a.done_today !== b.done_today) return a.done_today ? 1 : -1;
      if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
      return b.days_overdue - a.days_overdue;
    });

    res.json({
      urgent,
      onboarding,
      pulse_pressing: pulseItems || [],
      retention,
      monitor,
      counts: {
        urgent: urgent.length,
        onboarding: onboarding.length,
        pulse_pressing: (pulseItems || []).length,
        retention_due: retention.filter(r => !r.done_today).length,
        retention_done: retention.filter(r => r.done_today).length,
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

    const [{ data: clients }, { data: timers }, { data: flags }, { data: todaysTps }, { data: routineRows }, { data: pulseItems }] = await Promise.all([
      supabase.from('clients').select('*').neq('status', 'churned'),
      supabase.from('timers').select('*'),
      supabase.from('situation_flags').select('*').is('resolved_at', null),
      supabase.from('touchpoints').select('client_id,type,created_at').gte('created_at', startOfDay),
      supabase.from('daily_routine').select('*').eq('user_email', userEmail).eq('routine_date', today).maybeSingle(),
      supabase.from('slack_pulse_items').select('*, channel:slack_channels(name, slack_channel_id)').is('seen_at', null).in('urgency', ['urgent', 'heads_up']).order('created_at', { ascending: false }).limit(15)
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

    const opsQueue = [];          // urgent flags only (no looms/calls)
    const retentionQueue = [];     // loom/call timer actions
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

      // Critical flags → ops queue
      const crit = cFlags.find(f => CRITICAL_FLAGS.has(f.type));
      if (crit) {
        const labels = {
          failed_payment: `Resolve failed payment for ${c.name}`,
          missed_posting: `Check posting status for ${c.name}`,
          non_responsive: `Re-engage ${c.name} (non-responsive 48h+)`,
          overdue_batch: `Unblock overdue batch for ${c.name}`
        };
        opsQueue.push({
          id: `${c.id}:flag`,
          client: { id: c.id, name: c.name, status: c.status, cohort: c.cohort, company: c.company, mrr: c.mrr },
          next_action: { type: 'flag', flag_id: crit.id, flag_type: crit.type, label: labels[crit.type], hint: 'Open playbook' },
          urgency: 100,
          category: 'urgent',
          flags: cFlags.length
        });
      }

      // Loom/call timers → retention queue (separate from ops)
      const todaysActions = (todaysTps || []).filter(t => t.client_id === c.id);
      const loomDoneToday = todaysActions.some(t => t.type === 'loom_sent');
      const callDoneToday = todaysActions.some(t => t.type === 'call_offered' || t.type === 'call_completed');

      if (loomTimer) {
        const loomOverdue = new Date(loomTimer.next_due_at) <= now;
        const loomDueSoon = !loomOverdue && new Date(loomTimer.next_due_at) <= new Date(now.getTime() + 2 * 86400000);
        if (loomOverdue || loomDueSoon) {
          const daysOver = loomOverdue ? Math.floor((now - new Date(loomTimer.next_due_at)) / 86400000) : 0;
          let urgency = loomOverdue ? 60 + Math.min(20, daysOver) : 30;
          if (c.status === 'red') urgency += 15;
          if (c.cohort === 'cancelling') urgency += 10;
          retentionQueue.push({
            id: `${c.id}:loom`,
            client: { id: c.id, name: c.name, status: c.status, cohort: c.cohort, company: c.company, mrr: c.mrr },
            action_type: 'loom',
            next_action: { type: 'send_loom', label: `Send Loom to ${c.name}`, hint: loomOverdue ? (daysOver > 0 ? `${daysOver}d overdue` : 'Due today') : `Due soon` },
            urgency,
            overdue: loomOverdue,
            done_today: loomDoneToday,
            flags: cFlags.length
          });
        }
      }
      if (callTimer) {
        const callOverdue = new Date(callTimer.next_due_at) <= now;
        const callDueSoon = !callOverdue && new Date(callTimer.next_due_at) <= new Date(now.getTime() + 2 * 86400000);
        if (callOverdue || callDueSoon) {
          const daysOver = callOverdue ? Math.floor((now - new Date(callTimer.next_due_at)) / 86400000) : 0;
          let urgency = callOverdue ? 50 + Math.min(15, daysOver) : 25;
          retentionQueue.push({
            id: `${c.id}:call`,
            client: { id: c.id, name: c.name, status: c.status, cohort: c.cohort, company: c.company, mrr: c.mrr },
            action_type: 'call',
            next_action: { type: 'call_offer', label: `Offer a call to ${c.name}`, hint: callOverdue ? (daysOver > 0 ? `${daysOver}d overdue` : 'Due today') : 'Due soon' },
            urgency,
            overdue: callOverdue,
            done_today: callDoneToday,
            flags: cFlags.length
          });
        }
      }
    }

    opsQueue.sort((a, b) => b.urgency - a.urgency);
    retentionQueue.sort((a, b) => {
      if (a.done_today !== b.done_today) return a.done_today ? 1 : -1;
      return b.urgency - a.urgency;
    });

    // Progress
    const retentionDone = retentionQueue.filter(r => r.done_today).length;
    const retentionDue = retentionQueue.filter(r => !r.done_today).length;
    const doneToday = (todaysTps || []).filter(t => ['loom_sent','call_offered','call_completed'].includes(t.type)).length;
    const totalPlanned = doneToday + opsQueue.length + retentionDue;

    // Billing pulse
    const dom = now.getDate();
    const isCheckDay = dom === 1 || dom === 14;
    const relevantDay = dom > 14 ? 14 : 1;

    res.json({
      greeting: greetingFor(now),
      user_email: userEmail,
      date: today,
      ops_queue: opsQueue,
      retention_queue: retentionQueue,
      pulse_pressing: pulseItems || [],
      progress: { done: doneToday, total: totalPlanned, queued: opsQueue.length, retention_due: retentionDue, retention_done: retentionDone, percent: totalPlanned ? Math.round(doneToday * 100 / totalPlanned) : 100 },
      onboarding_heroes: onboardingHeroes,
      billing: { is_check_day: isCheckDay, relevant_day: relevantDay },
      routine: {
        phase_1_done: !!routine?.phase_1_done_at,
        phase_2_done: !!routine?.phase_2_done_at,
        phase_3_done: !!routine?.phase_3_done_at,
        phase_4_done: !!routine?.phase_4_done_at
      },
      counts: {
        urgent: opsQueue.length,
        pulse: (pulseItems || []).length,
        onboarding_active: onboardingHeroes.length,
        retention_due: retentionDue,
        retention_done: retentionDone,
        open_flags: (flags || []).length
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

// ---------- Health Score ----------
// 0-100, higher = healthier. Investor-grade client health indicator.
export function computeHealthScore(client, timers, flags, recentTps) {
  let score = 100;
  const now = Date.now();

  // Status penalty
  if (client.status === 'churned') return 0;
  if (client.cohort === 'cancelling') score -= 40;
  if (client.cohort === 'new') score -= 5;

  // Overdue touchpoints
  const loomTimer = (timers || []).find(t => t.timer_type === 'loom');
  const callTimer = (timers || []).find(t => t.timer_type === 'call_offer');
  if (loomTimer?.next_due_at) {
    const daysOver = Math.floor((now - new Date(loomTimer.next_due_at)) / 86400000);
    if (daysOver > 0) score -= Math.min(25, daysOver * 3);
  }
  if (callTimer?.next_due_at) {
    const daysOver = Math.floor((now - new Date(callTimer.next_due_at)) / 86400000);
    if (daysOver > 0) score -= Math.min(20, daysOver * 2);
  }

  // Open flags
  const CRITICAL = new Set(['failed_payment', 'non_responsive', 'missed_posting', 'overdue_batch']);
  for (const f of flags || []) {
    if (CRITICAL.has(f.type)) score -= 15;
    else score -= 7;
  }

  // Recent engagement bonus: touchpoints in last 7 days
  const weekAgo = now - 7 * 86400000;
  const recent = (recentTps || []).filter(t => new Date(t.created_at).getTime() > weekAgo).length;
  if (recent >= 3) score += 5;
  else if (recent === 0) score -= 10;

  return Math.max(0, Math.min(100, Math.round(score)));
}

function healthBand(score) {
  if (score >= 80) return 'healthy';
  if (score >= 60) return 'watch';
  if (score >= 40) return 'at_risk';
  return 'critical';
}

// ---------- Executive Metrics (investor-grade dashboard data) ----------
router.get('/metrics', async (_req, res) => {
  try {
    const now = new Date();
    const day90 = addDays(now, -90);
    const day30 = addDays(now, -30);
    const day14 = addDays(now, -14);
    const day7  = addDays(now, -7);

    const [
      { data: clients },
      { data: timers },
      { data: flags },
      { data: touchpoints90 },
      { data: savePlans }
    ] = await Promise.all([
      supabase.from('clients').select('*'),
      supabase.from('timers').select('*'),
      supabase.from('situation_flags').select('*'),
      supabase.from('touchpoints').select('client_id, type, created_at').gte('created_at', day90.toISOString()).order('created_at', { ascending: true }),
      supabase.from('save_plans').select('*')
    ]);

    const tpsByClient = {};
    const flagsByClient = {};
    const timersByClient = {};
    for (const t of touchpoints90 || []) (tpsByClient[t.client_id] = tpsByClient[t.client_id] || []).push(t);
    for (const f of (flags || []).filter(f => !f.resolved_at)) (flagsByClient[f.client_id] = flagsByClient[f.client_id] || []).push(f);
    for (const t of timers || []) (timersByClient[t.client_id] = timersByClient[t.client_id] || []).push(t);

    // Client health distribution
    const healthScores = [];
    const healthByClient = {};
    for (const c of clients || []) {
      if (c.status === 'churned') continue;
      const s = computeHealthScore(c, timersByClient[c.id], flagsByClient[c.id], tpsByClient[c.id]);
      healthScores.push(s);
      healthByClient[c.id] = { score: s, band: healthBand(s), name: c.name };
    }
    const healthDist = { healthy: 0, watch: 0, at_risk: 0, critical: 0 };
    for (const s of healthScores) healthDist[healthBand(s)]++;
    const avgHealth = healthScores.length ? Math.round(healthScores.reduce((a, b) => a + b, 0) / healthScores.length) : 0;

    // Cohort breakdown
    const cohorts = { new: 0, active_happy: 0, active_hands_off: 0, cancelling: 0, churned: 0 };
    for (const c of clients || []) cohorts[c.cohort || 'active_happy'] = (cohorts[c.cohort || 'active_happy'] || 0) + 1;

    // Touchpoint velocity (90d daily buckets)
    const buckets = {};
    for (let i = 0; i < 90; i++) {
      const d = addDays(now, -i).toISOString().slice(0, 10);
      buckets[d] = 0;
    }
    for (const t of touchpoints90 || []) {
      const d = new Date(t.created_at).toISOString().slice(0, 10);
      if (d in buckets) buckets[d]++;
    }
    const velocitySeries = Object.entries(buckets).sort().map(([date, count]) => ({ date, count }));

    // Touchpoint counts by type (last 30d)
    const byType = {};
    for (const t of touchpoints90 || []) {
      if (new Date(t.created_at) < day30) continue;
      byType[t.type] = (byType[t.type] || 0) + 1;
    }

    // Active clients
    const activeTotal = (clients || []).filter(c => c.status !== 'churned').length;
    const newThisMonth = (clients || []).filter(c => {
      if (!c.created_at) return false;
      const d = new Date(c.created_at);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;

    // Churn / save rates (last 90d)
    const churnedRecent = (clients || []).filter(c => c.status === 'churned' && c.updated_at && new Date(c.updated_at) > day90).length;
    const savePlansTotal = (savePlans || []).length;
    const savesWon  = (savePlans || []).filter(p => p.status === 'saved').length;
    const savesLost = (savePlans || []).filter(p => p.status === 'lost').length;
    const saveRate = (savesWon + savesLost) > 0 ? Math.round(savesWon / (savesWon + savesLost) * 100) : null;

    // Flags open + resolved-this-week
    const openFlags = (flags || []).filter(f => !f.resolved_at).length;
    const resolvedThisWeek = (flags || []).filter(f => f.resolved_at && new Date(f.resolved_at) > day7).length;

    // Response time (median hours from flag opened → resolved) over last 30d
    const resolved30 = (flags || []).filter(f => f.resolved_at && new Date(f.resolved_at) > day30);
    const resolveTimes = resolved30.map(f => (new Date(f.resolved_at) - new Date(f.created_at)) / 3600000);
    resolveTimes.sort((a, b) => a - b);
    const medianResolveH = resolveTimes.length ? Math.round(resolveTimes[Math.floor(resolveTimes.length / 2)] * 10) / 10 : null;

    // Top-at-risk (lowest health, non-churned)
    const atRisk = Object.entries(healthByClient)
      .sort((a, b) => a[1].score - b[1].score)
      .slice(0, 5)
      .map(([id, v]) => ({ id, ...v }));

    // Touchpoints this week / last week for delta
    const tpsThisWeek = (touchpoints90 || []).filter(t => new Date(t.created_at) > day7).length;
    const tpsLastWeek = (touchpoints90 || []).filter(t => {
      const d = new Date(t.created_at);
      return d > addDays(day7, -7) && d <= day7;
    }).length;

    res.json({
      kpis: {
        active_clients: activeTotal,
        new_this_month: newThisMonth,
        avg_health: avgHealth,
        open_flags: openFlags,
        tps_this_week: tpsThisWeek,
        tps_last_week: tpsLastWeek,
        tps_delta_pct: tpsLastWeek ? Math.round(((tpsThisWeek - tpsLastWeek) / tpsLastWeek) * 100) : null,
        save_rate: saveRate,
        saves_won: savesWon,
        saves_lost: savesLost,
        churned_recent: churnedRecent,
        median_resolve_hours: medianResolveH,
        resolved_this_week: resolvedThisWeek
      },
      health_distribution: healthDist,
      cohorts,
      velocity_series: velocitySeries,
      touchpoints_by_type_30d: byType,
      top_at_risk: atRisk,
      generated_at: now.toISOString()
    });
  } catch (e) {
    console.error('metrics error', e);
    res.status(500).json({ error: e.message });
  }
});

// Health score for a single client (used by ClientDetailDrawer)
router.get('/health/:clientId', async (req, res) => {
  try {
    const cutoff = addDays(new Date(), -30).toISOString();
    const [{ data: client }, { data: timers }, { data: flags }, { data: tps }] = await Promise.all([
      supabase.from('clients').select('*').eq('id', req.params.clientId).single(),
      supabase.from('timers').select('*').eq('client_id', req.params.clientId),
      supabase.from('situation_flags').select('*').eq('client_id', req.params.clientId).is('resolved_at', null),
      supabase.from('touchpoints').select('*').eq('client_id', req.params.clientId).gte('created_at', cutoff).order('created_at', { ascending: true })
    ]);
    const score = computeHealthScore(client, timers, flags, tps);

    // 30d daily sparkline
    const buckets = {};
    for (let i = 0; i < 30; i++) {
      const d = addDays(new Date(), -i).toISOString().slice(0, 10);
      buckets[d] = 0;
    }
    for (const t of tps || []) {
      const d = new Date(t.created_at).toISOString().slice(0, 10);
      if (d in buckets) buckets[d]++;
    }
    const sparkline = Object.entries(buckets).sort().map(([date, count]) => ({ date, count }));

    res.json({ score, band: healthBand(score), sparkline, flags: flags || [], timers: timers || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---------- Weekly Executive Digest ----------
router.get('/exec-digest', async (_req, res) => {
  try {
    const now = new Date();
    const weekAgo = addDays(now, -7);

    const [{ data: clients }, { data: tps }, { data: flags }, { data: savePlans }] = await Promise.all([
      supabase.from('clients').select('*'),
      supabase.from('touchpoints').select('*').gte('created_at', weekAgo.toISOString()),
      supabase.from('situation_flags').select('*').gte('created_at', weekAgo.toISOString()),
      supabase.from('save_plans').select('*').gte('created_at', weekAgo.toISOString())
    ]);

    const active = (clients || []).filter(c => c.status !== 'churned').length;
    const newThisWeek = (clients || []).filter(c => c.created_at && new Date(c.created_at) > weekAgo).length;
    const churnedThisWeek = (clients || []).filter(c => c.status === 'churned' && c.updated_at && new Date(c.updated_at) > weekAgo).length;
    const loomsSent = (tps || []).filter(t => t.type === 'loom_sent').length;
    const callsOffered = (tps || []).filter(t => t.type === 'call_offered').length;
    const callsCompleted = (tps || []).filter(t => t.type === 'call_completed').length;
    const flagsRaised = flags?.length || 0;
    const flagsResolved = (flags || []).filter(f => f.resolved_at).length;
    const savesStarted = savePlans?.length || 0;
    const savesWon = (savePlans || []).filter(p => p.status === 'saved').length;

    res.json({
      week_ending: now.toISOString().slice(0, 10),
      summary: {
        active_clients: active,
        new_this_week: newThisWeek,
        churned_this_week: churnedThisWeek,
        net_change: newThisWeek - churnedThisWeek,
        looms_sent: loomsSent,
        calls_offered: callsOffered,
        calls_completed: callsCompleted,
        flags_raised: flagsRaised,
        flags_resolved: flagsResolved,
        save_plans_started: savesStarted,
        save_plans_won: savesWon
      }
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---------- Settings (cadence config) ----------
router.get('/settings', async (req, res) => {
  try {
    const userEmail = req.user?.email || 'default';
    const { data } = await supabase.from('user_settings').select('*').eq('user_email', userEmail).maybeSingle();
    res.json(data || {
      user_email: userEmail,
      loom_interval_days: 21,
      call_interval_days: 60,
      billing_check_days: [1, 14],
      greeting_name: null
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/settings', async (req, res) => {
  try {
    const userEmail = req.user?.email || 'default';
    const { loom_interval_days, call_interval_days, greeting_name } = req.body || {};
    const patch = { user_email: userEmail, loom_interval_days, call_interval_days, greeting_name, updated_at: new Date().toISOString() };
    const { data: existing } = await supabase.from('user_settings').select('id').eq('user_email', userEmail).maybeSingle();
    if (existing) {
      const { data, error } = await supabase.from('user_settings').update(patch).eq('id', existing.id).select().single();
      if (error) throw error;
      res.json(data);
    } else {
      const { data, error } = await supabase.from('user_settings').insert(patch).select().single();
      if (error) throw error;
      res.json(data);
    }
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
