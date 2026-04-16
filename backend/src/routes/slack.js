// Slack Pulse routes: list items, mark seen, latest digest, manual run.
import { Router } from 'express';
import { supabase } from '../lib/supabase.js';
import { runSlackDigestOnce } from '../jobs/slackDigest.js';
import { channelHistory, resolveUser } from '../lib/slackClient.js';
import { pickChannelForQuestion, answerFromMessages } from '../lib/classifier.js';

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

// POST /api/slack/run-now — manual trigger. Admin-guarded by SEED_TOKEN if the
// header is provided; otherwise allowed for same-origin in-app refresh buttons.
router.post('/run-now', async (req, res) => {
  const token = req.header('x-seed-token');
  if (token && process.env.SEED_TOKEN && token !== process.env.SEED_TOKEN) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  try {
    const lookback = Number(req.query.hours || req.body?.lookback_hours || 24);
    const result = await runSlackDigestOnce({ lookbackHours: lookback });
    res.json({ ok: true, result });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/slack/ask — natural-language question. Uses AI to pick channel, fetch recent (or deep), synthesize synopsis.
// body: { question: string, deep?: boolean, channel?: string (optional override) }
router.post('/ask', async (req, res) => {
  try {
    const { question, deep = false, channel: channelOverride } = req.body || {};
    if (!question || typeof question !== 'string') return res.status(400).json({ error: 'question required' });

    // Pull channel list
    const { data: channels } = await supabase.from('slack_channels').select('*').eq('is_archived', false);
    if (!channels?.length) return res.json({ answer: 'No channels tracked yet. Run a scan first.', channel: null });

    let picked = null;
    if (channelOverride) {
      picked = channels.find(c => c.name === channelOverride || c.slack_channel_id === channelOverride);
    }
    if (!picked) picked = await pickChannelForQuestion(question, channels);
    if (!picked) return res.json({ answer: "I couldn't match your question to a specific channel. Try including the client's name.", channel: null });

    // Recent = last 10, deep = last 200
    const limit = deep ? 200 : 10;
    const raw = await channelHistory(picked.slack_channel_id, null, limit);
    const msgs = [];
    for (const m of raw) {
      if (!m.text || m.text.length < 2) continue;
      if (m.bot_id) continue;
      msgs.push({ sender_name: await resolveUser(m.user), text: m.text, ts: m.ts });
    }
    // Oldest-first for readability
    msgs.reverse();

    const answer = await answerFromMessages(question, picked.name, msgs);
    res.json({
      answer,
      channel: { name: picked.name, id: picked.slack_channel_id },
      message_count: msgs.length,
      deep
    });
  } catch (e) {
    console.error('[slack/ask]', e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/slack/status — config check (no secrets leaked)
router.get('/status', async (_req, res) => {
  res.json({
    slack_configured: !!process.env.SLACK_BOT_TOKEN,
    anthropic_configured: !!process.env.ANTHROPIC_API_KEY,
    inactive_threshold_days: Number(process.env.SLACK_INACTIVE_DAYS || 4),
    digest_hour: Number(process.env.SLACK_DIGEST_HOUR || 5),
    auto_join: (process.env.SLACK_AUTO_JOIN || 'true') !== 'false',
    msgs_per_channel: Number(process.env.SLACK_MSGS_PER_CHANNEL || 8),
    max_dashboard_items: Number(process.env.SLACK_MAX_DASHBOARD_ITEMS || 30),
    team_members_configured: !!(process.env.SLACK_TEAM_MEMBERS || '').trim()
  });
});

export default router;
