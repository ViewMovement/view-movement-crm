import { Router } from 'express';
import { supabase } from '../lib/supabase.js';
import {
  createClient, logTouchpoint, resetTimer, recalcTimersForStatusChange, refreshOverdueFlags
} from '../lib/clientOps.js';
import { daysUntil, daysOverdue, daysUntilBilling, HEADS_UP_DAYS, ONBOARDING_REMINDER_DAYS, addDays } from '../lib/cadence.js';

const router = Router();

// GET /api/clients - full list + last touchpoint + both timers
router.get('/', async (req, res) => {
  try {
    await refreshOverdueFlags();
    const { data: clients, error } = await supabase
      .from('clients').select('*').order('created_at', { ascending: false });
    if (error) throw error;

    const ids = clients.map(c => c.id);
    const [{ data: timers }, { data: touchpoints }] = await Promise.all([
      supabase.from('timers').select('*').in('client_id', ids),
      supabase.from('touchpoints').select('*').in('client_id', ids).order('created_at', { ascending: false })
    ]);

    const byClient = {};
    for (const c of clients) byClient[c.id] = { ...c, timers: {}, last_touchpoint: null };
    for (const t of timers || []) byClient[t.client_id].timers[t.timer_type] = t;
    for (const tp of touchpoints || []) {
      if (!byClient[tp.client_id].last_touchpoint) byClient[tp.client_id].last_touchpoint = tp;
    }

    const enriched = Object.values(byClient).map(c => ({
      ...c,
      days_until_billing: daysUntilBilling(c.billing_date),
      onboarding_reminder_active:
        !c.onboarding_reminder_dismissed &&
        !c.onboarding_call_completed &&
        new Date() >= addDays(c.created_at, ONBOARDING_REMINDER_DAYS)
    }));
    res.json(enriched);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/clients/today - Today's Actions (overdue or due-today, grouped by urgency)
router.get('/today', async (req, res) => {
  try {
    await refreshOverdueFlags();
    const now = new Date();
    const cutoff = addDays(now, HEADS_UP_DAYS).toISOString();

    const { data: timers, error } = await supabase
      .from('timers').select('*, clients(*)').lte('next_due_at', cutoff);
    if (error) throw error;

    const items = (timers || []).map(t => {
      const overdue = new Date(t.next_due_at) <= now;
      return {
        client_id: t.client_id,
        client: t.clients,
        timer_type: t.timer_type,
        next_due_at: t.next_due_at,
        is_overdue: overdue,
        days_overdue: overdue ? daysOverdue(t.next_due_at) : 0,
        days_until_due: overdue ? 0 : daysUntil(t.next_due_at),
        label: t.timer_type === 'loom' ? 'Loom' : 'Call Offer'
      };
    });

    // Also surface onboarding check-in reminders (7d after created, one-time).
    const { data: clientsNeedingOnboarding } = await supabase
      .from('clients').select('*')
      .eq('onboarding_reminder_dismissed', false)
      .eq('onboarding_call_completed', false)
      .lte('created_at', addDays(now, -ONBOARDING_REMINDER_DAYS).toISOString());

    for (const c of clientsNeedingOnboarding || []) {
      items.push({
        client_id: c.id, client: c,
        timer_type: 'onboarding_checkin', is_overdue: true,
        days_overdue: daysOverdue(addDays(c.created_at, ONBOARDING_REMINDER_DAYS)),
        label: 'Onboarding Check-in'
      });
    }

    // Sort: churned > red > yellow > green, then most overdue first.
    const order = { churned: 0, red: 1, yellow: 2, green: 3 };
    items.sort((a, b) => {
      const so = (order[a.client.status] ?? 9) - (order[b.client.status] ?? 9);
      if (so !== 0) return so;
      return (b.days_overdue || 0) - (a.days_overdue || 0);
    });

    res.json(items);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/clients/:id - full profile + touchpoints + timers
router.get('/:id', async (req, res) => {
  try {
    const [{ data: client, error }, { data: timers }, { data: touchpoints }] = await Promise.all([
      supabase.from('clients').select('*').eq('id', req.params.id).single(),
      supabase.from('timers').select('*').eq('client_id', req.params.id),
      supabase.from('touchpoints').select('*').eq('client_id', req.params.id).order('created_at', { ascending: false })
    ]);
    if (error) throw error;
    res.json({
      ...client,
      days_until_billing: daysUntilBilling(client.billing_date),
      timers: Object.fromEntries((timers || []).map(t => [t.timer_type, t])),
      touchpoints: touchpoints || []
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/clients - manual create (rare; mainly used by sync job)
router.post('/', async (req, res) => {
  try { res.status(201).json(await createClient(req.body)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/clients/:id - update any field(s); handles status change side effects
router.patch('/:id', async (req, res) => {
  try {
    const updates = { ...req.body };
    const { data: before, error: bErr } = await supabase
      .from('clients').select('status').eq('id', req.params.id).single();
    if (bErr) throw bErr;

    const { data: client, error } = await supabase
      .from('clients').update(updates).eq('id', req.params.id).select().single();
    if (error) throw error;

    if (updates.status && updates.status !== before.status) {
      await recalcTimersForStatusChange(client.id, updates.status);
      await logTouchpoint(client.id, 'status_change', `${before.status} -> ${updates.status}`);
    }
    res.json(client);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/clients/:id/action - "Loom Sent" | "Call Offered" | "Call Completed"
router.post('/:id/action', async (req, res) => {
  try {
    const { type, content } = req.body; // loom_sent | call_offered | call_completed
    if (!['loom_sent', 'call_offered', 'call_completed'].includes(type)) {
      return res.status(400).json({ error: 'Invalid action type' });
    }
    await logTouchpoint(req.params.id, type, content || null);
    if (type === 'loom_sent') await resetTimer(req.params.id, 'loom');
    else await resetTimer(req.params.id, 'call_offer');

    if (type === 'call_completed') {
      await supabase.from('clients').update({
        onboarding_call_completed: true,
        onboarding_call_date: new Date().toISOString(),
        onboarding_reminder_dismissed: true
      }).eq('id', req.params.id).eq('onboarding_call_completed', false);
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/clients/:id/note
router.post('/:id/note', async (req, res) => {
  try {
    if (!req.body?.content?.trim()) return res.status(400).json({ error: 'Note content required' });
    await logTouchpoint(req.params.id, 'note', req.body.content.trim());
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/clients/:id/timers/:timerType/reset - manual timer reset
router.post('/:id/timers/:timerType/reset', async (req, res) => {
  try {
    await resetTimer(req.params.id, req.params.timerType);
    await logTouchpoint(req.params.id, 'system', `Manual reset of ${req.params.timerType} timer`);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/clients/:id/dismiss-onboarding
router.post('/:id/dismiss-onboarding', async (req, res) => {
  try {
    await supabase.from('clients')
      .update({ onboarding_reminder_dismissed: true })
      .eq('id', req.params.id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
