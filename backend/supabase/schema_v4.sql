-- Release 4: user settings (cadence config, preferences).
create table if not exists user_settings (
  id uuid primary key default gen_random_uuid(),
  user_email text unique not null,
  loom_interval_days integer not null default 21,
  call_interval_days integer not null default 60,
  greeting_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_user_settings_updated') then
    create trigger trg_user_settings_updated before update on user_settings
      for each row execute function set_updated_at();
  end if;
end $$;
