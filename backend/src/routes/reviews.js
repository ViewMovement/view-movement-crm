// Client Reviews: Day 30/60/80 reviews + QBRs
// Auto-generated at client creation, structured notes forms.
import { Router } from 'express';
import { supabase } from '../lib/supabase.js';
import { logTouchpoint } from '../lib/clientOps.js';

const router = Router();

// ---------- Auto-generate reviews for a client ----------
// Called when a new client is created or manually triggered.
export async function generateReviewsForClient(clientId, serviceStartDate) {
  const start = serviceStartDate ? new Date(serviceStartDate) : new Date();
  const reviews = [
    { review_type: 'day_30', days: 30 },
    { review_type: 'day_60', days: 60 },
    { review_type: 'day_80', days: 80 },
  ];

  const rows = reviews.map(r => ({
    client_id: clientId,
    review_type: r.review_type,
    due_at: new Date(start.getTime() + r.days * 86400000).toISOString().slice(0, 10),
    status: 'pending'
  }));

  // Also add first QBR at ~90 days
  rows.push({
    client_id: clientId,
    review_type: 'qbr',
    due_at: new Date(start.getTime() + 90 * 86400000).toISOString().slice(0, 10),
    status: 'pending',
    qbr_quarter: getQuarter(new Date(start.getTime() + 90 * 86400000))
  });

  const { error } = await supabase.from('client_reviews').upsert(rows, {
    onConflict: 'id', // use default; duplicates avoided by unique generation
    ignoreDuplicates: true
  });
  if (error) console.error('[reviews] auto-generate error:', error.message);
  return rows;
}

function getQuarter(d) {
  const q = Math.ceil((d.getMonth() + 1) / 3);
  return `Q${q} ${d.getFullYear()}`;
}

// ---------- GET /api/reviews/client/:clientId ----------
router.get('/client/:clientId', async (req, res) => {
  try {
    const { data, error } = await supabase.from('client_reviews')
      .select('*')
      .eq('client_id', req.params.clientId)
      .order('due_at', { ascending: true });
    if (error) throw error;

    // Update status based on current date
    const today = new Date().toISOString().slice(0, 10);
    const enriched = (data || []).map(r => {
      if (r.status === 'completed' || r.status === 'skipped') return r;
      if (r.due_at < today) return { ...r, status: 'overdue' };
      const daysUntil = Math.ceil((new Date(r.due_at) - new Date(today)) / 86400000);
      if (daysUntil <= 7) return { ...r, status: 'upcoming' };
      return r;
    });

    res.json(enriched);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---------- GET /api/reviews/due ----------
// Returns all reviews due in the next 7 days or overdue
router.get('/due', async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

    const { data, error } = await supabase.from('client_reviews')
      .select('*, clients(id, name, status, email, success_definition)')
      .in('status', ['pending', 'upcoming', 'overdue'])
      .lte('due_at', nextWeek)
      .order('due_at', { ascending: true });
    if (error) throw error;

    // Enrich statuses
    const enriched = (data || []).map(r => {
      if (r.due_at < today) return { ...r, status: 'overdue' };
      const daysUntil = Math.ceil((new Date(r.due_at) - new Date(today)) / 86400000);
      if (daysUntil <= 7) return { ...r, status: 'upcoming' };
      return r;
    });

    res.json(enriched);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---------- PATCH /api/reviews/:id ----------
// Complete or update a review with structured notes
router.patch('/:id', async (req, res) => {
  try {
    const updates = { ...req.body, updated_at: new Date().toISOString() };

    // If marking complete, stamp completed_at and completed_by
    if (updates.status === 'completed' && !updates.completed_at) {
      updates.completed_at = new Date().toISOString();
      updates.completed_by = req.user?.email || 'unknown';
    }

    const { data, error } = await supabase.from('client_reviews')
      .update(updates).eq('id', req.params.id).select().single();
    if (error) throw error;

    // Log touchpoint
    if (updates.status === 'completed') {
      const typeLabels = { day_30: 'Day 30 Review', day_60: 'Day 60 Review', day_80: 'Day 80 Review', qbr: 'QBR' };
      await logTouchpoint(data.client_id, 'system', `${typeLabels[data.review_type] || 'Review'} completed`);
    }

    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---------- POST /api/reviews/generate/:clientId ----------
// Manually trigger review generation
router.post('/generate/:clientId', async (req, res) => {
  try {
    const { data: client, error } = await supabase.from('clients')
      .select('id, service_start_date, created_at')
      .eq('id', req.params.clientId).single();
    if (error) throw error;
    const reviews = await generateReviewsForClient(client.id, client.service_start_date || client.created_at);
    res.json({ ok: true, generated: reviews.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
