// Results-First Loom Entries — 5-beat retention framework
// Beat 1: Performance Snapshot (metrics) — required
// Beat 2: Wins (value anchor)
// Beat 3: Strategy Recommendation (proactive)
// Beat 4: Content Plan (what's next)
// Beat 5: Client Ask (engagement loop)
import { Router } from 'express';
import { supabase } from '../lib/supabase.js';
import { logTouchpoint, resetTimer } from '../lib/clientOps.js';

const router = Router();

// POST /api/looms — create a structured loom entry + reset timer
router.post('/', async (req, res) => {
  try {
    const {
      client_id, topic,
      // New 5-beat fields
      performance_snapshot, wins, strategy_recommendation, content_plan, client_ask,
      // Optional enrichment
      metrics_snapshot, loom_url, duration_secs,
      // Expectations Loom flag
      is_expectations_loom,
      // Legacy fields (backward compat)
      updates, next_steps, ask
    } = req.body;

    if (!client_id || !topic) return res.status(400).json({ error: 'client_id and topic required' });

    const entry = {
      client_id,
      topic: topic.trim(),
      // 5-beat fields (fallback to legacy field names)
      performance_snapshot: performance_snapshot?.trim() || null,
      wins: wins?.trim() || null,
      strategy_recommendation: (strategy_recommendation || updates)?.trim() || null,
      content_plan: (content_plan || next_steps)?.trim() || null,
      client_ask: (client_ask || ask)?.trim() || null,
      // Keep legacy columns populated for backward compat
      updates: (strategy_recommendation || updates)?.trim() || null,
      next_steps: (content_plan || next_steps)?.trim() || null,
      ask: (client_ask || ask)?.trim() || null,
      // Enrichment
      metrics_snapshot: metrics_snapshot || null,
      loom_url: loom_url?.trim() || null,
      duration_secs: duration_secs ? Number(duration_secs) : null,
      sent_by: req.user?.email || 'unknown',
      sent_at: new Date().toISOString()
    };

    const { data, error } = await supabase.from('loom_entries').insert(entry).select().single();
    if (error) throw error;

    // Build a rich touchpoint summary
    const parts = [`Loom: ${topic}`];
    if (entry.performance_snapshot) parts.push(`📊 ${entry.performance_snapshot.slice(0, 100)}`);
    if (entry.wins) parts.push(`✓ ${entry.wins.slice(0, 80)}`);
    const summary = parts.join(' | ');

    await logTouchpoint(client_id, 'loom_sent', summary);
    await resetTimer(client_id, 'loom').catch(() => {});

    // Mark expectations loom sent on the client record
    if (is_expectations_loom) {
      await supabase.from('clients')
        .update({ expectations_loom_sent_at: new Date().toISOString() })
        .eq('id', client_id);
    }

    res.status(201).json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/looms/:id/responded — mark that client responded to the ask
router.patch('/:id/responded', async (req, res) => {
  try {
    const { data, error } = await supabase.from('loom_entries')
      .update({ client_responded: true, client_responded_at: new Date().toISOString() })
      .eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/looms/:id/discord — mark that Discord handoff note was sent
router.patch('/:id/discord', async (req, res) => {
  try {
    const { data, error } = await supabase.from('loom_entries')
      .update({ discord_note_sent: true, discord_note_sent_at: new Date().toISOString() })
      .eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
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

// GET /api/looms/unresponded — looms where client hasn't responded (retention signal)
router.get('/unresponded', async (req, res) => {
  try {
    const cutoff = new Date(Date.now() - 7 * 86400000).toISOString();
    const { data, error } = await supabase.from('loom_entries')
      .select('*, clients(id, name, status, email)')
      .eq('client_responded', false)
      .not('client_ask', 'is', null)
      .lte('sent_at', cutoff)
      .order('sent_at', { ascending: true })
      .limit(20);
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
