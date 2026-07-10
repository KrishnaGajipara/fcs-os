-- FCS OS · Timesheet template export fields
-- Adds the fields needed to populate the FCS Daily Time Sheets template.

alter table public.timesheets
  add column if not exists job_name text check (char_length(job_name) <= 160),
  add column if not exists written_by text check (char_length(written_by) <= 120),
  add column if not exists daily_report jsonb not null default '{}'::jsonb;

alter table public.timesheets drop constraint if exists timesheets_daily_report_check;
alter table public.timesheets
  add constraint timesheets_daily_report_check
  check (jsonb_typeof(daily_report) = 'object');
