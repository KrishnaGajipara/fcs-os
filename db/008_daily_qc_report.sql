-- FCS OS · Daily Quality Control Report
-- Replaces the short inspection form with the two-page field report while
-- preserving all reports already stored in qc_reports.

alter table public.qc_reports
  add column if not exists details jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'qc_reports_details_object_check'
      and conrelid = 'public.qc_reports'::regclass
  ) then
    alter table public.qc_reports
      add constraint qc_reports_details_object_check
      check (jsonb_typeof(details) = 'object');
  end if;
end $$;

-- These columns hold compatibility summaries for older reports and admin
-- searches. The complete Daily QC Report is stored in details.
alter table public.qc_reports
  alter column inspector_name drop not null,
  alter column area_inspected drop not null,
  alter column work_inspected drop not null,
  alter column result drop not null;

-- The old pass/fail finding is not part of the supplied Daily QC Report.
alter table public.qc_reports
  drop constraint if exists qc_reports_result_check;

comment on column public.qc_reports.details is
  'Structured two-page Daily Quality Control Report data. See web/src/lib/qc.ts.';
