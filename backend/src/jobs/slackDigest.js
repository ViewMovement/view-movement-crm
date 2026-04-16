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
const MSGS_PER_CHANNEL = Number(process.env.SLACK_MSGS_PER_CHANNEL || 8);
const MAX_DASHBOARD_ITEMS = Number(process.env.SLACK_MAX_DASHBOARD_ITEMS || 30);

// Team members (lowercased names or Slack user IDs) — messages from these users count as "our team responded"
function teamMemberSet() {
  const raw = process.env.SLACK_TEAM_MEMBERS || '';
  return new Set(
    raw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  );
}
function isTeamMember(sender_name, sender_id, teamSet) {
  if (!teamSet.size) return false;
  const n = (sender_name || '').toLowerCase();
  const id = (sender_id || '').toLowerCase();
  if (teamSet.has(id)) return true;
  if (teamSet.has(n)) return true;
  // Also match first name / "first last" fragment
  for (const t of teamSet) if (n.includes(t)) return true;
  return false;
}

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

  // 3. Collect new messages from every channel.
  //    Skip channels whose most recent human message is from our team — conversation is handled.
  const teamSet = teamMemberSet();
  const rawItems = [];
  let scanned = 0, handledSkips = 0;
  for (const c of channels) {
    try {
      // Last N messages per channel (default 8) — ignore lookback for relevance/cost
      const msgs = await channelHistory(c.slack_channel_id, null, MSGS_PER_CHANNEL);
      scanned++;
      if (!msgs.length) continue;

      // Track latest activity
      const latest = Math.max(...msgs.map(m => parseFloat(m.ts) * 1000));
      await supabase.from('slack_channels')
        .update({ last_activity_at: new Date(latest).toISOString() })
        .eq('slack_channel_id', c.slack_channel_id);

      // Slack returns most-recent-first. Find the most recent non-bot human message.
      const humanMsgs = msgs.filter(m => m.text && m.text.length >= 3 && !m.bot_id);
      if (!humanMsgs.length) continue;
      const mostRecent = humanMsgs[0];
      const mostRecentName = await resolveUser(mostRecent.user);
      if (teamSet.size && isTeamMember(mostRecentName, mostRecent.user, teamSet)) {
        handledSkips++;
        continue; // ball is in client's court OR we already replied — don't flag
      }

      for (const m of humanMsgs) {
        const sender_name = await resolveUser(m.user);
        const from_team = isTeamMember(sender_name, m.user, teamSet);
        rawItems.push({
          channel_id: channelRowsById[c.slack_channel_id].id,
          channel_name: c.name,
          slack_msg_ts: m.ts,
          slack_channel_id: c.slack_channel_id,
          sender_name,
          sender_id: m.user || null,
          from_team,
          text: m.text
        });
      }
    } catch (e) {
      console.warn(`[slack-digest] skip #${c.name}: ${e.message}`);
    }
  }
  console.log(`[slack-digest] scanned ${scanned}, skipped ${handledSkips} already-handled, collected ${rawItems.length} raw items`);

  // 4. Classify in batches of 15 to keep prompt sizes reasonable
  const classified = [];
  for (let i = 0; i < rawItems.length; i += 15) {
    const batch = rawItems.slice(i, i + 15);
    const result = await classifyBatch(batch);
    classified.push(...result);
  }

  // 5. Keep only urgent + heads_up. Rank (urgent before heads_up, newer first) and cap.
  const ranked = classified
    .filter(it => it.urgency === 'urgent' || it.urgency === 'heads_up')
    .sort((a, b) => {
      const order = { urgent: 0, heads_up: 1 };
      const ua = order[a.urgency] ?? 9;
      const ub = order[b.urgency] ?? 9;
      if (ua !== ub) return ua - ub;
      return parseFloat(b.slack_msg_ts) - parseFloat(a.slack_msg_ts);
    })
    .slice(0, MAX_DASHBOARD_ITEMS);

  // Clear out previous unseen dashboard items so the cap stays tight.
  await supabase.from('slack_pulse_items').delete().is('seen_at', null);

  let inserted = 0;
  for (const it of ranked) {
    const link = await permalink(it.slack_channel_id, it.slack_msg_ts);
    const { error } = await supabase.from('slack_pulse_items').upsert({
      channel_id: it.channel_id,
      slack_msg_ts: it.slack_msg_ts,
      sender_name: it.sender_name,
      sender_id: it.sender_id,
      urgency: it.urgency,
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
