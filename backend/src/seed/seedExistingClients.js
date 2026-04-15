// Seeds the 36 existing clients into the DB.
// All get an immediate pending "New Loom Video" action (loom timer overdue).
// Running this more than once is safe: it upserts on name.
import { supabase } from '../lib/supabase.js';
import { EXISTING_CLIENTS, STATUS_MAP } from './existingClients.js';
import { computeNextDue, addDays } from '../lib/cadence.js';
import { logTouchpoint } from '../lib/clientOps.js';

async function upsertClient(c) {
  const status = STATUS_MAP[c.tier];
  const payload = {
    name: c.name,
    package: null,
    billing_date: c.billing_date ?? null,
    content_source: null,
    status,
    stripe_status: c.stripe ?? null,
    mrr: c.mrr ?? null,
    risk_horizon: c.horizon ?? null,
    reason: c.reason ?? null,
    save_plan_analysis: c.save_plan ?? null,
    action_needed: c.action ?? null,
    loom_links: null,
    onboarding_flag: c.tier === 'F'
  };

  // Find existing by name (idempotent seed).
  const { data: existing } = await supabase
    .from('clients').select('*').eq('name', c.name).maybeSingle();

  let client;
  if (existing) {
    const { data, error } = await supabase
      .from('clients').update(payload).eq('id', existing.id).select().single();
    if (error) throw error;
    client = data;
  } else {
    const { data, error } = await supabase
      .from('clients').insert([payload]).select().single();
    if (error) throw error;
    client = data;
  }

  // If a seeded note exists, preserve it as a note touchpoint (only once).
  if (c.notes) {
    const { data: hasNote } = await supabase
      .from('touchpoints').select('id')
      .eq('client_id', client.id).eq('type', 'note').ilike('content', c.notes.slice(0, 30) + '%').maybeSingle();
    if (!hasNote) await logTouchpoint(client.id, 'note', c.notes);
  }

  // Timers: Loom is already-due today (pending "New Loom Video" action).
  // Call Offer starts on normal cadence from today.
  const now = new Date();
  const loomDue = addDays(now, -1); // overdue by 1 day so it surfaces immediately
  const callDue = computeNextDue(now, status);

  await supabase.from('timers').upsert([
    { client_id: client.id, timer_type: 'loom',       last_reset_at: addDays(now, -15).toISOString(), next_due_at: loomDue.toISOString(), is_overdue: true },
    { client_id: client.id, timer_type: 'call_offer', last_reset_at: now.toISOString(), next_due_at: callDue.toISOString(), is_overdue: false }
  ], { onConflict: 'client_id,timer_type' });

  return client;
}

export async function runSeed() {
  let ok = 0, fail = 0;
  const failures = [];
  for (const c of EXISTING_CLIENTS) {
    try { await upsertClient(c); ok++; }
    catch (e) { console.error(`FAIL ${c.name}:`, e.message); fail++; failures.push({ name: c.name, error: e.message }); }
  }
  return { total: EXISTING_CLIENTS.length, ok, fail, failures };
}

async function main() {
  console.log(`Seeding ${EXISTING_CLIENTS.length} existing clients...`);
  const r = await runSeed();
  console.log(`Done. ok=${r.ok} fail=${r.fail}`);
  process.exit(r.fail ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
