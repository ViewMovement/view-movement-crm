// Cadence logic: intervals per status and helpers for next_due_at / overdue flag.

export const INTERVAL_DAYS = {
  green: 14,
  yellow: 10,
  red: 7,
  churned: 7,
};

export const HEADS_UP_DAYS = 2;
export const ONBOARDING_REMINDER_DAYS = 7;
export const EXPECTATIONS_LOOM_HOURS = 72;

export function computeNextDue(fromDate, status) {
  const days = INTERVAL_DAYS[status] || 14;
  const d = new Date(fromDate);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

export function addHours(fromDate, hours) {
  const d = new Date(fromDate);
  d.setTime(d.getTime() + hours * 60 * 60 * 1000);
  return d.toISOString();
}

export function isOverdue(nextDueAt) {
  if (!nextDueAt) return false;
  return new Date(nextDueAt) <= new Date();
}

export function isDueSoon(nextDueAt) {
  if (!nextDueAt) return false;
  const due = new Date(nextDueAt);
  const lookahead = new Date();
  lookahead.setDate(lookahead.getDate() + HEADS_UP_DAYS);
  return due <= lookahead && due > new Date();
}
