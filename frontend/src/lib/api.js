import { supabase } from './supabase.js';

const BASE = import.meta.env.VITE_API_URL || '';

async function authHeader() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return {};
  return { Authorization: 'Bearer ' + session.access_token };
}

async function request(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(await authHeader()) };
  const res = await fetch(BASE + path, { ...opts, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || res.statusText);
  }
  return res.json();
}

export const api = {
  getClients: () => request('/api/clients'),
  getClient: (id) => request('/api/clients/' + id),
  getToday: () => request('/api/clients/today'),
  updateClient: (id, fields) => request('/api/clients/' + id, { method: 'PATCH', body: JSON.stringify(fields) }),
  postAction: (id, action, content) => request('/api/clients/' + id + '/action', { method: 'POST', body: JSON.stringify({ action, content }) }),
  postNote: (id, content) => request('/api/clients/' + id + '/note', { method: 'POST', body: JSON.stringify({ content }) }),
  resetTimer: (id, timerType) => request('/api/clients/' + id + '/timers/' + timerType + '/reset', { method: 'POST' }),
  toggleLifecycleStep: (id, step, value) => request('/api/clients/' + id + '/lifecycle-steps', { method: 'PATCH', body: JSON.stringify({ step, value }) }),
  getActivity: (limit = 300) => request('/api/activity?limit=' + limit),
};
