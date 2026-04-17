-- v11: SOP Change 4 — Link flags to auto-created save plans
-- Adds trigger_flag_id to save_plans so we know which flag triggered it.

alter table save_plans add column if not exists trigger_flag_id uuid references situation_flags(id);
