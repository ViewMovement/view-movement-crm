-- View Movement CRM - Release 2: Ops Manager + Retention Strategist systemization.
-- Idempotent. Run in the Supabase SQL editor.

-- ---------- clients: cohort, stepper progress, engagement ----------
alter table clients add column if not exists cohort text
  check (cohort in ('new','active_happy','active_hands_off','cancelling','churned'));
alter table clients add column if not exists onboarding_steps jsonb not null default '{}'::jsonb;
alter table clients add column if not exists closeout_steps jsonb not null default '{}'::jsonb;
alter table clients add column if not exists engagement text
  check (engagement in ('responsive','slow','dark')) default 'responsive';

create index if not exists idx_clients_cohort on clients(cohort);

-- Default cohort backfill: any non-churned client without a cohort is 'active_happy'.
update clients set cohort = 'churned' where status = 'churned' and cohort is null;
update clients set cohort = 'active_happy' where cohort is null and status <> 'churned';

-- ---------- save_plans (Retention Strategist kanban) ----------
create table if not exists save_plans (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  status text not null check (status in ('proposed','in_progress','saved','lost')) default 'proposed',
  proposal text,
  outcome text,
  owner text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_save_plans_status on save_plans(status);
create index if not exists idx_save_plans_client on save_plans(client_id);

drop trigger if exists trg_save_plans_updated on save_plans;
create trigger trg_save_plans_updated before update on save_plans
  for each row execute function set_updated_at();

-- ---------- situation_flags (playbook items) ----------
create table if not exists situation_flags (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  type text not null,  -- missed_posting | overdue_batch | non_responsive | delayed_onboarding | dark_contractor | retention_opportunity | sheet_mismatch | scripted_only | out_of_scope | failed_payment
  detail text,
  resolved_at timestamptz,
  resolved_by text,
  created_at timestamptz not null default now()
);
create index if not exists idx_situation_flags_open on situation_flags(client_id) where resolved_at is null;

-- ---------- billing_checks (1st and 14th verification) ----------
create table if not exists billing_checks (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  period_date date not null,
  status text not null check (status in ('pending','ok','failed','skipped')) default 'pending',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, period_date)
);
create index if not exists idx_billing_checks_period on billing_checks(period_date);

drop trigger if exists trg_billing_checks_updated on billing_checks;
create trigger trg_billing_checks_updated before update on billing_checks
  for each row execute function set_updated_at();
