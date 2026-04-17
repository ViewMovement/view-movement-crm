// Cadence logic: intervals per status and helpers for next_due_at / overdue flag.

// Call-offer timers use status-based intervals (CSM owns calls)
export const CALL_INTERVAL_DAYS = {
  green: 14,
  yellow: 10,
  red: 7,
  churned: 7
};

// Loom timers use tenure-based intervals (retention specialist SOP)
// First 90 days = every 14 days (highest churn window)
// Day 91–300  = every 21 days (standard cadence)
// Day 300+    = every 14 days (Month 10 retention zone — tighten up)
export const LOOM_TENURE_INTERVALS = [
  { maxDay: 90,   days: 14 },
  { maxDay: 300,  days: 21 },
  { maxDay: Infinity, days: 14 }
];

export const HEADS_UP_DAYS = 2;
export const ONBOARDING_REMINDER_DAYS = 7;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function addDays(date, days) {
  return new Date(new Date(date).getTime() + days * MS_PER_DAY);
}

export function callIntervalFor(status) {
  return CALL_INTERVAL_DAYS[status] ?? CALL_INTERVAL_DAYS.green;
}

// Keep legacy alias for any code still using intervalFor
export function intervalFor(status) {
  return callIntervalFor(status);
}

export function loomIntervalFor(serviceStartDate) {
  if (!serviceStartDate) return 14; // default to onboarding cadence
  const tenure = Math.floor((Date.now() - new Date(serviceStartDate).getTime()) / MS_PER_DAY);
  for (const tier of LOOM_TENURE_INTERVALS) {
    if (tenure <= tier.maxDay) return tier.days;
  }
  return 14;
}

export function computeNextDue(lastResetAt, status, timerType = 'call_offer', serviceStartDate = null) {
  const interval = timerType === 'loom'
    ? loomIntervalFor(serviceStartDate)
    : callIntervalFor(status);
  return addDays(lastResetAt, interval);
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

// Expectations Loom timer: 72 hours after onboarding call
export const EXPECTATIONS_LOOM_HOURS = 72;
export function addHours(date, hours) {
    return new Date(new Date(date).getTime() + hours * 60 * 60 * 1000);
}
