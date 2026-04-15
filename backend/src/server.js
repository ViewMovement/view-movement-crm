import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import 'dotenv/config';

import clientsRouter from './routes/clients.js';
import { requireAuth } from './lib/auth.js';
import { startOnboardingPoller } from './jobs/onboardingSync.js';
import { startCancellationPoller } from './jobs/cancellationSync.js';

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

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`[crm-backend] listening on :${port}`);
  if (process.env.ENABLE_POLLERS !== 'false') {
    startOnboardingPoller();
    startCancellationPoller();
  }
});
