// Daily Slack digest job. Runs at 5am local time (configurable via SLACK_DIGEST_HOUR).
// Scans every accessible channel, classifies new messages via Claude,
// flags channels inactive for 4+ days, stores results in Supabase.

import { supabase } from '../lib/supabase.js';
import { listAllChannels, channelHistory, resolveUser, permalink, joinChannel } from '../lib/slackClient.js';
import { classifyBatch, summarizeDigest } from '../lib/classifier.js';

const INACTIVE_DAYS = Number(process.env.SLACK_INACTIVE_DAYS || 4);
const LOOKBACK_HOURS = Number(process.env.SLACK_LOOKBACK_HOURS || 24);
const DIGEST_HOUR = Number(process.env.SLACK_DIGEST_HOUR || 5);
const AUTO_JOIN = (process.env.SLACK_AUTO_JOIN || 'true') !== 'false';

let lastRunDate = null;

export async function runSlackDigestOnce({ lookbackHours = LOOKBACK_HOURS } = {}) {
  if (!process.env.SLACK_BOT_TOKEN) {
    console.warn('[slack-digest] SLACK_BOT_TOKEN not configured — skipping');
    return { skipped: true, reason: 'no_token' };
  }

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const since = Math.floor((Date.now() - lookbackHours * 3600 * 1000) / 1000);
  const inactiveCutoff = new Date(Date.now() - INACTIVE_DAYS * 86400 * 1000);

  console.log(`[slack-digest] starting · lookback ${lookbackHours}h · inactive cutoff ${INACTIVE_DAYS}d`);

  // 1. Sync channel list
  const channels = await listAllChannels();
  const channelRowsById = {};
  for (const c of channels) {
    const { data } = await supabase.from('slack_channels').upsert({
      slack_channel_id: c.slack_channel_id,
      name: c.name,
      is_archived: c.is_archived,
      is_private: c.is_private,
      last_synced_at: now.toISOString()
    }, { onConflict: 'slack_channel_id' }).select().single();
    channelRowsById[c.slack_channel_id] = { ...data, is_member: c.is_member };
  }

  // 2. Auto-join public channels the bot isn't in yet (optional)
  if (AUTO_JOIN) {
    for (const c of channels) {
      if (!c.is_private && !c.is_member) {
        const joined = await joinChannel(c.slack_channel_id);
        if (joined) console.log(`[slack-digest] joined #${c.name}`);
      }
    }
  }

  // 3. Collect new messages from every channel
  const rawItems = [];
  let scanned = 0;
  for (const c of channels) {
    try {
      const msgs = await channelHistory(c.slack_channel_id, since);
      scanned++;
      // Track latest activity
      if (msgs.length) {
        const latest = Math.max(...msgs.map(m => parseFloat(m.ts) * 1000));
        await supabase.from('slack_channels')
          .update({ last_activity_at: new Date(latest).toISOString() })
          .eq('slack_channel_id', c.slack_channel_id);
      }
      for (const m of msgs) {
        if (!m.text || m.text.length < 3) continue;
        if (m.bot_id) continue; // skip bot noise
        const sender_name = await resolveUser(m.user);
        rawItems.push({
          channel_id: channelRowsById[c.slack_channel_id].id,
          channel_name: c.name,
          slack_msg_ts: m.ts,
          slack_channel_id: c.slack_channel_id,
          sender_name,
          sender_id: m.user || null,
          text: m.text
        });
      }
    } catch (e) {
      console.warn(`[slack-digest] skip #${c.name}: ${e.message}`);
    }
  }

  // 4. Classify in batches of 15 to keep prompt sizes reasonable
  const classified = [];
  for (let i = 0; i < rawItems.length; i += 15) {
    const batch = rawItems.slice(i, i + 15);
    const result = await classifyBatch(batch);
    classified.push(...result);
  }

  // 5. Resolve permalinks and upsert to slack_pulse_items (dedup by channel+ts)
  let inserted = 0;
  for (const it of classified) {
    const link = await permalink(it.slack_channel_id, it.slack_msg_ts);
    const { error } = await supabase.from('slack_pulse_items').upsert({
      channel_id: it.channel_id,
      slack_msg_ts: it.slack_msg_ts,
      sender_name: it.sender_name,
      sender_id: it.sender_id,
      urgency: it.urgency || 'fyi',
      category: it.category || 'other',
      summary: it.summary || '(no summary)',
      suggested_action: it.suggested_action || null,
      permalink: link,
      raw_text: it.text
    }, { onConflict: 'channel_id,slack_msg_ts', ignoreDuplicates: false });
    if (!error) inserted++;
  }

  // 6. Find inactive channels
  const { data: allChans } = await supabase.from('slack_channels')
    .select('*').eq('is_archived', false);
  const inactive = (allChans || []).filter(c => !c.last_activity_at || new Date(c.last_activity_at) < inactiveCutoff);

  // 7. Build and save daily digest
  const summary = await summarizeDigest(classified, inactive);
  await supabase.from('slack_digests').upsert({
    digest_date: today,
    summary_markdown: summary,
    channels_scanned: scanned,
    items_found: inserted,
    inactive_channels: inactive.map(c => ({ name: c.name, last_activity_at: c.last_activity_at })),
    generated_at: now.toISOString()
  }, { onConflict: 'digest_date' });

  console.log(`[slack-digest] done · ${scanned} channels · ${inserted} items · ${inactive.length} inactive`);
  return { scanned, inserted, inactive: inactive.length, digest_date: today };
}

// Tick every 10 minutes; run once per day at DIGEST_HOUR.
export function startSlackDigestJob() {
  if (!process.env.SLACK_BOT_TOKEN) {
    console.log('[slack-digest] disabled (no SLACK_BOT_TOKEN)');
    return;
  }
  const tick = async () => {
    try {
      const now = new Date();
      const today = now.toISOString().slice(0, 10);
      if (lastRunDate === today) return;
      if (now.getHours() !== DIGEST_HOUR) return;
      await runSlackDigestOnce();
      lastRunDate = today;
    } catch (e) {
      console.error('[slack-digest] tick error:', e);
    }
  };
  setInterval(tick, 10 * 60 * 1000);
  console.log(`[slack-digest] job scheduled · fires at ${DIGEST_HOUR}:00 server time`);
}
