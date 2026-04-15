import { Router } from 'express';
import { supabase } from '../lib/supabase.js';
import { runOnboardingSyncOnce } from '../jobs/onboardingSync.js';
import { runCancellationSyncOnce } from '../jobs/cancellationSync.js';

const router = Router();

// GET /api/sync/status - last sync per poller + counts today
router.get('/status', async (_req, res) => {
  try {
    const { data: logs } = await supabase
      .from('sync_log').select('*').order('created_at', { ascending: false }).limit(50);

    const byJob = {};
    for (const row of logs || []) {
      const key = row.source;
      if (!byJob[key]) byJob[key] = { ...row, ran_at: row.created_at };
    }

    // New clients today count (from clients table)
    const startOfDay = new Date(); startOfDay.setHours(0,0,0,0);
    const { count: newToday } = await supabase
      .from('clients').select('*', { count: 'exact', head: true })
      .gte('created_at', startOfDay.toISOString());

    // Churned today
    const { count: churnedToday } = await supabase
      .from('clients').select('*', { count: 'exact', head: true })
      .eq('status', 'churned')
      .gte('updated_at', startOfDay.toISOString());

    res.json({
      onboarding: byJob.onboarding || null,
      cancellation: byJob.cancellation || null,
      new_today: newToday || 0,
      churned_today: churnedToday || 0
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/sync/run - manual trigger for both pollers
router.post('/run', async (_req, res) => {
  try {
    const [onboard, cancel] = await Promise.allSettled([
      runOnboardingSyncOnce(), runCancellationSyncOnce()
    ]);
    res.json({
      onboarding: onboard.status === 'fulfilled' ? onboard.value : { error: String(onboard.reason?.message || onboard.reason) },
      cancellation: cancel.status === 'fulfilled' ? cancel.value : { error: String(cancel.reason?.message || cancel.reason) }
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
