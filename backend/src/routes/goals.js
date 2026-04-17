// Client Goals — goal-setting framework for retention specialist
import { Router } from 'express';
import { supabase } from '../lib/supabase.js';

const router = Router();

// GET /api/goals/client/:clientId — goal history for a client
router.get('/client/:clientId', async (req, res) => {
  try {
    const { data, error } = await supabase.from('client_goals')
      .select('*')
      .eq('client_id', req.params.clientId)
      .order('set_at', { ascending: false })
      .limit(20);
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/goals/active — all clients' active goals (for dashboard / monthly review)
router.get('/active', async (req, res) => {
  try {
    const { data, error } = await supabase.from('client_goals')
      .select('*, clients(id, name, status, mrr, service_start_date)')
      .eq('status', 'active')
      .order('period_end', { ascending: true });
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/goals/review — goals whose period has ended but are still active (need monthly review)
router.get('/review', async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabase.from('client_goals')
      .select('*, clients(id, name, status, mrr, service_start_date)')
      .eq('status', 'active')
      .lte('period_end', today)
      .order('period_end', { ascending: true });
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/goals — create a new goal for a client
router.post('/', async (req, res) => {
  try {
    const { client_id, metric, target_value, target_label, breakout_target, period_start, period_end } = req.body;
    if (!client_id || !metric || !target_value) {
      return res.status(400).json({ error: 'client_id, metric, and target_value required' });
    }

    // Close any existing active goals for this client (mark as adjusted)
    await supabase.from('client_goals')
      .update({ status: 'adjusted', outcome_notes: 'Superseded by new goal' })
      .eq('client_id', client_id)
      .eq('status', 'active');

    const entry = {
      client_id,
      metric: metric.trim(),
      target_value: target_value.toString().trim(),
      target_label: target_label?.trim() || null,
      breakout_target: breakout_target?.toString().trim() || null,
      period_start: period_start || new Date().toISOString().slice(0, 10),
      period_end: period_end || new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      set_by: req.user?.email || 'unknown',
      status: 'active'
    };

    const { data, error } = await supabase.from('client_goals').insert(entry).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/goals/:id — update goal (close out with outcome, adjust, etc.)
router.patch('/:id', async (req, res) => {
  try {
    const allowed = ['status', 'outcome_value', 'outcome_notes', 'target_value', 'target_label',
      'breakout_target', 'period_end', 'metric'];
    const updates = {};
    for (const k of allowed) { if (req.body[k] !== undefined) updates[k] = req.body[k]; }

    const { data, error } = await supabase.from('client_goals')
      .update(updates).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
