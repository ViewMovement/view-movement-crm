-- v10: SOP Integration — Structured Loom Entries
-- When retention manager clicks "Loom Sent", a structured 5-field form captures
-- the content of the Loom. History displayed in client drawer.

create table if not exists loom_entries (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references clients(id) on delete cascade,
  sent_at       timestamptz not null default now(),
  sent_by       text,             -- email of person who sent it

  -- 5-field structured template
  topic         text not null,    -- main topic/subject of the Loom
  wins          text,             -- wins/progress highlighted
  updates       text,             -- content or strategy updates shared
  next_steps    text,             -- what's coming next for the client
  ask           text,             -- any ask or action needed from the client

  loom_url      text,             -- optional link to the Loom video
  duration_secs smallint,         -- optional duration

  created_at    timestamptz not null default now()
);

create index if not exists idx_le_client on loom_entries(client_id);
create index if not exists idx_le_sent   on loom_entries(sent_at desc);
