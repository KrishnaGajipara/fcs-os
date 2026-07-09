-- FCS OS · Material categories
-- Lets the admin add new order-list categories (e.g. "Fireproofing") beyond
-- the original Lead Job / Painting lists, without a code change.

create table public.material_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 40),
  name text not null check (char_length(name) between 1 and 80),
  sort_order int not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.material_categories enable row level security;

create policy "anon reads active categories"
  on public.material_categories for select to anon using (active);

insert into public.material_categories (slug, name, sort_order) values
  ('lead', 'Lead Job Order List', 1),
  ('painting', 'Painting Order List', 2);

-- materials.list becomes a real FK to material_categories.slug instead of a
-- fixed two-value check constraint.
alter table public.materials drop constraint materials_list_check;
alter table public.materials
  add constraint materials_list_fkey
  foreign key (list) references public.material_categories (slug)
  on update cascade on delete restrict;

-- grp becomes a free-text section label (e.g. "Materials & Equipment"),
-- not a fixed two-value enum, so new categories can define their own
-- sections (or just use the default "Materials").
alter table public.materials drop constraint materials_grp_check;
update public.materials set grp = 'Materials & Equipment' where grp = 'materials';
update public.materials set grp = 'Paperwork & Signs' where grp = 'paperwork_signs';
alter table public.materials alter column grp set default 'Materials';
alter table public.materials
  add constraint materials_grp_check check (char_length(grp) between 1 and 60);
