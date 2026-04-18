-- Add lifecycle_steps JSONB column to clients table
-- This is the unified milestone checklist from onboarding through Day 80/90.
-- It replaces the old onboarding_steps as the primary lifecycle tracker.
-- Keys are step names, values are ISO timestamps of completion (or absent if not done).

ALTER TABLE clients ADD COLUMN IF NOT EXISTS lifecycle_steps jsonb DEFAULT '{}';

-- Migrate existing onboarding_steps data into lifecycle_steps
-- (preserves any progress already tracked)
UPDATE clients
SET lifecycle_steps = COALESCE(onboarding_steps, '{}')
WHERE lifecycle_steps IS NULL OR lifecycle_steps = '{}';
