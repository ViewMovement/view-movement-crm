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
  const { data } = await supabase.from('clients').select('*').order('name');
  const cols = ['id','name','email','status','cohort','package','billing_date','start_date','contractor_email','created_at','updated_at'];
  send(res, 'clients.csv', csv(data || [], cols));
});

router.get('/touchpoints.csv', async (_req, res) => {
  const since = addDays(new Date(), -90).toISOString();
  const { data } = await supabase.from('touchpoints').select('*').gte('created_at', since).order('created_at', { ascending: false });
  const cols = ['id','client_id','type','summary','created_at'];
  send(res, 'touchpoints_90d.csv', csv(data || [], cols));
});

router.get('/flags.csv', async (_req, res) => {
  const { data } = await supabase.from('situation_flags').select('*').order('created_at', { ascending: false });
  const cols = ['id','client_id','type','note','created_at','resolved_at'];
  send(res, 'flags.csv', csv(data || [], cols));
});

router.get('/save-plans.csv', async (_req, res) => {
  const { data } = await supabase.from('save_plans').select('*').order('created_at', { ascending: false });
  const cols = ['id','client_id','status','reason','proposal','created_at','updated_at'];
  send(res, 'save_plans.csv', csv(data || [], cols));
});

export default router;
