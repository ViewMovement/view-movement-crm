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
