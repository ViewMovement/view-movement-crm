// Shared client/timer/touchpoint operations used by routes and jobs.
import { supabase } from './supabase.js';
import { computeNextDue, addHours, EXPECTATIONS_LOOM_HOURS } from './cadence.js';

export async function createNewClient(fields) {
  const { data, error } = await supabase
    .from('clients')
    .insert(fields)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function logTouchpoint(clientId, type, content) {
  const { error } = await supabase
    .from('touchpoints')
    .insert({ client_id: clientId, type, content });
  if (error) throw error;
}

export async function resetTimer(clientId, timerType, status) {
  const now = new Date().toISOString();
  const nextDue = computeNextDue(now, status);
  const { error } = await supabase
    .from('timers')
    .upsert({
      client_id: clientId,
      timer_type: timerType,
      last_reset_at: now,
      next_due_at: nextDue,
      is_overdue: false,
    }, { onConflict: 'client_id,timer_type' });
  if (error) throw error;
}

export async function initTimers(clientId, status) {
  const now = new Date().toISOString();
  const nextDue = computeNextDue(now, status);
  const rows = ['loom', 'call_offer'].map(t => ({
    client_id: clientId,
    timer_type: t,
    last_reset_at: now,
    next_due_at: nextDue,
    is_overdue: false,
  }));
  const { error } = await supabase
    .from('timers')
    .upsert(rows, { onConflict: 'client_id,timer_type' });
  if (error) throw error;
}

export async function recalcTimersForStatusChange(clientId, newStatus) {
  const { data: timers } = await supabase
    .from('timers')
    .select('*')
    .eq('client_id', clientId)
    .in('timer_type', ['loom', 'call_offer']);

  for (const timer of timers || []) {
    const nextDue = computeNextDue(timer.last_reset_at, newStatus);
    await supabase
      .from('timers')
      .update({ next_due_at: nextDue, is_overdue: new Date(nextDue) <= new Date() })
      .eq('id', timer.id);
  }
}

export async function createExpectationsLoomTimer(clientId) {
  const now = new Date().toISOString();
  const nextDue = addHours(now, EXPECTATIONS_LOOM_HOURS);
  const { error } = await supabase
    .from('timers')
    .upsert({
      client_id: clientId,
      timer_type: 'expectations_loom',
      last_reset_at: now,
      next_due_at: nextDue,
      is_overdue: false,
    }, { onConflict: 'client_id,timer_type' });
  if (error) throw error;
}

export async function clearExpectationsLoomTimer(clientId) {
  await supabase
    .from('timers')
    .delete()
    .eq('client_id', clientId)
    .eq('timer_type', 'expectations_loom');
}

export async function refreshOverdueFlags() {
  const now = new Date().toISOString();
  await supabase
    .from('timers')
    .update({ is_overdue: true })
    .lte('next_due_at', now)
    .eq('is_overdue', false);
}

export async function logSyncAttempt(source, token, action, payload) {
  const { error } = await supabase
    .from('sync_log')
    .insert({ source, token, action, payload });
  // Ignore unique-constraint violations (already logged)
  if (error && !error.message.includes('duplicate')) throw error;
}
