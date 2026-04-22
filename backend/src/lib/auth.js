// JWT auth middleware — validates Supabase access token and checks email allowlist.
import { createClient } from '@supabase/supabase-js';

const supabaseAuth = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const allowed = (process.env.ALLOWED_EMAILS || 'ty@viewmovement.com,content@viewmovement.com')
  .split(',')
  .map(e => e.trim().toLowerCase());

export async function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing token' });
  }
  const token = header.slice(7);
  const { data: { user }, error } = await supabaseAuth.auth.getUser(token);
  if (error || !user) {
    return res.status(401).json({ error: 'Invalid token' });
  }
  if (!allowed.includes(user.email.toLowerCase())) {
    return res.status(403).json({ error: 'Not authorized' });
  }
  req.user = user;
  next();
}
