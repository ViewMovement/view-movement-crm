import { Router } from 'express';
import { supabase } from '../lib/supabase.js';
import {
  createNewClient, logTouchpoint, resetTimer, recalcTimersForStatusChange,
  refreshOverdueFlags, createExpectationsLoomTimer, clearExpectationsLoomTimer,
  initTimers,
} from '../lib/clientOps.js';
import { HEADS_UP_DAYS, ONBOARDING_REMINDER_DAYS } from '../lib/cadence.js';

const router = Router();

// GET /api/clients
router.get('/', async (req, res) => {
  try {
    await refreshOverdueFlags();
    const { data: clients, error } = await supabase
      .from('clients')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;

    const ids = clients.map(c => c.id);
    const { data: timers } = await supabase
      .from('timers')
      .select('*')
      .in('client_id', ids);

    const timerMap = {};
    (timers || []).forEach(t => {
      if (!timerMap[t.client_id]) timerMap[t.client_id] = {};
      timerMap[t.client_id][t.timer_type] = t;
    });

    const enriched = clients.map(c => ({ ...c, timers: timerMap[c.id] || {} }));
    res.json(enriched);
  } catch (err) {
    console.error('GET /api/clients', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/clients/today
router.get('/today', async (req, res) => {
  try {
    await refreshOverdueFlags();
    const now = new Date();
    const lookahead = new Date();
    lookahead.setDate(lookahead.getDate() + HEADS_UP_DAYS);

    const { data: overdue } = await supabase
      .from('timers')
      .select('*, clients!inner(id, name, status, company)')
      .eq('is_overdue', true)
      .neq('clients.status', 'churned');

    const { data: dueSoon } = await supabase
      .from('timers')
      .select('*, clients!inner(id, name, status, company)')
      .gt('next_due_at', now.toISOString())
      .lte('next_due_at', lookahead.toISOString())
      .neq('clients.status', 'churned');

    const reminderCutoff = new Date();
    reminderCutoff.setDate(reminderCutoff.getDate() - ONBOARDING_REMINDER_DAYS);
    const { data: onboardingReminders } = await supabase
      .from('clients')
      .select('id, name, company, created_at')
      .eq('onboarding_flag', true)
      .eq('onboarding_call_completed', false)
      .eq('onboarding_reminder_dismissed', false)
      .lte('created_at', reminderCutoff.toISOString());

    res.json({
      overdue: overdue || [],
      dueSoon: dueSoon || [],
      onboardingReminders: onboardingReminders || [],
    });
  } catch (err) {
    console.error('GET /api/clients/today', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/clients/:id
router.get('/:id', async (req, res) => {
  try {
    const { data: client, error } = await supabase
      .from('clients')
      .select('*')
      .eq('id', req.params.id)
      .single();
    if (error) throw error;
    if (!client) return res.status(404).json({ error: 'Not found' });

    const { data: timers } = await supabase
      .from('timers')
      .select('*')
      .eq('client_id', client.id);

    const timerObj = {};
    (timers || []).forEach(t => { timerObj[t.timer_type] = t; });

    const { data: touchpoints } = await supabase
      .from('touchpoints')
      .select('*')
      .eq('client_id', client.id)
      .order('created_at', { ascending: false })
      .limit(200);

    res.json({ ...client, timers: timerObj, touchpoints: touchpoints || [] });
  } catch (err) {
    console.error('GET /api/clients/:id', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/clients
router.post('/', async (req, res) => {
  try {
    const client = await createNewClient(req.body);
    await initTimers(client.id, client.status || 'green');
    res.status(201).json(client);
  } catch (err) {
    console.error('POST /api/clients', err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/clients/:id
router.patch('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const updates = { ...req.body, updated_at: new Date().toISOString() };

    if (updates.status) {
      const { data: current } = await supabase
        .from('clients')
        .select('status')
        .eq('id', id)
        .single();
      if (current && current.status !== updates.status) {
        await logTouchpoint(id, 'status_change', `Status changed from ${current.status} to ${updates.status}`);
        await recalcTimersForStatusChange(id, updates.status);
      }
    }

    const { data, error } = await supabase
      .from('clients')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('PATCH /api/clients/:id', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/clients/:id/action
router.post('/:id/action', async (req, res) => {
  try {
    const id = req.params.id;
    const { action, content } = req.body;

    const { data: client } = await supabase
      .from('clients')
      .select('status')
      .eq('id', id)
      .single();
    const status = client?.status || 'green';

    switch (action) {
      case 'loom_sent':
        await logTouchpoint(id, 'loom_sent', content || 'Loom sent');
        await resetTimer(id, 'loom', status);
        break;
      case 'call_offered':
        await logTouchpoint(id, 'call_offered', content || 'Call offered');
        await resetTimer(id, 'call_offer', status);
        break;
      case 'call_completed':
        await logTouchpoint(id, 'call_completed', content || 'Call completed');
        await supabase
          .from('clients')
          .update({ onboarding_call_completed: true, onboarding_call_date: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq('id', id);
        await createExpectationsLoomTimer(id);
        break;
      case 'expectations_loom_sent':
        await logTouchpoint(id, 'expectations_loom_sent', content || 'Expectations Loom sent');
        await clearExpectationsLoomTimer(id);
        break;
      default:
        return res.status(400).json({ error: 'Unknown action' });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/clients/:id/action', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/clients/:id/note
router.post('/:id/note', async (req, res) => {
  try {
    await logTouchpoint(req.params.id, 'note', req.body.content);
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/clients/:id/note', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/clients/:id/timers/:timerType/reset
router.post('/:id/timers/:timerType/reset', async (req, res) => {
  try {
    const { data: client } = await supabase
      .from('clients')
      .select('status')
      .eq('id', req.params.id)
      .single();
    await resetTimer(req.params.id, req.params.timerType, client?.status || 'green');
    res.json({ ok: true });
  } catch (err) {
    console.error('POST timer reset', err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/clients/:id/lifecycle-steps
router.patch('/:id/lifecycle-steps', async (req, res) => {
  try {
    const { step, value } = req.body;
    const { data: client } = await supabase
      .from('clients')
      .select('lifecycle_steps')
      .eq('id', req.params.id)
      .single();

    const steps = client?.lifecycle_steps || {};
    if (value) {
      steps[step] = true;
    } else {
      delete steps[step];
    }

    const { data, error } = await supabase
      .from('clients')
      .update({ lifecycle_steps: steps, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('PATCH lifecycle-steps', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
