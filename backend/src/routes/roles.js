// Role management routes
import { Router } from 'express';
import { supabase } from '../lib/supabase.js';

const router = Router();

// Ensure the user_roles table exists (auto-migrate)
let migrated = false;
async function ensureTable() {
  if (migrated) return;
  try {
    await supabase.rpc('exec_sql', { sql: '' }); // test connection
  } catch {}
  // Just try a select — if it fails, create the table
  const { error } = await supabase.from('user_roles').select('id').limit(1);
  if (error && error.code === '42P01') {
    // Table doesn't exist, create it
    const { error: createErr } = await supabase.from('user_roles').select('id').limit(0);
    if (createErr) {
      console.warn('[roles] user_roles table does not exist yet. Run schema_v6_roles.sql migration.');
    }
  }
  migrated = true;
}

// GET /api/roles/me — get current user's role
router.get('/me', async (req, res) => {
  try {
    await ensureTable();
    const email = (req.user?.email || '').toLowerCase();
    const { data } = await supabase
      .from('user_roles')
      .select('role')
      .eq('email', email)
      .maybeSingle();

    // Default: if no role row, default to 'ops' (safest default)
    // Special case: ty@viewmovement.com is always admin
    const role = data?.role || (email === 'ty@viewmovement.com' ? 'admin' : 'ops');
    res.json({ email, role });
  } catch (e) {
    // If table doesn't exist yet, fall back gracefully
    const email = (req.user?.email || '').toLowerCase();
    const role = email === 'ty@viewmovement.com' ? 'admin' : 'ops';
    res.json({ email, role });
  }
});

// GET /api/roles — list all roles (admin only)
router.get('/', async (req, res) => {
  try {
    const callerRole = await getRole(req.user?.email);
    if (callerRole !== 'admin') return res.status(403).json({ error: 'admin only' });

    const { data, error } = await supabase
      .from('user_roles')
      .select('*')
      .order('email');
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/roles/:email — set role (admin only)
router.put('/:email', async (req, res) => {
  try {
    const callerRole = await getRole(req.user?.email);
    if (callerRole !== 'admin') return res.status(403).json({ error: 'admin only' });

    const email = req.params.email.toLowerCase();
    const { role } = req.body || {};
    if (!['admin', 'retention', 'ops'].includes(role)) {
      return res.status(400).json({ error: 'role must be admin, retention, or ops' });
    }

    // Upsert
    const { data: existing } = await supabase
      .from('user_roles').select('id').eq('email', email).maybeSingle();

    let row;
    if (existing) {
      const { data, error } = await supabase
        .from('user_roles').update({ role, updated_at: new Date().toISOString() })
        .eq('id', existing.id).select().single();
      if (error) throw error;
      row = data;
    } else {
      const { data, error } = await supabase
        .from('user_roles').insert({ email, role }).select().single();
      if (error) throw error;
      row = data;
    }
    res.json(row);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/roles/:email — remove role (admin only, resets to default ops)
router.delete('/:email', async (req, res) => {
  try {
    const callerRole = await getRole(req.user?.email);
    if (callerRole !== 'admin') return res.status(403).json({ error: 'admin only' });

    const email = req.params.email.toLowerCase();
    await supabase.from('user_roles').delete().eq('email', email);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Helper to look up a role
async function getRole(email) {
  if (!email) return 'ops';
  const e = email.toLowerCase();
  if (e === 'ty@viewmovement.com') return 'admin'; // hardcoded fallback
  try {
    const { data } = await supabase
      .from('user_roles').select('role').eq('email', e).maybeSingle();
    return data?.role || 'ops';
  } catch { return 'ops'; }
}

export default router;
