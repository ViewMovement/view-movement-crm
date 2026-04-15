// Slack Web API wrapper. Uses SLACK_BOT_TOKEN env var.
// Bot must have these scopes: channels:read, channels:history, groups:read,
// groups:history, users:read, chat:write (optional).

const BASE = 'https://slack.com/api';

function token() {
  const t = process.env.SLACK_BOT_TOKEN;
  if (!t) throw new Error('SLACK_BOT_TOKEN not configured');
  return t;
}

async function call(method, params = {}, opts = {}) {
  const body = new URLSearchParams(params);
  const res = await fetch(`${BASE}/${method}`, {
    method: opts.method || 'POST',
    headers: {
      Authorization: `Bearer ${token()}`,
      'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8'
    },
    body
  });
  const json = await res.json();
  if (!json.ok) throw new Error(`Slack ${method} error: ${json.error}`);
  return json;
}

export async function listAllChannels() {
  const out = [];
  let cursor;
  do {
    const params = {
      types: 'public_channel,private_channel',
      exclude_archived: 'true',
      limit: '200'
    };
    if (cursor) params.cursor = cursor;
    const r = await call('conversations.list', params);
    for (const c of r.channels || []) {
      // Only channels the bot is a member of (for private; public shows all but read requires membership or public scope)
      out.push({
        slack_channel_id: c.id,
        name: c.name,
        is_archived: c.is_archived || false,
        is_private: c.is_private || false,
        is_member: c.is_member || false
      });
    }
    cursor = r.response_metadata?.next_cursor || null;
  } while (cursor);
  return out;
}

// Fetch messages since a unix timestamp (seconds). Returns array of messages.
export async function channelHistory(channelId, oldestTs) {
  const out = [];
  let cursor;
  do {
    const params = { channel: channelId, limit: '200' };
    if (oldestTs) params.oldest = String(oldestTs);
    if (cursor) params.cursor = cursor;
    let r;
    try {
      r = await call('conversations.history', params);
    } catch (e) {
      // Not a member, archived, etc. — skip silently
      if (String(e.message).includes('not_in_channel')) return out;
      if (String(e.message).includes('channel_not_found')) return out;
      throw e;
    }
    out.push(...(r.messages || []));
    cursor = r.response_metadata?.next_cursor || null;
    if (!r.has_more) break;
  } while (cursor);
  // Exclude bot messages and channel join/leave system events
  return out.filter(m => !m.subtype || ['thread_broadcast'].includes(m.subtype));
}

// Resolve user id to display name (cached in memory for one run)
const userCache = new Map();
export async function resolveUser(userId) {
  if (!userId) return null;
  if (userCache.has(userId)) return userCache.get(userId);
  try {
    const r = await call('users.info', { user: userId });
    const name = r.user?.profile?.real_name || r.user?.profile?.display_name || r.user?.name || userId;
    userCache.set(userId, name);
    return name;
  } catch { return userId; }
}

export async function permalink(channelId, messageTs) {
  try {
    const r = await call('chat.getPermalink', { channel: channelId, message_ts: messageTs });
    return r.permalink || null;
  } catch { return null; }
}

// Try to join a public channel (so the bot can read it). Fails silently.
export async function joinChannel(channelId) {
  try { await call('conversations.join', { channel: channelId }); return true; }
  catch { return false; }
}
