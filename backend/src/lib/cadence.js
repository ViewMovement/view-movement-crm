// Cadence logic: intervals per status and helpers for next_due_at / overdue flag.

export const INTERVAL_DAYS = {
  green: 14,
  yellow: 10,
  red: 7,
  churned: 7 // churned stays on the list with red-level urgency for save plan
};

export const HEADS_UP_DAYS = 2;
export const ONBOARDING_REMINDER_DAYS = 7;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function addDays(date, days) {
  return new Date(new Date(date).getTime() + days * MS_PER_DAY);
}

export function intervalFor(status) {
  return INTERVAL_DAYS[status] ?? INTERVAL_DAYS.green;
}

export function computeNextDue(lastResetAt, status) {
  return addDays(lastResetAt, intervalFor(status));
}

export function isOverdue(nextDueAt, now = new Date()) {
  return new Date(nextDueAt).getTime() <= now.getTime();
}

export function daysUntil(target, now = new Date()) {
  const ms = new Date(target).getTime() - now.getTime();
  return Math.ceil(ms / MS_PER_DAY);
}

export function daysOverdue(nextDueAt, now = new Date()) {
  const ms = now.getTime() - new Date(nextDueAt).getTime();
  return Math.max(0, Math.floor(ms / MS_PER_DAY));
}

// Days until the specific assigned billing date (1 or 14).
// Countdown ticks toward the client's own billing day, never the other.
export function daysUntilBilling(billingDay, now = new Date()) {
  if (!billingDay) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let target = new Date(today.getFullYear(), today.getMonth(), billingDay);
  if (target < today) {
    target = new Date(today.getFullYear(), today.getMonth() + 1, billingDay);
  }
  return Math.round((target - today) / MS_PER_DAY);
}
