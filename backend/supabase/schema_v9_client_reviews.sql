-- v9: SOP Integration Phase 3 — Structured Client Reviews
-- Day 30, Day 60, Day 80 reviews + Quarterly Business Reviews (QBRs)
-- Auto-generated at client creation, structured notes forms.

create table if not exists client_reviews (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references clients(id) on delete cascade,
  review_type   text not null check (review_type in ('day_30', 'day_60', 'day_80', 'qbr')),
  due_at        date not null,
  completed_at  timestamptz,
  completed_by  text,
  status        text not null default 'pending' check (status in ('pending', 'upcoming', 'overdue', 'completed', 'skipped')),

  -- Structured review notes
  goals_on_track    boolean,
  success_progress  text,           -- progress toward success_definition
  content_feedback  text,           -- client feedback on content quality
  engagement_notes  text,           -- posting consistency, responsiveness
  concerns          text,           -- any red flags or issues
  action_items      text,           -- next steps coming out of review
  retention_risk    text check (retention_risk in ('low', 'medium', 'high')),
  nps_score         smallint check (nps_score >= 0 and nps_score <= 10),

  -- QBR-specific fields
  qbr_quarter       text,           -- e.g. 'Q2 2026'
  metrics_snapshot  jsonb,          -- point-in-time metrics (followers, views, etc.)

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_cr_client on client_reviews(client_id);
create index if not exists idx_cr_status on client_reviews(status);
create index if not exists idx_cr_due    on client_reviews(due_at);
create index if not exists idx_cr_type   on client_reviews(review_type);
