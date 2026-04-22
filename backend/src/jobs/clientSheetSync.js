import { supabase } from '../lib/supabase.js';
import { readSheet, rowsToObjects } from '../lib/sheets.js';

const SHEET_ID = process.env.CLIENT_SHEET_ID || '1hlqWOrVuJFgjuEaCZSMYyXT2MxgB3oxRsNeSnoL5jJQ';
const SHEET_RANGE = process.env.CLIENT_SHEET_RANGE || 'MRR!A1:L';

function mapStatus(raw) {
  if (!raw) return 'green';
  const s = raw.trim().toLowerCase();
  if (s.startsWith('a.') || s.startsWith('a ')) return 'green';
  if (s.startsWith('b.') || s.startsWith('b ')) return 'yellow';
  if (s.startsWith('c.') || s.startsWith('c ')) return 'red';
  if (s.startsWith('d.') || s.startsWith('d ')) return 'churned';
  if (s.startsWith('f.') || s.startsWith('f ')) return 'green';
  if (['green', 'yellow', 'red', 'churned'].includes(s)) return s;
  return 'green';
}

function parseMRR(raw) {
  if (!raw) return null;
  const cleaned = String(raw).replace(/[\$,]/g, '');
  const val = parseFloat(cleaned);
  return isNaN(val) ? null : val;
}

function parseBillingDate(raw) {
  if (!raw) return null;
  const n = parseInt(raw);
  return [1, 14].includes(n) ? n : null;
}

export async function syncClientsFromSheet() {
  console.log('[client-sync] Starting sync from client sheet...');
  try {
    const rows = await readSheet(SHEET_ID, SHEET_RANGE);
    const objects = rowsToObjects(rows);

    let created = 0, skipped = 0, errors = 0;
    for (const row of objects) {
      const name = (row['x'] || row['Name'] || row['Client'] || '').trim();
      if (!name) { skipped++; continue; }

      const { data: existing } = await supabase
        .from('clients')
        .select('id')
        .ilike('name', name)
        .maybeSingle();
      if (existing) { skipped++; continue; }

      try {
        await supabase.from('clients').insert({
          name,
          stripe_status: (row['Stripe Subscription'] || '').trim() || null,
          mrr: parseMRR(row['MRR']),
          billing_date: parseBillingDate(row['Billed On']),
          status: mapStatus(row['Status']),
          risk_horizon: (row['Risk Horizon'] || '').trim() || null,
          reason: (row['Reason'] || '').trim() || null,
          save_plan_analysis: (row['Save Plan'] || '').trim() || null,
          action_needed: (row['What they Need (Action)'] || '').trim() || null,
          loom_links: (row['Loom Links'] || '').trim() || null,
          lifecycle_steps: {},
        });
        created++;
      } catch (err) {
        console.error('[client-sync] Error inserting ' + name + ':', err.message);
        errors++;
      }
    }
    console.log('[client-sync] Done: ' + created + ' created, ' + skipped + ' skipped, ' + errors + ' errors');
    return { created, skipped, errors };
  } catch (err) {
    console.error('[client-sync] Sync failed:', err.message);
    throw err;
  }
}

export function scheduleDailySync() {
  function msUntilNext1AM() {
    const now = new Date();
    const next = new Date(now);
    next.setUTCHours(1, 0, 0, 0);
    if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
    return next - now;
  }

  const ms = msUntilNext1AM();
  const hours = Math.round(ms / 3600000 * 10) / 10;
  console.log('[client-sync] Next daily sync in ' + hours + ' hours (1:00 AM UTC)');

  setTimeout(() => {
    console.log('[client-sync] Running scheduled daily sync...');
    syncClientsFromSheet().catch(err => console.error('[client-sync]', err.message));
    setInterval(() => {
      console.log('[client-sync] Running scheduled daily sync...');
      syncClientsFromSheet().catch(err => console.error('[client-sync]', err.message));
    }, 24 * 60 * 60 * 1000);
  }, ms);
}
