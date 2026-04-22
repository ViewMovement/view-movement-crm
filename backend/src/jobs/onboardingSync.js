// Polls the onboarding Google Sheet every 5 minutes.
// Creates a client for each new row (dedup by Token column).
import { readSheet, rowsToObjects } from '../lib/sheets.js';
import { supabase } from '../lib/supabase.js';
import { createNewClient, initTimers, logSyncAttempt } from '../lib/clientOps.js';

const SHEET_ID = process.env.ONBOARDING_SHEET_ID || '17fd_Jhi7wXN0lgo0Z3CzWs4XDDz3zbAltPZALV1KKO4';
const RANGE = process.env.ONBOARDING_SHEET_RANGE || 'Onboarding Form!A1:BQ';

export async function pollOnboarding() {
  try {
    const rows = await readSheet(SHEET_ID, RANGE);
    const objects = rowsToObjects(rows);
    let created = 0, skipped = 0;

    for (const row of objects) {
      const token = (row['Token'] || '').trim();
      if (!token) { skipped++; continue; }

      // Check sync_log for dedup
      const { data: existing } = await supabase
        .from('sync_log')
        .select('id')
        .eq('source', 'onboarding')
        .eq('token', token)
        .maybeSingle();

      if (existing) { skipped++; continue; }

      try {
        const firstName = (row['First name'] || '').trim();
        const lastName = (row['Last name'] || '').trim();
        const company = (row['Company'] || '').trim();
        const name = (firstName + ' ' + lastName).trim() || company || 'Unknown';
        const email = (row['Email'] || '').trim();

        const client = await createNewClient({
          name,
          email: email || null,
          company: company || null,
          package: (row['Amount of reels purchased'] || '').trim() || null,
          content_source: (row['How will VM receive content'] || '').trim() || null,
          status: 'green',
          onboarding_flag: true,
          typeform_token: token,
          lifecycle_steps: {},
        });

        await initTimers(client.id, 'green');
        await logSyncAttempt('onboarding', token, 'created', { name, email, company });
        created++;
      } catch (err) {
        console.error(`[onboarding-sync] Error creating client for token ${token}:`, err.message);
        await logSyncAttempt('onboarding', token, 'error', { error: err.message });
      }
    }

    console.log(`[onboarding-sync] Polled: ${created} new, ${skipped} skipped`);
  } catch (err) {
    console.error('[onboarding-sync] Poll error:', err.message);
  }
}
