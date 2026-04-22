// Polls the cancellation Google Sheet every 5 minutes.
// For each new row, matches existing client by email or company and sets status to churned.
import { readSheet, rowsToObjects } from '../lib/sheets.js';
import { supabase } from '../lib/supabase.js';
import { logTouchpoint, logSyncAttempt, recalcTimersForStatusChange } from '../lib/clientOps.js';

const SHEET_ID = process.env.CANCELLATION_SHEET_ID || '16c_iZfITqH9QKZLIuurblzDcmksXcCqcdXW_ISOrRZ8';
const RANGE = process.env.CANCELLATION_SHEET_RANGE || 'View Movement Cancellation Form!A1:AY';

export async function pollCancellation() {
  try {
    const rows = await readSheet(SHEET_ID, RANGE);
    const objects = rowsToObjects(rows);
    let matched = 0, skipped = 0;

    for (const row of objects) {
      const token = (row['Token'] || '').trim();
      if (!token) { skipped++; continue; }

      // Dedup
      const { data: existing } = await supabase
        .from('sync_log')
        .select('id')
        .eq('source', 'cancellation')
        .eq('token', token)
        .maybeSingle();

      if (existing) { skipped++; continue; }

      try {
        const email = (row['Email'] || '').trim().toLowerCase();
        const company = (row['Company'] || row['Company Name'] || '').trim().toLowerCase();
        const reason = (row['Reason'] || row['Why are you canceling?'] || '').trim();

        // Try matching by email first, then company
        let client = null;
        if (email) {
          const { data } = await supabase
            .from('clients')
            .select('*')
            .ilike('email', email)
            .maybeSingle();
          client = data;
        }
        if (!client && company) {
          const { data } = await supabase
            .from('clients')
            .select('*')
            .ilike('company', company)
            .maybeSingle();
          client = data;
        }

        if (client) {
          await supabase
            .from('clients')
            .update({
              status: 'churned',
              reason: reason || client.reason,
              cancellation_token: token,
              updated_at: new Date().toISOString(),
            })
            .eq('id', client.id);

          await logTouchpoint(client.id, 'status_change', `Churned via cancellation form. Reason: ${reason || 'Not provided'}`);
          await recalcTimersForStatusChange(client.id, 'churned');
          await logSyncAttempt('cancellation', token, 'churned', { clientId: client.id, email, company, reason });
          console.log(`[cancellation-sync] Matched client: ${client.name}`);
          matched++;
        } else {
          await logSyncAttempt('cancellation', token, 'skipped', { email, company, reason, note: 'No matching client found' });
          skipped++;
        }
      } catch (err) {
        console.error(`[cancellation-sync] Error processing token ${token}:`, err.message);
        await logSyncAttempt('cancellation', token, 'error', { error: err.message });
      }
    }

    console.log(`[cancellation-sync] Polled: ${matched} matched, ${skipped} skipped`);
  } catch (err) {
    console.error('[cancellation-sync] Poll error:', err.message);
  }
}
