import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import 'dotenv/config';
import clientsRouter from './routes/clients.js';
import activityRouter from './routes/activity.js';
import syncRouter from './routes/sync.js';
import opsRouter from './routes/ops.js';
import exportRouter from './routes/export.js';
import slackRouter from './routes/slack.js';
import rolesRouter from './routes/roles.js';
import reviewsRouter from './routes/reviews.js';
import loomsRouter from './routes/looms.js';
import goalsRouter from './routes/goals.js';
import { requireAuth } from './lib/auth.js';
import { readSheet, rowsToObjects } from './lib/sheets.js';
import { supabase } from './lib/supabase.js';
import { startCancellationPoller } from './jobs/cancellationSync.js';
import { startSlackDigestJob } from './jobs/slackDigest.js';
import { createClient } from './lib/clientOps.js';

const app = express();

app.use(cors({ origin: process.env.FRONTEND_ORIGIN || true }));
app.use(express.json({ limit: '1mb' }));
app.use(morgan('tiny'));

app.get('/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));
// One-shot seed endpoint guarded by SEED_TOKEN env var.
app.post('/admin/seed-existing', async (req, res) => {
  try {
    const token = req.header('x-seed-token');
    if (!process.env.SEED_TOKEN || token !== process.env.SEED_TOKEN) {
      return res.status(401).json({ error: 'unauthorized' });
    }
    const { runSeed } = await import('./seed/seedExistingClients.js');
    const result = await runSeed();
    res.json({ ok: true, result });
  } catch (e) {
    console.error('[seed]', e);
    res.status(500).json({ error: String(e && e.message || e) });
  }
});

// Admin: preview a Google Sheet (first 3 rows)
app.get('/admin/sheet-preview', async (req, res) => {
  try {
    const sheetId = req.query.id;
    const range = req.query.range || 'A1:ZZ3';
    if (!sheetId) return res.status(400).json({ error: 'id query param required' });
    const rows = await readSheet(sheetId, range);
    res.json({ rowCount: rows.length, headers: rows[0] || [], sample: rows.slice(1, 3) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Parse billing date: "1st" -> 1, "14th" -> 14, "Unknown" -> null
function parseBillingDate(raw) {
  if (!raw) return null;
  const num = parseInt(String(raw).replace(/[^0-9]/g, ''), 10);
  return (!isNaN(num) && num >= 1 && num <= 31) ? num : null;
}
// Admin: sync from churn sheet - wipe + reimport
app.post('/admin/sync-churn-sheet', async (req, res) => {
  try {
    const CHURN_SHEET_ID = process.env.CHURN_SHEET_ID || '1hlqWOrVuJFgjuEaCZSMYyXT2MxgB3oxRsNeSnoL5jJQ';
    const CHURN_RANGE = process.env.CHURN_SHEET_RANGE || 'A1:ZZ';
    const rows = await readSheet(CHURN_SHEET_ID, CHURN_RANGE);
    const records = rowsToObjects(rows);

    // Wipe existing data
    await supabase.from('timers').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('touchpoints').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('loom_entries').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('save_plans').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('retention_flags').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('sync_log').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('clients').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    let created = 0, skipped = 0;
    for (const row of records) {
      const name = row['x'] || row['Client Name'] || row['Name'] || row['client_name'] || row['Company'] || row['company'] || '';
      if (!name || !name.trim()) { skipped++; continue; }

      const email = row['Email'] || row['email'] || row['Client Email'] || null;
      const company = row['Company'] || row['company'] || row['Brand'] || row['brand'] || null;
      const pkg = row['Package'] || row['package'] || row['Plan'] || row['Reels'] || row['Amount of reels purchased'] || null;
      const billingDate = row['Billed On'] || row['Billing Date'] || row['billing_date'] || row['Next Billing'] || null;
      const stripeStatus = row['Stripe Subscription'] || '';
      const rawStatus = row['Status'] || row['status'] || '';

      let mappedStatus = 'green';
      const statusLower = rawStatus.toLowerCase().trim();
      if (stripeStatus.toLowerCase() === 'cancelled' || statusLower.startsWith('d.') || statusLower.includes('lost') || statusLower.includes('churn')) {
        mappedStatus = 'churned';
      } else if (statusLower.startsWith('c.') || statusLower.includes('at risk') || statusLower.includes('at-risk') || statusLower.includes('red')) {
        mappedStatus = 'red';
      } else if (statusLower.startsWith('b.') || statusLower.includes('monitor') || statusLower.includes('warning') || statusLower.includes('yellow')) {
        mappedStatus = 'yellow';
      }

      const insertPayload = {
        name: name.trim(),
        email: email ? email.trim() : null,
        company: company ? company.trim() : null,
        package: pkg ? (typeof pkg === 'string' ? pkg.trim() : pkg) : null,
        status: mappedStatus,
        billing_date: parseBillingDate(billingDate),
        onboarding_flag: false,
      };

      try {
        await createClient(insertPayload);
        created++;
      } catch (err) {
        console.error('[churn-sync] insert error:', err.message, { name });
        skipped++;
      }
    }

    res.json({ ok: true, totalRows: records.length, created, skipped, headers: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.use('/api/clients', requireAuth, clientsRouter);
app.use('/api/activity', requireAuth, activityRouter);
app.use('/api/sync', requireAuth, syncRouter);
app.use('/api/ops', requireAuth, opsRouter);
app.use('/api/export', requireAuth, exportRouter);
app.use('/api/roles', requireAuth, rolesRouter);
app.use('/api/reviews', requireAuth, reviewsRouter);
app.use('/api/looms', requireAuth, loomsRouter);
app.use('/api/goals', requireAuth, goalsRouter);

// Admin-guarded Slack trigger (seed-token) must be outside requireAuth
app.post('/admin/slack/run-now', async (req, res) => {
  const token = req.header('x-seed-token');
  if (!process.env.SEED_TOKEN || token !== process.env.SEED_TOKEN) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  try {
    const { runSlackDigestOnce } = await import('./jobs/slackDigest.js');
    const lookback = Number(req.query.hours || req.body?.lookback_hours || 24);
    const result = await runSlackDigestOnce({ lookbackHours: lookback });
    res.json({ ok: true, result });
  } catch (e) {
    console.error('[admin/slack/run-now]', e);
    res.status(500).json({ error: e.message });
  }
});

app.use('/api/slack', requireAuth, slackRouter);

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`[crm-backend] listening on :${port}`);
  if (process.env.ENABLE_POLLERS !== 'false') {
    // startOnboardingPoller(); // DISABLED -- was pulling all historical rows
    startCancellationPoller();
    startSlackDigestJob();
  }
});

