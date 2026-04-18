import { supabase } from './supabase.js';

const BASE = import.meta.env.VITE_API_URL || '';

// Extract project ref from Supabase URL for localStorage key
const _projRef = (import.meta.env.VITE_SUPABASE_URL || '').replace('https://', '').split('.')[0];

async function authHeader() {
  // Read token directly from localStorage to avoid getSession() lock issues
  try {
    const stored = localStorage.getItem(`sb-${_projRef}-auth-token`);
    if (stored) {
      const { access_token } = JSON.parse(stored);
      if (access_token) return { Authorization: `Bearer ${access_token}` };
    }
  } catch {}
  // Fallback: try getSession with a timeout
  try {
    const result = await Promise.race([
      supabase.auth.getSession(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
    ]);
    const token = result.data?.session?.access_token;
    if (token) return { Authorization: `Bearer ${token}` };
  } catch {}
  return {};
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
  createClient:    (body)          => request('/api/clients', { method: 'POST', body: JSON.stringify(body) }),
  updateClient:    (id, patch)     => request(`/api/clients/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  action:          (id, type)      => request(`/api/clients/${id}/action`, { method: 'POST', body: JSON.stringify({ type }) }),
  bulkAction:      (ids, type)     => request(`/api/clients/bulk-action`, { method: 'POST', body: JSON.stringify({ ids, type }) }),
  undoLast:        (id)            => request(`/api/clients/${id}/undo-last`, { method: 'POST' }),
  snooze:          (id, t, days)   => request(`/api/clients/${id}/timers/${t}/snooze`, { method: 'POST', body: JSON.stringify({ days }) }),
  addNote:         (id, content)   => request(`/api/clients/${id}/note`, { method: 'POST', body: JSON.stringify({ content }) }),
  resetTimer:      (id, t)         => request(`/api/clients/${id}/timers/${t}/reset`, { method: 'POST' }),
  dismissOnboard:  (id)            => request(`/api/clients/${id}/dismiss-onboarding`, { method: 'POST' }),
  activity:        (limit=200)     => request(`/api/activity?limit=${limit}`),
  syncStatus:      ()              => request('/api/sync/status'),
  runSync:         ()              => request('/api/sync/run', { method: 'POST' }),
  weeklyDigest:    ()              => request('/api/clients/digest/weekly'),
  // Ops
  day:             ()              => request('/api/ops/day'),
  togglePhase:     (n)             => request(`/api/ops/day/phase/${n}/toggle`, { method: 'POST', body: JSON.stringify({}) }),
  triage:          ()              => request('/api/ops/triage'),
  onboardingSteps: ()              => request('/api/ops/onboarding-steps'),
  closeoutSteps:   ()              => request('/api/ops/closeout-steps'),
  toggleOnboarding:(id, step)      => request(`/api/ops/clients/${id}/onboarding/${step}/toggle`, { method: 'POST' }),
  toggleCloseout:  (id, step)      => request(`/api/ops/clients/${id}/closeout/${step}/toggle`, { method: 'POST' }),
  setCohort:       (id, cohort)    => request(`/api/ops/clients/${id}/cohort`, { method: 'POST', body: JSON.stringify({ cohort }) }),
  // Save plans
  listSavePlans:   ()              => request('/api/ops/save-plans'),
  createSavePlan:  (body)          => request('/api/ops/save-plans', { method: 'POST', body: JSON.stringify(body) }),
  updateSavePlan:  (id, patch)     => request(`/api/ops/save-plans/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  // Flags
  listFlags:       ()              => request('/api/ops/flags'),
  retentionFlags:  ()              => request('/api/ops/flags/retention'),
  createFlag:      (body)          => request('/api/ops/flags', { method: 'POST', body: JSON.stringify(body) }),
  resolveFlag:     (id)            => request(`/api/ops/flags/${id}/resolve`, { method: 'POST', body: JSON.stringify({}) }),
  // Billing
  billingToday:    ()              => request('/api/ops/billing/today'),
  billingCheck:    (body)          => request('/api/ops/billing/check', { method: 'POST', body: JSON.stringify(body) }),
  // Metrics + exec
  metrics:         ()              => request('/api/ops/metrics'),
  clientHealth:    (id)            => request(`/api/ops/health/${id}`),
  execDigest:      ()              => request('/api/ops/exec-digest'),
  // Settings
  getSettings:     ()              => request('/api/ops/settings'),
  saveSettings:    (body)          => request('/api/ops/settings', { method: 'POST', body: JSON.stringify(body) }),
  // Slack Pulse
  slackStatus:     ()              => request('/api/slack/status'),
  slackRunNow:     ()              => request('/api/slack/run-now', { method: 'POST', body: '{}' }),
  slackPulse:      (seen='unseen') => request(`/api/slack/pulse?seen=${seen}`),
  slackMarkSeen:   (id)            => request(`/api/slack/pulse/${id}/seen`, { method: 'POST', body: '{}' }),
  slackSeenAll:    ()              => request(`/api/slack/pulse/seen-all`, { method: 'POST', body: '{}' }),
  slackDigest:     ()              => request('/api/slack/digest'),
  slackInactive:   ()              => request('/api/slack/channels/inactive'),
  slackAsk:        (question, deep=false, channel=null) =>
                    request('/api/slack/ask', { method: 'POST', body: JSON.stringify({ question, deep, channel }) }),
  // Looms (structured)
  createLoom:      (body)          => request('/api/looms', { method: 'POST', body: JSON.stringify(body) }),
  clientLooms:     (id)            => request(`/api/looms/client/${id}`),
  markLoomResponded:(id)           => request(`/api/looms/${id}/responded`, { method: 'PATCH' }),
  unrespondedLooms:()              => request('/api/looms/unresponded'),
  // Goals
  clientGoals:     (id)            => request(`/api/goals/client/${id}`),
  activeGoals:     ()              => request('/api/goals/active'),
  goalsForReview:  ()              => request('/api/goals/review'),
  createGoal:      (body)          => request('/api/goals', { method: 'POST', body: JSON.stringify(body) }),
  updateGoal:      (id, patch)     => request(`/api/goals/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  // Loom extras
  markDiscordSent: (id)            => request(`/api/looms/${id}/discord`, { method: 'PATCH' }),
  // Reviews
  clientReviews:   (id)            => request(`/api/reviews/client/${id}`),
  dueReviews:      ()              => request('/api/reviews/due'),
  updateReview:    (id, patch)     => request(`/api/reviews/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  generateReviews: (id)            => request(`/api/reviews/generate/${id}`, { method: 'POST' }),
  // Roles
  myRole:          ()              => request('/api/roles/me'),
  listRoles:       ()              => request('/api/roles'),
  setRole:         (email, role)   => request(`/api/roles/${encodeURIComponent(email)}`, { method: 'PUT', body: JSON.stringify({ role }) }),
  deleteRole:      (email)         => request(`/api/roles/${encodeURIComponent(email)}`, { method: 'DELETE' })
};
