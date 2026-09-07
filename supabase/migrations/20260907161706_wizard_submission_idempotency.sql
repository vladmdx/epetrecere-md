-- Additive, safe before the application deploy. Existing plans remain unchanged.
alter table public.event_plans
  add column if not exists wizard_submission_id uuid,
  add column if not exists wizard_submission_hash text;

create unique index if not exists event_plans_user_wizard_submission_uidx
  on public.event_plans (user_id, wizard_submission_id);
