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
import { startOnboardingPoller } from './jobs/onboardingSync.js';
import { startCancellationPoller } from './jobs/cancellationSync.js';
import { startSlackDigestJob } from './jobs/slackDigest.js';

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
    startOnboardingPoller();
    startCancellationPoller();
    startSlackDigestJob();
  }
});
