-- FCS OS · Phase 1 schema
-- Forms: material orders, timesheets, QC reports. Catalog: materials.

create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------------------
-- Materials catalog (Lead Job + Painting order lists, seeded from the scanned
-- FCS warehouse sheets). Editable later from the Supabase dashboard.
-- ---------------------------------------------------------------------------
create table public.materials (
  id uuid primary key default gen_random_uuid(),
  list text not null check (list in ('lead', 'painting')),
  grp text not null default 'materials' check (grp in ('materials', 'paperwork_signs')),
  name text not null check (char_length(name) between 1 and 120),
  detail text check (char_length(detail) <= 300),
  sort_order int not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (list, grp, name)
);

-- ---------------------------------------------------------------------------
-- Material order submissions
-- items: [{ "name": text, "list": "lead"|"painting"|"custom", "quantity": text, "note": text? }]
-- ---------------------------------------------------------------------------
create table public.material_orders (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique check (char_length(reference) <= 24),
  job_number text not null check (char_length(job_number) between 1 and 60),
  site_contact text not null check (char_length(site_contact) between 1 and 120),
  site_contact_phone text check (char_length(site_contact_phone) <= 40),
  requested_by text not null check (char_length(requested_by) between 1 and 120),
  needed_by date not null,
  items jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 250),
  notes text check (char_length(notes) <= 4000),
  status text not null default 'pending' check (status in ('pending', 'processing', 'shipped', 'cancelled')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Timesheet submissions
-- ---------------------------------------------------------------------------
create table public.timesheets (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique check (char_length(reference) <= 24),
  employee_name text not null check (char_length(employee_name) between 1 and 120),
  job_number text not null check (char_length(job_number) between 1 and 60),
  work_date date not null,
  time_in time,
  time_out time,
  break_minutes int not null default 0 check (break_minutes between 0 and 480),
  total_hours numeric(5, 2) not null check (total_hours >= 0 and total_hours <= 24),
  work_performed text check (char_length(work_performed) <= 4000),
  notes text check (char_length(notes) <= 4000),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- QC report submissions
-- photos: [ storage object path in bucket qc-photos ]
-- ---------------------------------------------------------------------------
create table public.qc_reports (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique check (char_length(reference) <= 24),
  job_number text not null check (char_length(job_number) between 1 and 60),
  report_date date not null,
  inspector_name text not null check (char_length(inspector_name) between 1 and 120),
  area_inspected text not null check (char_length(area_inspected) between 1 and 300),
  work_inspected text not null check (char_length(work_inspected) between 1 and 4000),
  observations text check (char_length(observations) <= 4000),
  deficiencies text check (char_length(deficiencies) <= 4000),
  corrective_actions text check (char_length(corrective_actions) <= 4000),
  result text not null check (result in ('pass', 'pass_with_notes', 'fail')),
  photos jsonb not null default '[]'::jsonb check (jsonb_typeof(photos) = 'array' and jsonb_array_length(photos) <= 20),
  created_at timestamptz not null default now()
);

create index material_orders_created_idx on public.material_orders (created_at desc);
create index timesheets_created_idx on public.timesheets (created_at desc);
create index qc_reports_created_idx on public.qc_reports (created_at desc);

-- ---------------------------------------------------------------------------
-- Row level security: the portal uses the anon key.
-- Anon may read the catalog and submit forms; it may never read submissions.
-- ---------------------------------------------------------------------------
alter table public.materials enable row level security;
alter table public.material_orders enable row level security;
alter table public.timesheets enable row level security;
alter table public.qc_reports enable row level security;

create policy "anon reads active materials"
  on public.materials for select to anon using (active);

create policy "anon submits material orders"
  on public.material_orders for insert to anon with check (status = 'pending');

create policy "anon submits timesheets"
  on public.timesheets for insert to anon with check (true);

create policy "anon submits qc reports"
  on public.qc_reports for insert to anon with check (true);

-- ---------------------------------------------------------------------------
-- Private storage bucket for QC photos: anon may upload, never read/list.
-- Office staff view photos through signed links in the notification email.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('qc-photos', 'qc-photos', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);

create policy "anon uploads qc photos"
  on storage.objects for insert to anon
  with check (bucket_id = 'qc-photos');
