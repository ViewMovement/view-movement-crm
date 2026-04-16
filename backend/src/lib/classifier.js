// AI classifier: bucket Slack messages by urgency + extract summary & suggested action.
// Uses Anthropic API with ANTHROPIC_API_KEY env var.
// Falls back to heuristic-only classification if key is missing.

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';

// Conservative heuristic fallback. We deliberately LEAN TOWARD fyi so the dashboard stays calm.
const URGENT_KEYWORDS = /\b(cancel(ling|led)?|chargeback|refund|lawyer|legal|lawsuit|escalat|terminat(e|ing)|furious|unacceptable|breach|emergency)\b/i;
const HEADS_UP_KEYWORDS = /\b(blocked|blocker|stuck|waiting on|need (a )?(decision|answer|approval)|approve\??|sign.?off)\b/i;

function heuristic(text) {
  if (!text) return { urgency: 'fyi', category: 'other', summary: '(empty)', suggested_action: null };
  const t = text.trim();
  if (URGENT_KEYWORDS.test(t)) return { urgency: 'urgent', category: 'issue', summary: summarize(t), suggested_action: 'Review today' };
  if (HEADS_UP_KEYWORDS.test(t)) return { urgency: 'heads_up', category: 'request', summary: summarize(t), suggested_action: 'Respond this week' };
  return { urgency: 'fyi', category: 'update', summary: summarize(t), suggested_action: null };
}

function summarize(text) {
  const clean = text.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  return clean.length > 160 ? clean.slice(0, 157) + '…' : clean;
}

// Classify a batch of messages in one LLM call for efficiency.
export async function classifyBatch(messages) {
  if (!messages.length) return [];
  if (!process.env.ANTHROPIC_API_KEY) {
    return messages.map(m => ({ ...m, ...heuristic(m.text) }));
  }

  const prompt = `You are the Slack triage assistant for View Movement, a content agency client success CRM.

The ops manager is drowning. Be RUTHLESSLY CONSERVATIVE. The dashboard must only surface things that genuinely need human attention this week. Everything else is "fyi" (which gets hidden). Default to "fyi" whenever in doubt.

URGENCY RUBRIC:
- "urgent" — ONLY for: active cancellation threats, chargebacks, refund demands, legal/lawyer mentions, unambiguous contract breach claims, escalating anger, or a delivery outage blocking client work TODAY. If the message reads like a normal complaint or annoyance, it is NOT urgent.
- "heads_up" — ONLY for: an explicit unanswered question directed at the team, a pending decision/approval that is actively blocking work, or a deadline <48h away. A polite check-in or FYI is NOT heads_up.
- "fyi" — everything else: social chatter, confirmations, updates, drafts, routine back-and-forth, bot noise, anything the ops manager can safely skip.

Additional rules:
- If multiple messages in the batch are from the same thread/topic, usually only the latest one might warrant non-fyi. The others should be fyi.
- Do not mark intro messages, welcomes, "thanks", "got it", or status pings as anything but fyi.
- Scheduling messages are fyi unless a deadline <48h is stated.

TEAM AWARENESS (IMPORTANT):
View Movement team members include (but aren't limited to): Ty Hageman, Gabe, Catarina, Staci, Johnny, and any account posting as "View Movement" or tied to view-movement---content. Everyone else in these channels — the people whose name matches the channel slug (e.g. Gary Taubes in #gary-taubes), guests, clients' staff — are CLIENTS.
You can also infer team vs client from communication patterns: team members speak with operational, internal voice (delivery updates, scheduling, coordinating with "the team"), while clients speak about their own goals, content, needs. When in doubt, infer.

Apply this rule:
- If the MOST RECENT message in a channel is from a team member, the conversation is handled → every item in that channel is fyi.
- If a client's message has ALREADY been answered by any team member that came after it, it is fyi.
- Only flag urgent/heads_up on the latest client-side message when the team has NOT yet replied to it.
- Team members' own messages are fyi unless they contain something flagging a real external crisis.

For each message return:
- urgency: "urgent" | "heads_up" | "fyi"
- category: one of [issue, cancellation, payment, question, status_update, request, feedback, other]
- summary: 1 short sentence (< 120 chars) — plain, no hype
- suggested_action: a specific next step, or null for fyi

Return ONLY a JSON array, same length and order as input. Each object: { "urgency", "category", "summary", "suggested_action" }.

Messages (ordered oldest→newest within each channel):
${messages.map((m, i) => `[${i}] #${m.channel_name} | ${m.sender_name || 'unknown'} (${m.from_team ? 'team' : 'client'}): ${summarize(m.text || '')}`).join('\n')}`;

  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    if (!res.ok) throw new Error(`Anthropic ${res.status}`);
    const data = await res.json();
    const text = data.content?.[0]?.text || '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('no JSON in response');
    const parsed = JSON.parse(jsonMatch[0]);
    return messages.map((m, i) => ({ ...m, ...(parsed[i] || heuristic(m.text)) }));
  } catch (e) {
    console.warn('[classifier] LLM failed, falling back to heuristic:', e.message);
    return messages.map(m => ({ ...m, ...heuristic(m.text) }));
  }
}

// Generate a daily executive summary from the classified items.
export async function summarizeDigest(items, inactiveChannels) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return buildHeuristicDigest(items, inactiveChannels);
  }
  const urgent = items.filter(i => i.urgency === 'urgent');
  const heads = items.filter(i => i.urgency === 'heads_up');
  const prompt = `Write a TIGHT daily Slack pulse for View Movement's ops manager. They want a calm, short read-out — NOT a wall of text. Maximum 5 short sentences total. No headings. No sub-bullets. Plain prose.

Data:
- ${urgent.length} urgent, ${heads.length} heads-up, ${inactiveChannels.length} channels quiet 4+ days.

Urgent items:
${urgent.map(i => `- #${i.channel_name}: ${i.summary}`).join('\n') || '(none)'}

Heads-up items:
${heads.slice(0, 10).map(i => `- #${i.channel_name}: ${i.summary}`).join('\n') || '(none)'}

Quiet channels: ${inactiveChannels.map(c => '#' + c.name).join(', ') || '(none)'}

Write in this exact shape:
- 1 sentence on what (if anything) is genuinely pressing today.
- 1 sentence on any pattern across channels (only if clear).
- 1 sentence on dormant channels worth a check-in.
- 1 sentence with the single most important next step.

If there's nothing pressing, say so plainly in one sentence and stop. Do NOT invent details.`;

  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({ model: MODEL, max_tokens: 800, messages: [{ role: 'user', content: prompt }] })
    });
    if (!res.ok) throw new Error(`Anthropic ${res.status}`);
    const data = await res.json();
    return data.content?.[0]?.text || buildHeuristicDigest(items, inactiveChannels);
  } catch (e) {
    console.warn('[digest] LLM failed:', e.message);
    return buildHeuristicDigest(items, inactiveChannels);
  }
}

// Pick the channel most likely referenced by the user's question.
export async function pickChannelForQuestion(question, channels) {
  if (!process.env.ANTHROPIC_API_KEY) {
    // Heuristic: simple substring match against names (slug-aware)
    const q = question.toLowerCase();
    const tokens = q.replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
    let best = null, bestScore = 0;
    for (const c of channels) {
      const parts = c.name.split(/[-_]/);
      let score = 0;
      for (const t of tokens) {
        if (c.name.includes(t)) score += 2;
        if (parts.includes(t)) score += 3;
      }
      if (score > bestScore) { bestScore = score; best = c; }
    }
    return best;
  }
  const prompt = `Given this question from an ops manager and the list of Slack channels below, pick the ONE channel most likely referenced. Client channels are slug-formatted (first-last name).

Question: "${question}"

Channels:
${channels.map(c => '#' + c.name).join(', ')}

Reply with ONLY the channel name (no # prefix, no explanation). If nothing is a clear match, reply with the single word NONE.`;
  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODEL, max_tokens: 40, messages: [{ role: 'user', content: prompt }] })
    });
    if (!res.ok) throw new Error('anthropic ' + res.status);
    const data = await res.json();
    const ans = (data.content?.[0]?.text || '').trim().replace(/^#/, '').split(/\s+/)[0];
    if (!ans || ans.toUpperCase() === 'NONE') return null;
    return channels.find(c => c.name === ans) || null;
  } catch (e) {
    console.warn('[ask] channel pick failed:', e.message);
    return null;
  }
}

// Produce a synopsis answering `question` given recent channel messages.
export async function answerFromMessages(question, channelName, messages) {
  if (!process.env.ANTHROPIC_API_KEY) {
    const lines = messages.map(m => `- ${m.sender_name || 'unknown'}: ${summarize(m.text || '')}`).join('\n');
    return `Recent activity in #${channelName}:\n${lines}`;
  }
  const transcript = messages.map(m => `${m.sender_name || 'unknown'}: ${m.text || ''}`).join('\n---\n');
  const prompt = `You are a client-success analyst for View Movement. The ops manager asked: "${question}"

Below is the recent transcript from the #${channelName} Slack channel (most recent first). Read it and write a concise synopsis that directly answers the question.

Format:
- Status: one sentence on where things stand today.
- What's open: up to 3 short bullets on pending items, decisions, or blockers. If none, say "Nothing pending."
- Last touch: who spoke last and when, and what they said (in 1 line).
- Next step: the single most useful thing the ops manager should do.

Stay grounded in the transcript. Do not invent facts. If the transcript is empty or unrelated, say so plainly.

Transcript:
${transcript || '(no messages)'}`;
  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODEL, max_tokens: 600, messages: [{ role: 'user', content: prompt }] })
    });
    if (!res.ok) throw new Error('anthropic ' + res.status);
    const data = await res.json();
    return data.content?.[0]?.text || '(no answer)';
  } catch (e) {
    return `Couldn't reach AI: ${e.message}. Recent messages in #${channelName}:\n` +
      messages.slice(0, 10).map(m => `- ${m.sender_name || 'unknown'}: ${summarize(m.text || '')}`).join('\n');
  }
}

function buildHeuristicDigest(items, inactive) {
  const urgent = items.filter(i => i.urgency === 'urgent');
  const heads = items.filter(i => i.urgency === 'heads_up');
  let md = `**Slack pulse — ${new Date().toISOString().slice(0, 10)}**\n\n`;
  md += `${items.length} items (${urgent.length} urgent, ${heads.length} heads-up).\n\n`;
  if (urgent.length) {
    md += `**Needs attention today:**\n`;
    for (const u of urgent) md += `- #${u.channel_name}: ${u.summary}\n`;
    md += '\n';
  }
  if (inactive.length) {
    md += `**Quiet channels (4+ days):** ${inactive.map(c => '#' + c.name).join(', ')}\n`;
  }
  return md;
}
