import express from 'express';
import cors from 'cors';
import { supabase } from './lib/supabase.js';
import { requireAuth } from './lib/auth.js';
import clientRoutes from './routes/clients.js';
import { readSheet, rowsToObjects } from './lib/sheets.js';
import { pollOnboarding } from './jobs/onboardingSync.js';
import { pollCancellation } from './jobs/cancellationSync.js';

const app = express();
const PORT = process.env.PORT || 8080;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || '*';

app.use(cors({ origin: FRONTEND_ORIGIN, credentials: true }));
app.use(express.json());

// ââ Health check (no auth) ââââââââââââââââââââââââââââââââ
let churnSeeded = false;
app.get('/health', async (req, res) => {
  try {
    const { count } = await supabase.from('clients').select('*', { count: 'exact', head: true });

    // One-time seed from Monthly Churn Sheet on first health check
    if (!churnSeeded) {
      churnSeeded = true;
      seedFromChurnSheet().catch(err => console.error('[churn-seed]', err.message));
    }

    res.json({ ok: true, totalRows: count });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ââ Activity endpoint (separate from client routes) âââââââ
app.get('/api/activity', requireAuth, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 300;
    const { data, error } = await supabase
      .from('touchpoints')
      .select('*, clients!inner(id, name, status)')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error('GET /api/activity', err);
    res.status(500).json({ error: err.message });
  }
});

// ââ Client routes âââââââââââââââââââââââââââââââââââââââââ
app.use('/api/clients', requireAuth, clientRoutes);

// ââ Monthly Churn Sheet seed ââââââââââââââââââââââââââââââ
async function seedFromChurnSheet() {
  const SHEET_ID = '1yXAq3wSHOH8AUkbzwfOSMqjAOBSaK7G4xHNsGPJfpk';
  const RANGE = 'Monthly!A1:Z';

  console.log('[churn-seed] Starting one-time seed from Monthly Churn Sheet...');
  const rows = await readSheet(SHEET_ID, RANGE);
  const objects = rowsToObjects(rows);

  let created = 0, skipped = 0;
  for (const row of objects) {
    const name = (row['x'] || row['Name'] || row['Client'] || '').trim();
    if (!name) { skipped++; continue; }

    // Check if already exists by name
    const { data: existing } = await supabase
      .from('clients')
      .select('id')
      .ilike('name', name)
      .maybeSingle();
    if (existing) { skipped++; continue; }

    const statusRaw = (row['Status'] || '').trim().toLowerCase();
    const status = ['green', 'yellow', 'red', 'churned'].includes(statusRaw) ? statusRaw : 'green';
    const billingRaw = parseInt(row['Billed On'] || '');
    const billingDate = [1, 14].includes(billingRaw) ? billingRaw : null;

    try {
      await supabase.from('clients').insert({
        name,
        stripe_status: (row['Stripe Subscription'] || '').trim() || null,
        mrr: parseFloat(row['MRR']) || null,
        billing_date: billingDate,
        status,
        risk_horizon: (row['Risk Horizon'] || '').trim() || null,
        reason: (row['Reason'] || '').trim() || null,
        save_plan_analysis: [(row['Save Plan'] || '').trim(), (row['Analysis'] || '').trim()].filter(Boolean).join(' | ') || null,
        action_needed: (row['What they Need (Action)'] || '').trim() || null,
        lifecycle_steps: {},
      });
      created++;
    } catch (err) {
      console.error(`[churn-seed] Error inserting ${name}:`, err.message);
    }
  }
  console.log(`[churn-seed] Done: ${created} created, ${skipped} skipped`);
}

// ââ Start pollers âââââââââââââââââââââââââââââââââââââââââ
const POLL_INTERVAL = 5 * 60 * 1000; // 5 minutes
if (process.env.ENABLE_POLLERS !== 'false') {
  console.log('[pollers] Starting onboarding + cancellation pollers (5 min interval)');
  setInterval(pollOnboarding, POLL_INTERVAL);
  setInterval(pollCancellation, POLL_INTERVAL);
  // Run once on startup after a short delay
  setTimeout(() => {
    pollOnboarding();
    pollCancellation();
  }, 10_000);
} else {
  console.log('[pollers] Pollers disabled (ENABLE_POLLERS=false)');
}

// ââ Start server ââââââââââââââââââââââââââââââââââââââââââ
app.listen(PORT, () => {
  console.log(`View Movement CRM backend listening on port ${PORT}`);
});
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
import { startOnboardingPoller } from './jobs/onboardingSync.js';
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
      // Churn sheet uses "x" as the client name column
      const name = row['x'] || row['Client Name'] || row['Name'] || row['client_name'] || row['Company'] || row['company'] || '';
      if (!name || !name.trim()) { skipped++; continue; }

      const email = row['Email'] || row['email'] || row['Client Email'] || null;
      const company = row['Company'] || row['company'] || row['Brand'] || row['brand'] || null;
      const pkg = row['Package'] || row['package'] || row['Plan'] || row['Reels'] || row['Amount of reels purchased'] || null;
      const billingDate = row['Billed On'] || row['Billing Date'] || row['billing_date'] || row['Next Billing'] || null;
      const stripeStatus = row['Stripe Subscription'] || '';
      const rawStatus = row['Status'] || row['status'] || '';

      // Map status from churn sheet format: "A. Healthy", "B. Monitor", "C. At Risk", "D. Lost"
      let mappedStatus = 'green';
      const statusLower = rawStatus.toLowerCase().trim();
      if (stripeStatus.toLowerCase() === 'cancelled' || statusLower.startsWith('d.') || statusLower.includes('lost') || statusLower.includes('churn')) {
        mappedStatus = 'churned';
      } else if (statusLower.startsWith('c.') || statusLower.includes('at risk') || statusLower.includes('at-risk') || statusLower.includes('red')) {
        mappedStatus = 'red';
      } else if (statusLower.startsWith('b.') || statusLower.includes('monitor') || statusLower.includes('warning') || statusLower.includes('yellow')) {
        mappedStatus = 'yellow';
      } else {
        mappedStatus = 'green';
      }

      const insertPayload = {
        name: name.trim(),
        email: email ? email.trim() : null,
        company: company ? company.trim() : null,
        package: pkg ? (typeof pkg === 'string' ? pkg.trim() : pkg) : null,
        status: mappedStatus,
        billing_date: parseBillingDate(billingDate),
        onboarding_flag: false
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
