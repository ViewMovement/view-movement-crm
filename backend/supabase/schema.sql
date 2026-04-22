-- View Movement CRM v2 — Database Schema
-- Run in Supabase SQL editor.

CREATE TABLE IF NOT EXISTS clients (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL,
  email             text,
  company           text,
  package           text,
  billing_date      smallint,
  content_source    text,
  status            text DEFAULT 'green',
  stripe_status     text,
  mrr               numeric,
  risk_horizon      text,
  reason            text,
  save_plan_analysis text,
  action_needed     text,
  loom_links        text,
  onboarding_flag   boolean DEFAULT false,
  onboarding_call_completed boolean DEFAULT false,
  onboarding_call_date timestamptz,
  onboarding_reminder_dismissed boolean DEFAULT false,
  lifecycle_steps   jsonb DEFAULT '{}'::jsonb,
  typeform_token    text UNIQUE,
  cancellation_token text UNIQUE,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS touchpoints (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id  uuid REFERENCES clients(id) ON DELETE CASCADE,
  type       text CHECK (type IN ('loom_sent','call_offered','call_completed','expectations_loom_sent','note','status_change','system')),
  content    text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_touchpoints_client ON touchpoints(client_id, created_at DESC);

CREATE TABLE IF NOT EXISTS timers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     uuid REFERENCES clients(id) ON DELETE CASCADE,
  timer_type    text CHECK (timer_type IN ('loom','call_offer','expectations_loom')),
  last_reset_at timestamptz DEFAULT now(),
  next_due_at   timestamptz,
  is_overdue    boolean DEFAULT false,
  UNIQUE(client_id, timer_type)
);
CREATE INDEX IF NOT EXISTS idx_timers_due ON timers(next_due_at);

CREATE TABLE IF NOT EXISTS sync_log (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source     text,
  token      text,
  action     text,
  payload    jsonb,
  created_at timestamptz DEFAULT now(),
  UNIQUE(source, token)
);
