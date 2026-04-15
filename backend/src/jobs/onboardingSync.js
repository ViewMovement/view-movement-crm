// Polls the Typeform-populated onboarding Google Sheet every 5 minutes and
// creates a client record for each new submission (dedup by "Token" column).
import { readSheet, rowsToObjects } from '../lib/sheets.js';
import { supabase } from '../lib/supabase.js';
import { createClient } from '../lib/clientOps.js';

const SHEET_ID = process.env.ONBOARDING_SHEET_ID || '17fd_Jhi7wXN0lgo0Z3CzWs4XDDz3zbAltPZALV1KKO4';
const RANGE = process.env.ONBOARDING_SHEET_RANGE || 'Onboarding Form!A1:BQ';
const INTERVAL_MS = 5 * 60 * 1000;

function buildName(row) {
  return [row['First name'], row['Last name']].filter(Boolean).join(' ').trim() || row['Company'] || 'Unnamed Client';
}

export async function runOnboardingSyncOnce() {
  try {
    const rows = await readSheet(SHEET_ID, RANGE);
    const records = rowsToObjects(rows);
    let created = 0, skipped = 0;

    for (const row of records) {
      const token = row['Token'];
      if (!token) continue;

      // Skip if already synced.
      const { data: existing } = await supabase
        .from('sync_log').select('id').eq('source', 'onboarding').eq('token', token).maybeSingle();
      if (existing) { skipped++; continue; }

      const payload = {
        name: buildName(row),
        email: row['Email'] || null,
        company: row['Company'] || null,
        package: row['Amount of reels purchased'] || null,
        billing_date: null, // not captured in onboarding form; CSM sets manually
        content_source: row['How will View Movement receive content so that we can edit?'] || null,
        status: 'green',
        onboarding_flag: true,
        typeform_token: token
      };

      try {
        await createClient(payload);
        await supabase.from('sync_log').insert([{
          source: 'onboarding', token, action: 'created', payload: row
        }]);
        created++;
      } catch (err) {
        await supabase.from('sync_log').insert([{
          source: 'onboarding', token, action: 'error', payload: { error: err.message, row }
        }]);
      }
    }
    console.log(`[onboardingSync] created=${created} skipped=${skipped}`);
    return { created, skipped };
  } catch (err) {
    console.error('[onboardingSync] failed:', err.message);
    throw err;
  }
}

export function startOnboardingPoller() {
  console.log('[onboardingSync] poller starting (every 5m)');
  runOnboardingSyncOnce().catch(() => {});
  setInterval(() => runOnboardingSyncOnce().catch(() => {}), INTERVAL_MS);
}

// CLI: `node src/jobs/onboardingSync.js --once`
if (process.argv.includes('--once')) {
  runOnboardingSyncOnce().then(() => process.exit(0)).catch(() => process.exit(1));
}
