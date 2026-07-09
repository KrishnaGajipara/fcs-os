-- FCS OS · Timesheet v2
-- One submission is now a daily crew report: many employees + site/day fields.

alter table public.timesheets
  add column if not exists shift text,
  add column if not exists job_floor text,
  add column if not exists weather text,
  add column if not exists work_stoppage boolean not null default false,
  add column if not exists work_stoppage_note text,
  add column if not exists injuries boolean not null default false,
  add column if not exists injuries_note text,
  add column if not exists pre_task boolean not null default false,
  add column if not exists inspections boolean not null default false,
  add column if not exists inspections_note text,
  add column if not exists slip_work boolean not null default false,
  add column if not exists employees jsonb not null default '[]'::jsonb;

-- Grand total (man-hours across the crew) can exceed a single day's 24h.
alter table public.timesheets drop constraint if exists timesheets_total_hours_check;
alter table public.timesheets
  add constraint timesheets_total_hours_check check (total_hours >= 0 and total_hours <= 10000);

-- Migrate any existing single-employee rows into the employees array.
update public.timesheets
set employees = jsonb_build_array(jsonb_build_object(
  'name', employee_name,
  'time_in', to_char(time_in, 'HH24:MI'),
  'time_out', to_char(time_out, 'HH24:MI'),
  'break_minutes', coalesce(break_minutes, 0),
  'reg_hours', total_hours,
  'ot_hours', 0,
  'pt_hours', 0,
  'total', total_hours
))
where employees = '[]'::jsonb and employee_name is not null;

-- Retire the single-employee columns (data preserved in employees array above).
alter table public.timesheets
  drop column if exists employee_name,
  drop column if exists time_in,
  drop column if exists time_out,
  drop column if exists break_minutes;

alter table public.timesheets
  add constraint timesheets_employees_check
  check (jsonb_typeof(employees) = 'array'
         and jsonb_array_length(employees) between 1 and 60);
