-- v12: SOP Change 6 — Month 10 Retention Protocol
-- Auto-flag clients at day 300 for proactive retention outreach.
-- Escalation flag at day 330 if not resolved.

-- Add tenure_days computed helper (optional, can do in code)
-- Add month10 flag types to the system
-- No schema changes needed — uses existing situation_flags table
-- with new type values: 'month10_review' and 'month10_escalation'
