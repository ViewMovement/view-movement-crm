import { Router } from 'express';
import { supabase } from '../lib/supabase.js';

const router = Router();

// GET /api/activity?limit=200&since=ISO - unified touchpoint feed across all clients
router.get('/', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 200, 500);
    const since = req.query.since || null;

    let q = supabase
      .from('touchpoints')
      .select('*, clients(id,name,status)')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (since) q = q.gte('created_at', since);

    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
