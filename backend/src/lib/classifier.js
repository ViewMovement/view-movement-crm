// AI classifier: bucket Slack messages by urgency + extract summary & suggested action.
// Uses Anthropic API with ANTHROPIC_API_KEY env var.
// Falls back to heuristic-only classification if key is missing.

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';

const URGENT_KEYWORDS = /\b(urgent|asap|emergency|broken|bug|down|not working|failed|failure|angry|upset|refund|cancel|cancelling|chargeback|lawyer|legal|issue|problem|stuck|blocker|blocked|stopped|missed|late|overdue)\b/i;
const HEADS_UP_KEYWORDS = /\b(question|wondering|could you|can you|please|help|need|waiting|followup|follow up|check|unclear|confused|when will)\b/i;

function heuristic(text) {
  if (!text) return { urgency: 'fyi', category: 'other', summary: '(empty)', suggested_action: null };
  const t = text.trim();
  if (URGENT_KEYWORDS.test(t)) return { urgency: 'urgent', category: 'issue', summary: summarize(t), suggested_action: 'Review immediately' };
  if (HEADS_UP_KEYWORDS.test(t)) return { urgency: 'heads_up', category: 'request', summary: summarize(t), suggested_action: 'Respond when possible' };
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

For each message below, classify:
- urgency: "urgent" (client angry, payment failed, cancellation, broken delivery, escalation, legal, blocker), "heads_up" (question, reasonable request, needs response), or "fyi" (update, chit-chat, automation noise)
- category: one of [issue, cancellation, payment, question, status_update, request, feedback, other]
- summary: 1 short sentence (< 140 chars)
- suggested_action: a specific next step for the ops manager, or null if none

Return ONLY a JSON array, same length and order as input. Each object: { "urgency", "category", "summary", "suggested_action" }.

Messages:
${messages.map((m, i) => `[${i}] #${m.channel_name} | ${m.sender_name || 'unknown'}: ${summarize(m.text || '')}`).join('\n')}`;

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
  const prompt = `Write a brief daily Slack pulse for View Movement's ops manager. Be direct and scannable. Use markdown with short bullet lists.

- Total items: ${items.length}
- Urgent: ${items.filter(i => i.urgency === 'urgent').length}
- Heads up: ${items.filter(i => i.urgency === 'heads_up').length}
- FYI: ${items.filter(i => i.urgency === 'fyi').length}
- Channels with no activity in 4+ days: ${inactiveChannels.length}

Urgent items:
${items.filter(i => i.urgency === 'urgent').map(i => `- #${i.channel_name}: ${i.summary}`).join('\n') || '(none)'}

Heads-up items:
${items.filter(i => i.urgency === 'heads_up').slice(0, 10).map(i => `- #${i.channel_name}: ${i.summary}`).join('\n') || '(none)'}

Inactive channels (4+ days quiet):
${inactiveChannels.map(c => `- #${c.name} (last activity ${c.last_activity_at || 'never'})`).join('\n') || '(none)'}

Write 3-5 sentences covering: what needs attention today, any patterns worth noting, and which channels are going dark. Do not invent details not given. End with the single most important next step.`;

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
