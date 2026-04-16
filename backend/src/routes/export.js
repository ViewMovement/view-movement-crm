// CSV export endpoints for reporting and backup.
import { Router } from 'express';
import { supabase } from '../lib/supabase.js';
import { addDays } from '../lib/cadence.js';

const router = Router();

function csv(rows, columns) {
  const header = columns.join(',');
  const body = rows.map(r => columns.map(c => escape(r[c])).join(',')).join('\n');
  return header + '\n' + body;
}

function escape(v) {
  if (v == null) return '';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function send(res, filename, text) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(text);
}

router.get('/clients.csv', async (_req, res) => {
  try {
    const { data, error } = await supabase.from('clients').select('*').order('name');
    if (error) throw error;
    const cols = ['id','name','email','status','cohort','package','billing_date','onboarding_call_completed','created_at','updated_at'];
    send(res, 'clients.csv', csv(data || [], cols));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/touchpoints.csv', async (_req, res) => {
  try {
    const since = addDays(new Date(), -90).toISOString();
    const { data, error } = await supabase.from('touchpoints').select('*').gte('created_at', since).order('created_at', { ascending: false });
    if (error) throw error;
    const cols = ['id','client_id','type','content','created_at'];
    send(res, 'touchpoints_90d.csv', csv(data || [], cols));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/flags.csv', async (_req, res) => {
  try {
    const { data, error } = await supabase.from('situation_flags').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    const cols = ['id','client_id','type','detail','created_at','resolved_at'];
    send(res, 'flags.csv', csv(data || [], cols));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/save-plans.csv', async (_req, res) => {
  try {
    const { data, error } = await supabase.from('save_plans').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    const cols = ['id','client_id','status','proposal','outcome','created_at','updated_at'];
    send(res, 'save_plans.csv', csv(data || [], cols));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
