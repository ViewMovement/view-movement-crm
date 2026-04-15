-- Release 5: Slack Pulse — daily channel scan with AI-prioritized items.

create table if not exists slack_channels (
  id uuid primary key default gen_random_uuid(),
  slack_channel_id text unique not null,
  name text not null,
  is_archived boolean not null default false,
  is_private boolean not null default false,
  last_activity_at timestamptz,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_slack_channels_last_activity on slack_channels(last_activity_at);

create table if not exists slack_pulse_items (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references slack_channels(id) on delete cascade,
  slack_msg_ts text not null,
  sender_name text,
  sender_id text,
  urgency text not null check (urgency in ('urgent','heads_up','fyi')),
  category text,
  summary text not null,
  suggested_action text,
  permalink text,
  raw_text text,
  seen_at timestamptz,
  created_at timestamptz not null default now(),
  unique (channel_id, slack_msg_ts)
);
create index if not exists idx_slack_pulse_seen on slack_pulse_items(seen_at);
create index if not exists idx_slack_pulse_created on slack_pulse_items(created_at desc);

create table if not exists slack_digests (
  id uuid primary key default gen_random_uuid(),
  digest_date date unique not null,
  summary_markdown text,
  channels_scanned integer not null default 0,
  items_found integer not null default 0,
  inactive_channels jsonb,
  generated_at timestamptz not null default now()
);

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_slack_channels_updated') then
    create trigger trg_slack_channels_updated before update on slack_channels
      for each row execute function set_updated_at();
  end if;
end $$;
