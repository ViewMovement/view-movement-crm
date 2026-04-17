// Structured Loom Entries — replaces simple "loom_sent" touchpoint
import { Router } from 'express';
import { supabase } from '../lib/supabase.js';
import { logTouchpoint, resetTimer } from '../lib/clientOps.js';

const router = Router();

// POST /api/looms — create a structured loom entry + reset timer
router.post('/', async (req, res) => {
  try {
    const { client_id, topic, wins, updates, next_steps, ask, loom_url, duration_secs } = req.body;
    if (!client_id || !topic) return res.status(400).json({ error: 'client_id and topic required' });

    const entry = {
      client_id,
      topic: topic.trim(),
      wins: wins?.trim() || null,
      updates: updates?.trim() || null,
      next_steps: next_steps?.trim() || null,
      ask: ask?.trim() || null,
      loom_url: loom_url?.trim() || null,
      duration_secs: duration_secs ? Number(duration_secs) : null,
      sent_by: req.user?.email || 'unknown',
      sent_at: new Date().toISOString()
    };

    const { data, error } = await supabase.from('loom_entries').insert(entry).select().single();
    if (error) throw error;

    // Also log as touchpoint + reset the loom timer (same side effects as before)
    const summary = `Loom: ${topic}${wins ? ' | Wins: ' + wins : ''}`;
    await logTouchpoint(client_id, 'loom_sent', summary);
    await resetTimer(client_id, 'loom').catch(() => {});

    res.status(201).json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/looms/client/:clientId — loom history for a client
router.get('/client/:clientId', async (req, res) => {
  try {
    const { data, error } = await supabase.from('loom_entries')
      .select('*')
      .eq('client_id', req.params.clientId)
      .order('sent_at', { ascending: false })
      .limit(20);
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
