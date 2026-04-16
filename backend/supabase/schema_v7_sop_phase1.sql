-- v7: SOP Integration Phase 1 — Success Definition + Baseline Metrics
-- Change 1: Add success_definition and baseline_metrics as first-class client attributes

-- New columns on clients table (additions only, no drops/renames)
alter table clients add column if not exists success_definition text;
alter table clients add column if not exists baseline_metrics jsonb;
alter table clients add column if not exists success_definition_captured_at timestamptz;
alter table clients add column if not exists success_definition_last_reviewed_at timestamptz;
alter table clients add column if not exists onboarding_complete_at timestamptz;
alter table clients add column if not exists service_start_date date;

-- All 38 existing clients backfill as NULL (Postgres default for new nullable columns)
-- No fake data inserted.
