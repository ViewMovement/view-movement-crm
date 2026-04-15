// Supabase JWT verification middleware.
// The frontend signs in with Supabase Auth and sends the access_token as a Bearer header.
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;

const supabaseAuth = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const ALLOWED = new Set(
  (process.env.ALLOWED_EMAILS || 'ty@viewmovement.com,content@viewmovement.com')
    .split(',').map(s => s.trim().toLowerCase())
);

export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Missing bearer token' });

    const { data, error } = await supabaseAuth.auth.getUser(token);
    if (error || !data?.user) return res.status(401).json({ error: 'Invalid token' });

    const email = (data.user.email || '').toLowerCase();
    if (!ALLOWED.has(email)) {
      return res.status(403).json({ error: 'Email not authorized' });
    }
    req.user = data.user;
    next();
  } catch (e) {
    res.status(401).json({ error: 'Auth check failed' });
  }
}
