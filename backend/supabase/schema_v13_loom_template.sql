-- v13: Results-First Loom Template Redesign
-- Rename and restructure loom_entries fields to match the 5-beat
-- retention-focused Loom framework derived from cancellation analysis.
--
-- Beat 1: Performance Snapshot (metrics — required)
-- Beat 2: Wins (value anchor)
-- Beat 3: Strategy Recommendation (proactive advice)
-- Beat 4: Content Plan (what's coming next)
-- Beat 5: Client Ask (engagement loop question)

-- Add new structured fields (keep old columns for backward compat)
alter table loom_entries add column if not exists performance_snapshot text;
alter table loom_entries add column if not exists strategy_recommendation text;
alter table loom_entries add column if not exists content_plan text;
alter table loom_entries add column if not exists client_ask text;

-- Rename context: 'topic' stays as the headline/subject
-- 'wins' stays as-is
-- 'updates' becomes strategy_recommendation (old data preserved in updates)
-- 'next_steps' becomes content_plan (old data preserved in next_steps)
-- 'ask' becomes client_ask (old data preserved in ask)

-- Add metrics tracking fields for the performance snapshot
alter table loom_entries add column if not exists metrics_snapshot jsonb;
-- e.g. { "avg_views": 1200, "followers_delta": +45, "best_reel_views": 8500, "engagement_rate": 3.2 }

-- Track whether client responded to the ask (retention signal)
alter table loom_entries add column if not exists client_responded boolean default false;
alter table loom_entries add column if not exists client_responded_at timestamptz;
