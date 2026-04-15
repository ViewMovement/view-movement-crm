// Slack Pulse routes: list items, mark seen, latest digest, manual run.
import { Router } from 'express';
import { supabase } from '../lib/supabase.js';
import { runSlackDigestOnce } from '../jobs/slackDigest.js';

const router = Router();

// GET /api/slack/pulse?seen=unseen|all&urgency=urgent|heads_up|fyi
router.get('/pulse', async (req, res) => {
  try {
    const { seen = 'unseen', urgency, limit = 200 } = req.query;
    let q = supabase.from('slack_pulse_items')
      .select('*, channel:slack_channels(name, slack_channel_id)')
      .order('created_at', { ascending: false })
      .limit(Number(limit));
    if (seen === 'unseen') q = q.is('seen_at', null);
    if (urgency) q = q.eq('urgency', urgency);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/slack/pulse/:id/seen — dismiss
router.post('/pulse/:id/seen', async (req, res) => {
  try {
    const { data, error } = await supabase.from('slack_pulse_items')
      .update({ seen_at: new Date().toISOString() }).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/slack/pulse/seen-all — dismiss all unseen
router.post('/pulse/seen-all', async (_req, res) => {
  try {
    const { error } = await supabase.from('slack_pulse_items')
      .update({ seen_at: new Date().toISOString() }).is('seen_at', null);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/slack/digest — latest digest
router.get('/digest', async (_req, res) => {
  try {
    const { data } = await supabase.from('slack_digests')
      .select('*').order('digest_date', { ascending: false }).limit(1).maybeSingle();
    res.json(data || null);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/slack/channels/inactive — channels with no activity in 4+ days
router.get('/channels/inactive', async (_req, res) => {
  try {
    const cutoff = new Date(Date.now() - 4 * 86400 * 1000).toISOString();
    const { data } = await supabase.from('slack_channels')
      .select('*').eq('is_archived', false).or(`last_activity_at.is.null,last_activity_at.lt.${cutoff}`);
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/slack/run-now — manual trigger (admin-guarded by SEED_TOKEN)
router.post('/run-now', async (req, res) => {
  const token = req.header('x-seed-token');
  if (!process.env.SEED_TOKEN || token !== process.env.SEED_TOKEN) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  try {
    const lookback = Number(req.query.hours || req.body?.lookback_hours || 24);
    const result = await runSlackDigestOnce({ lookbackHours: lookback });
    res.json({ ok: true, result });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/slack/status — config check (no secrets leaked)
router.get('/status', async (_req, res) => {
  res.json({
    slack_configured: !!process.env.SLACK_BOT_TOKEN,
    anthropic_configured: !!process.env.ANTHROPIC_API_KEY,
    inactive_threshold_days: Number(process.env.SLACK_INACTIVE_DAYS || 4),
    digest_hour: Number(process.env.SLACK_DIGEST_HOUR || 5),
    auto_join: (process.env.SLACK_AUTO_JOIN || 'true') !== 'false'
  });
});

export default router;
