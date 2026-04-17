// Shared client/timer/touchpoint operations used by routes and jobs.
import { supabase } from './supabase.js';
import { computeNextDue, addHours, EXPECTATIONS_LOOM_HOURS } from './cadence.js';

export async function createClient(fields) {
  const { data: client, error } = await supabase
    .from('clients')
    .insert([fields])
    .select()
    .single();
  if (error) throw error;

  const now = new Date();
  const ssd = client.service_start_date || client.created_at;
  const loomDue = computeNextDue(now, client.status, 'loom', ssd);
  const callDue = computeNextDue(now, client.status, 'call_offer');

  const { error: tErr } = await supabase.from('timers').insert([
    { client_id: client.id, timer_type: 'loom',       last_reset_at: now.toISOString(), next_due_at: loomDue.toISOString() },
    { client_id: client.id, timer_type: 'call_offer', last_reset_at: now.toISOString(), next_due_at: callDue.toISOString() }
  ]);
  if (tErr) throw tErr;

  await supabase.from('touchpoints').insert([{
    client_id: client.id,
    type: 'system',
    content: 'Client record created'
  }]);

  return client;
}

export async function logTouchpoint(clientId, type, content = null) {
  const { error } = await supabase
    .from('touchpoints')
    .insert([{ client_id: clientId, type, content }]);
  if (error) throw error;
}

export async function resetTimer(clientId, timerType) {
  const { data: client, error: cErr } = await supabase
    .from('clients').select('status, service_start_date, created_at').eq('id', clientId).single();
  if (cErr) throw cErr;

  const now = new Date();
  const ssd = client.service_start_date || client.created_at;
  const nextDue = computeNextDue(now, client.status, timerType, ssd);
  const { error } = await supabase
    .from('timers')
    .update({
      last_reset_at: now.toISOString(),
      next_due_at: nextDue.toISOString(),
      is_overdue: false
    })
    .eq('client_id', clientId)
    .eq('timer_type', timerType);
  if (error) throw error;
}

// When a client's status changes, recalc both timers' next_due_at from last_reset_at using new interval.
export async function recalcTimersForStatusChange(clientId, newStatus) {
  const { data: client, error: cErr } = await supabase
    .from('clients').select('service_start_date, created_at').eq('id', clientId).single();
  const ssd = client?.service_start_date || client?.created_at || null;

  const { data: timers, error } = await supabase
    .from('timers').select('*').eq('client_id', clientId);
  if (error) throw error;
  const updates = timers.map(t => {
    const nextDue = computeNextDue(t.last_reset_at, newStatus, t.timer_type, ssd);
    return supabase.from('timers').update({
      next_due_at: nextDue.toISOString(),
      is_overdue: new Date(nextDue) <= new Date()
    }).eq('id', t.id);
  });
  await Promise.all(updates);
}

export async function refreshOverdueFlags() {
  const nowIso = new Date().toISOString();
  await supabase.from('timers').update({ is_overdue: true }).lte('next_due_at', nowIso);
  await supabase.from('timers').update({ is_overdue: false }).gt('next_due_at', nowIso);
}

export async function createExpectationsLoomTimer(clientId) {
    const now = new Date();
    const dueAt = addHours(now, EXPECTATIONS_LOOM_HOURS);
    const { error } = await supabase.from('timers').upsert({
          client_id: clientId, timer_type: 'expectations_loom',
          last_reset_at: now.toISOString(), next_due_at: dueAt.toISOString(), is_overdue: false
    }, { onConflict: 'client_id,timer_type' });
    if (error) throw error;
}

export async function clearExpectationsLoomTimer(clientId) {
    await supabase.from('timers').delete()
      .eq('client_id', clientId).eq('timer_type', 'expectations_loom');
}
