-- FCS OS · Order status timeline
-- Every status change is logged so the tracking page can show a history.

alter table public.material_orders
  add column if not exists status_updated_at timestamptz;

create table if not exists public.material_order_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.material_orders(id) on delete cascade,
  status text not null,
  source text not null default 'system',
  created_at timestamptz not null default now()
);

create index if not exists material_order_events_order_idx
  on public.material_order_events (order_id, created_at);

alter table public.material_order_events enable row level security;
-- No policies: only the service role (edge functions) reads/writes events.

-- Log the initial status when an order is submitted. SECURITY DEFINER so the
-- anon insert can write the event row despite RLS.
create or replace function public.log_order_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.material_order_events (order_id, status, source)
  values (new.id, new.status, 'submitted');
  return new;
end;
$$;

revoke all on function public.log_order_created() from public, anon, authenticated;

drop trigger if exists material_orders_log_created on public.material_orders;
create trigger material_orders_log_created
  after insert on public.material_orders
  for each row execute function public.log_order_created();

-- Backfill events for orders that predate this table.
insert into public.material_order_events (order_id, status, source, created_at)
select id, status, 'submitted', created_at
from public.material_orders o
where not exists (
  select 1 from public.material_order_events e where e.order_id = o.id
);
