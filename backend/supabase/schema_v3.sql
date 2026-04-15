-- Day Flow: daily routine phase tracker.
create table if not exists daily_routine (
  id uuid primary key default gen_random_uuid(),
  user_email text not null,
  routine_date date not null,
  phase_1_done_at timestamptz,
  phase_2_done_at timestamptz,
  phase_3_done_at timestamptz,
  phase_4_done_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_email, routine_date)
);
create index if not exists idx_daily_routine_date on daily_routine(routine_date);

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_daily_routine_updated') then
    create trigger trg_daily_routine_updated before update on daily_routine
      for each row execute function set_updated_at();
  end if;
end $$;
