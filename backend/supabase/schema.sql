-- View Movement Client Success CRM - Supabase Schema
-- Run this once in the Supabase SQL editor.

create extension if not exists "pgcrypto";

-- =====================
-- Clients
-- =====================
create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  company text,
  package text,                       -- "12", "30", "60" or raw reel count
  billing_date smallint,              -- 1 or 14, nullable
  content_source text,
  status text not null default 'green'
    check (status in ('green','yellow','red','churned')),
  stripe_status text,                 -- Active / Cancelled / PIF / Not Setup Yet
  mrr numeric,
  risk_horizon text,                  -- '0-30 days' | '31-60 days' | '61-90 days' | null
  reason text,
  save_plan_analysis text,
  action_needed text,
  loom_links text,
  onboarding_flag boolean not null default false,
  onboarding_call_completed boolean not null default false,
  onboarding_call_date timestamptz,
  onboarding_reminder_dismissed boolean not null default false,
  typeform_token text unique,         -- dedup key from Typeform submissions
  cancellation_token text unique,     -- dedup key from cancellation form
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_clients_status on clients(status);
create index if not exists idx_clients_created_at on clients(created_at desc);

-- =====================
-- Touchpoints (append-only log)
-- =====================
create table if not exists touchpoints (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  type text not null
    check (type in ('loom_sent','call_offered','call_completed','note','status_change','system')),
  content text,
  created_at timestamptz not null default now()
);

create index if not exists idx_touchpoints_client on touchpoints(client_id, created_at desc);

-- =====================
-- Timers
-- =====================
create table if not exists timers (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  timer_type text not null check (timer_type in ('loom','call_offer')),
  last_reset_at timestamptz not null default now(),
  next_due_at timestamptz not null,
  is_overdue boolean not null default false,
  unique (client_id, timer_type)
);

create index if not exists idx_timers_due on timers(next_due_at);

-- =====================
-- Sync log (idempotency + observability for the pollers)
-- =====================
create table if not exists sync_log (
  id uuid primary key default gen_random_uuid(),
  source text not null,               -- 'onboarding' | 'cancellation'
  token text not null,
  action text not null,               -- 'created' | 'churned' | 'skipped' | 'error'
  payload jsonb,
  created_at timestamptz not null default now(),
  unique (source, token)
);

-- =====================
-- Auto-update updated_at
-- =====================
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_clients_updated on clients;
create trigger trg_clients_updated before update on clients
  for each row execute function set_updated_at();
