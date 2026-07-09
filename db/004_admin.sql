-- FCS OS · Admin authentication
-- Single shared admin password for the dashboard. Stored as a salted SHA-256
-- hash. Never readable by anon/authenticated (no RLS policies) — only the
-- admin-api edge function reaches it via the service role.

create table if not exists public.admin_settings (
  id int primary key default 1 check (id = 1),
  password_salt text not null,
  password_hash text not null,
  updated_at timestamptz not null default now()
);

alter table public.admin_settings enable row level security;
-- Intentionally no policies: locked to service_role only.

-- Seed the default password "Fine123456!" (changeable from the dashboard).
-- Hash = sha256(salt || password), matching the edge function's computation.
insert into public.admin_settings (id, password_salt, password_hash)
select 1, s.salt,
       encode(extensions.digest(s.salt || 'Fine123456!', 'sha256'), 'hex')
from (select encode(extensions.gen_random_bytes(16), 'hex') as salt) s
on conflict (id) do nothing;
