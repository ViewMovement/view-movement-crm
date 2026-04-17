-- v8: SOP Integration Phase 2 — Named Onboarding Steps + Completions Table
-- Replaces generic onboarding steps with 7 SOP-aligned named steps.
-- Step 3 (success_definition_captured) is gated by clients.success_definition.

-- Structured completions table for audit trail & queries
create table if not exists onboarding_step_completions (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references clients(id) on delete cascade,
  step_key    text not null,
  step_number smallint not null,
  completed_at timestamptz not null default now(),
  completed_by text, -- email of person who checked the step
  notes       text,
  created_at  timestamptz not null default now(),
  unique(client_id, step_key)
);

create index if not exists idx_osc_client on onboarding_step_completions(client_id);
create index if not exists idx_osc_step   on onboarding_step_completions(step_key);

-- Existing clients keep their onboarding_steps JSONB; no data lost.
-- The 7 SOP step keys are:
--   1. form_sent
--   2. form_filled
--   3. success_definition_captured  (NEW — replaces call_scheduled)
--   4. onboarding_call_completed
--   5. discord_built
--   6. content_source_ready
--   7. work_started
--
-- Migration note: any client with old 'call_scheduled' key in JSONB
-- keeps it; the backend ignores unknown keys gracefully.
