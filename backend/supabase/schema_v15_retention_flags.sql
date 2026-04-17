-- v15: CSM → Retention Specialist flag routing
-- Adds assigned_to and flagged_by columns to situation_flags
-- so flags can be routed to the retention specialist dashboard.

alter table situation_flags add column if not exists assigned_to text;  -- 'retention' | null
alter table situation_flags add column if not exists flagged_by text;   -- email of person who raised it

-- Index for fast retention flag lookups
create index if not exists idx_situation_flags_retention
  on situation_flags(assigned_to) where resolved_at is null;
