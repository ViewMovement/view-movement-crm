// 22-step client lifecycle grouped into 6 pipeline sections.
// A client's "current stage" = the first section with incomplete steps.

export const PIPELINE_SECTIONS = [
  {
    id: 'onboarding',
    label: 'Onboarding',
    description: 'New client setup and kickoff',
    color: 'emerald',
    steps: [
      { key: 'form_sent',            label: 'Form Sent',            desc: 'Intake / onboarding form sent to the client' },
      { key: 'form_filled',          label: 'Form Filled',          desc: 'Client completed the intake form' },
      { key: 'success_definition',   label: 'Success Definition',   desc: 'Captured during the call - what does success look like?' },
      { key: 'call_completed',       label: 'Onboarding Call',      desc: 'Onboarding call completed' },
      { key: 'discord_built',        label: 'Discord Built',        desc: 'Discord channel created, team assigned' },
      { key: 'content_source_ready', label: 'Content Source Ready', desc: 'Content sourced and accessible to the team' },
    ]
  },
  {
    id: 'handoff',
    label: 'Handoff',
    description: 'Transition from Ops to Retention',
    color: 'amber',
    steps: [
      { key: 'ops_retention_brief',  label: 'Ops-to-Retention Brief', desc: 'Ops briefs Retention on client history and goals' },
      { key: 'retention_intro',      label: 'Retention Intro Sent',   desc: 'Retention specialist introduced to client' },
      { key: 'retention_first_contact', label: 'Retention First Contact', desc: 'Retention specialist makes first touchpoint' },
    ]
  },
  {
    id: 'retention_handoff',
    label: 'Retention Handoff',
    description: 'Retention specialist takes ownership',
    color: 'pink',
    steps: [
      { key: 'goals_review',         label: 'Goals Review',          desc: 'Retention reviews and updates client goals' },
      { key: 'expectations_loom',     label: 'Expectations Loom Sent', desc: 'Expectations and next-steps Loom delivered' },
      { key: 'retention_plan_active', label: 'Retention Plan Active', desc: 'Long-term retention cadence running' },
    ]
  },
  {
    id: 'first_week',
    label: 'First Week',
    description: 'First deliverables and feedback loop',
    color: 'blue',
    steps: [
      { key: 'work_started',        label: 'Work Started',             desc: 'First batch in production' },
      { key: 'first_deliverable',   label: 'First Deliverable Sent',   desc: 'First edited reel delivered to client' },
      { key: 'first_revision',      label: 'First Revision Complete',  desc: 'Client revision feedback incorporated' },
      { key: 'client_feedback',     label: 'Client Feedback Received', desc: 'Client confirmed satisfaction with first output' },
    ]
  },
  {
    id: 'retention',
    label: 'Retention',
    description: 'Building the ongoing cadence',
    color: 'violet',
    steps: [
      { key: 'first_loom',          label: 'First Loom Sent',     desc: 'First personalized Loom video sent' },
      { key: 'first_call_offer',    label: 'First Call Offer',    desc: 'First check-in call offered' },
      { key: 'thirty_day_checkin',  label: '30-Day Check-in',     desc: 'Month-one review completed' },
      { key: 'cadence_established', label: 'Cadence Established', desc: 'Regular touchpoint rhythm in place' },
    ]
  },
  {
    id: 'twelve_month',
    label: '12-Month Contract',
    description: 'Renewal and long-term commitment',
    color: 'cyan',
    steps: [
      { key: 'renewal_discussion', label: 'Renewal Discussion', desc: 'Contract renewal conversation initiated' },
      { key: 'contract_renewed',   label: 'Contract Renewed',   desc: 'Client renewed or extended' },
    ]
  },
];

// Flat list of all step keys (for backend validation)
export const ALL_STEP_KEYS = PIPELINE_SECTIONS.flatMap(s => s.steps.map(st => st.key));

// Total step count
export const TOTAL_STEPS = ALL_STEP_KEYS.length; // 22

/**
 * Determine which pipeline section a client currently belongs in.
 * Returns the ID of the first section that has incomplete steps.
 * If all 22 steps are done, returns 'complete'.
 */
export function getClientStage(lifecycleSteps) {
  const steps = lifecycleSteps || {};
  for (const section of PIPELINE_SECTIONS) {
    const allDone = section.steps.every(s => steps[s.key]);
    if (!allDone) return section.id;
  }
  return 'complete';
}

/**
 * Get the global step number (1-22) for a given step key.
 */
export function getStepNumber(key) {
  let n = 0;
  for (const section of PIPELINE_SECTIONS) {
    for (const step of section.steps) {
      n++;
      if (step.key === key) return n;
    }
  }
  return 0;
}

/**
 * Count completed steps for a client.
 */
export function countCompleted(lifecycleSteps) {
  const steps = lifecycleSteps || {};
  return ALL_STEP_KEYS.filter(k => steps[k]).length;
}

/**
 * Count completed steps within a specific section.
 */
export function countSectionCompleted(lifecycleSteps, sectionId) {
  const steps = lifecycleSteps || {};
  const section = PIPELINE_SECTIONS.find(s => s.id === sectionId);
  if (!section) return 0;
  return section.steps.filter(s => steps[s.key]).length;
}
// 22-step client lifecycle grouped into 6 pipeline sections.
// A client's "current stage" = the first section with incomplete steps.

export const PIPELINE_SECTIONS = [
  {
    id: 'onboarding',
    label: 'Onboarding',
    description: 'New client setup and kickoff',
    color: 'emerald',
    steps: [
      { key: 'form_sent',            label: 'Form Sent',            desc: 'Intake / onboarding form sent to the client' },
      { key: 'form_filled',          label: 'Form Filled',          desc: 'Client completed the intake form' },
      { key: 'success_definition',   label: 'Success Definition',   desc: 'Captured during the call - what does success look like?' },
      { key: 'call_completed',       label: 'Onboarding Call',      desc: 'Onboarding call completed' },
      { key: 'discord_built',        label: 'Discord Built',        desc: 'Discord channel created, team assigned' },
      { key: 'content_source_ready', label: 'Content Source Ready', desc: 'Content sourced and accessible to the team' },
    ]
  },
  {
    id: 'first_week',
    label: 'First Week',
    description: 'First deliverables and feedback loop',
    color: 'blue',
    steps: [
      { key: 'work_started',        label: 'Work Started',             desc: 'First batch in production' },
      { key: 'first_deliverable',   label: 'First Deliverable Sent',   desc: 'First edited reel delivered to client' },
      { key: 'first_revision',      label: 'First Revision Complete',  desc: 'Client revision feedback incorporated' },
      { key: 'client_feedback',     label: 'Client Feedback Received', desc: 'Client confirmed satisfaction with first output' },
    ]
  },
  {
    id: 'retention',
    label: 'Retention',
    description: 'Building the ongoing cadence',
    color: 'violet',
    steps: [
      { key: 'first_loom',          label: 'First Loom Sent',     desc: 'First personalized Loom video sent' },
      { key: 'first_call_offer',    label: 'First Call Offer',    desc: 'First check-in call offered' },
      { key: 'thirty_day_checkin',  label: '30-Day Check-in',     desc: 'Month-one review completed' },
      { key: 'cadence_established', label: 'Cadence Established', desc: 'Regular touchpoint rhythm in place' },
    ]
  },
  {
    id: 'handoff',
    label: 'Handoff',
    description: 'Transition from Ops to Retention',
    color: 'amber',
    steps: [
      { key: 'ops_retention_brief',  label: 'Ops-to-Retention Brief', desc: 'Ops briefs Retention on client history and goals' },
      { key: 'retention_intro',      label: 'Retention Intro Sent',   desc: 'Retention specialist introduced to client' },
      { key: 'retention_first_contact', label: 'Retention First Contact', desc: 'Retention specialist makes first touchpoint' },
    ]
  },
  {
    id: 'retention_handoff',
    label: 'Retention Handoff',
    description: 'Retention specialist takes ownership',
    color: 'pink',
    steps: [
      { key: 'goals_review',         label: 'Goals Review',          desc: 'Retention reviews and updates client goals' },
      { key: 'expectations_loom',     label: 'Expectations Loom Sent', desc: 'Expectations and next-steps Loom delivered' },
      { key: 'retention_plan_active', label: 'Retention Plan Active', desc: 'Long-term retention cadence running' },
    ]
  },
  {
    id: 'twelve_month',
    label: '12-Month Contract',
    description: 'Renewal and long-term commitment',
    color: 'cyan',
    steps: [
      { key: 'renewal_discussion', label: 'Renewal Discussion', desc: 'Contract renewal conversation initiated' },
      { key: 'contract_renewed',   label: 'Contract Renewed',   desc: 'Client renewed or extended' },
    ]
  },
];

// Flat list of all step keys (for backend validation)
export const ALL_STEP_KEYS = PIPELINE_SECTIONS.flatMap(s => s.steps.map(st => st.key));

// Total step count
export const TOTAL_STEPS = ALL_STEP_KEYS.length; // 22

/**
 * Determine which pipeline section a client currently belongs in.
 * Returns the ID of the first section that has incomplete steps.
 * If all 22 steps are done, returns 'complete'.
 */
export function getClientStage(lifecycleSteps) {
  const steps = lifecycleSteps || {};
  for (const section of PIPELINE_SECTIONS) {
    const allDone = section.steps.every(s => steps[s.key]);
    if (!allDone) return section.id;
  }
  return 'complete';
}

/**
 * Get the global step number (1-22) for a given step key.
 */
export function getStepNumber(key) {
  let n = 0;
  for (const section of PIPELINE_SECTIONS) {
    for (const step of section.steps) {
      n++;
      if (step.key === key) return n;
    }
  }
  return 0;
}

/**
 * Count completed steps for a client.
 */
export function countCompleted(lifecycleSteps) {
  const steps = lifecycleSteps || {};
  return ALL_STEP_KEYS.filter(k => steps[k]).length;
}

/**
 * Count completed steps within a specific section.
 */
export function countSectionCompleted(lifecycleSteps, sectionId) {
  const steps = lifecycleSteps || {};
  const section = PIPELINE_SECTIONS.find(s => s.id === sectionId);
  if (!section) return 0;
  return section.steps.filter(s => steps[s.key]).length;
}
