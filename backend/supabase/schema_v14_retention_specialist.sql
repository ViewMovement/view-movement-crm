-- v14: Retention Specialist CRM Support
-- Adds: client_goals table, expectations_loom tracking, discord handoff tracking,
-- save plan call notes, non-response escalation support.

-- ============================================================
-- 1. Client Goals (goal-setting framework from SOP)
-- ============================================================
create table if not exists client_goals (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade not null,
  metric text not null,               -- e.g. 'avg_views', 'followers', 'engagement_rate', 'custom'
  target_value text not null,          -- e.g. '7000', '10000', '3.5%'
  target_label text,                   -- human-readable: 'Push avg views to 7K'
  breakout_target text,                -- e.g. '15000' for breakout reel goal
  set_at timestamptz default now(),
  period_start date,
  period_end date,
  status text default 'active' check (status in ('active', 'met', 'missed', 'adjusted', 'cancelled')),
  outcome_value text,                  -- actual result at end of period
  outcome_notes text,                  -- raise/hold/adjust explanation
  set_by text,                         -- email of retention specialist
  created_at timestamptz default now()
);

create index if not exists idx_client_goals_client on client_goals(client_id);
create index if not exists idx_client_goals_active on client_goals(client_id, status) where status = 'active';

-- ============================================================
-- 2. Expectations Loom tracking
-- ============================================================
alter table clients add column if not exists expectations_loom_sent_at timestamptz;

-- ============================================================
-- 3. Discord handoff tracking on loom entries
-- ============================================================
alter table loom_entries add column if not exists discord_note_sent boolean default false;
alter table loom_entries add column if not exists discord_note_sent_at timestamptz;

-- ============================================================
-- 4. Save plan call notes (performance-based saves)
-- ============================================================
alter table save_plans add column if not exists call_notes text;
alter table save_plans add column if not exists agreed_goal text;
alter table save_plans add column if not exists strategy_shift text;
alter table save_plans add column if not exists follow_up_date date;
alter table save_plans add column if not exists save_type text default 'general'
  check (save_type in ('general', 'performance', 'budget', 'service'));

-- ============================================================
-- 5. Non-response tracking (computed, but add cache field for speed)
-- ============================================================
alter table clients add column if not exists consecutive_non_responses integer default 0;
alter table clients add column if not exists last_loom_responded_at timestamptz;
