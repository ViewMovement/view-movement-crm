// Polls the cancellation Google Sheet every 5 minutes.
// For each new submission (dedup by "Token"), flip the matched client's status
// to 'churned'. Match by Email first, then Company (case-insensitive). If no
// match, we still log the row so nothing is lost.
import { readSheet, rowsToObjects } from '../lib/sheets.js';
import { supabase } from '../lib/supabase.js';
import { logTouchpoint, recalcTimersForStatusChange } from '../lib/clientOps.js';

const SHEET_ID = process.env.CANCELLATION_SHEET_ID || '16c_iZfITqH9QKZLIuurblzDcmksXcCqcdXW_ISOrRZ8';
const RANGE = process.env.CANCELLATION_SHEET_RANGE || 'View Movement Cancellation Form!A1:AY';
const INTERVAL_MS = 5 * 60 * 1000;

async function findClient({ email, company }) {
  if (email) {
    const { data } = await supabase.from('clients').select('*').ilike('email', email).maybeSingle();
    if (data) return data;
  }
  if (company) {
    const { data } = await supabase.from('clients').select('*').ilike('company', company).maybeSingle();
    if (data) return data;
  }
  return null;
}

export async function runCancellationSyncOnce() {
  try {
    const rows = await readSheet(SHEET_ID, RANGE);
    const records = rowsToObjects(rows);
    let churned = 0, skipped = 0, unmatched = 0;

    for (const row of records) {
      const token = row['Token'];
      if (!token) continue;

      const { data: existing } = await supabase
        .from('sync_log').select('id').eq('source', 'cancellation').eq('token', token).maybeSingle();
      if (existing) { skipped++; continue; }

      const email = row['Email'];
      const company = row['Company'];
      const reason = row['Why have you chosen to cancel your services with View Movement?'] || null;
      const details = row["Please further explain in detail why you've chosen to halt the use of View Movement's services"] || null;

      const client = await findClient({ email, company });
      if (!client) {
        await supabase.from('sync_log').insert([{
          source: 'cancellation', token, action: 'error',
          payload: { reason: 'no matching client', row }
        }]);
        unmatched++;
        continue;
      }

      await supabase.from('clients').update({
        status: 'churned',
        cancellation_token: token,
        reason: reason || client.reason,
        save_plan_analysis: details ? `CANCELLATION FORM: ${details}` : client.save_plan_analysis
      }).eq('id', client.id);
      await recalcTimersForStatusChange(client.id, 'churned');
      await logTouchpoint(client.id, 'status_change',
        `Client submitted cancellation form. Reason: ${reason || 'not given'}`);
      await supabase.from('sync_log').insert([{
        source: 'cancellation', token, action: 'churned', payload: row
      }]);
      churned++;
    }
    console.log(`[cancellationSync] churned=${churned} skipped=${skipped} unmatched=${unmatched}`);
    return { churned, skipped, unmatched };
  } catch (err) {
    console.error('[cancellationSync] failed:', err.message);
    throw err;
  }
}

export function startCancellationPoller() {
  console.log('[cancellationSync] poller starting (every 5m)');
  runCancellationSyncOnce().catch(() => {});
  setInterval(() => runCancellationSyncOnce().catch(() => {}), INTERVAL_MS);
}

if (process.argv.includes('--once')) {
  runCancellationSyncOnce().then(() => process.exit(0)).catch(() => process.exit(1));
}
