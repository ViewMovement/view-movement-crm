import { supabase } from './supabase.js';

const BASE = import.meta.env.VITE_API_URL || '';

async function authHeader() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(await authHeader()), ...(opts.headers || {}) };
  const res = await fetch(`${BASE}${path}`, { ...opts, headers });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
  return res.status === 204 ? null : res.json();
}

export const api = {
  listClients:     ()              => request('/api/clients'),
  todayActions:    ()              => request('/api/clients/today'),
  getClient:       (id)            => request(`/api/clients/${id}`),
  updateClient:    (id, patch)     => request(`/api/clients/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  action:          (id, type)      => request(`/api/clients/${id}/action`, { method: 'POST', body: JSON.stringify({ type }) }),
  addNote:         (id, content)   => request(`/api/clients/${id}/note`, { method: 'POST', body: JSON.stringify({ content }) }),
  resetTimer:      (id, t)         => request(`/api/clients/${id}/timers/${t}/reset`, { method: 'POST' }),
  dismissOnboard:  (id)            => request(`/api/clients/${id}/dismiss-onboarding`, { method: 'POST' }),
  toggleOnboardStep: (id, step, value) => request(`/api/clients/${id}/lifecycle-steps`, { method: 'PATCH', body: JSON.stringify({ step, value }) }),
  toggleLifecycleStep: (id, step, value) => request(`/api/clients/${id}/lifecycle-steps`, { method: 'PATCH', body: JSON.stringify({ step, value }) })
};
