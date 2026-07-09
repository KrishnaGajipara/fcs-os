-- FCS OS · Notification webhooks
-- AFTER INSERT on each submissions table -> async HTTP POST (pg_net) to the
-- notify-submission edge function, which formats and sends the email.

create or replace function public.notify_submission_webhook()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform net.http_post(
    url := 'https://aqtgokcftwsnyoqmoxnh.supabase.co/functions/v1/notify-submission',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-fcs-webhook-secret', '__WEBHOOK_SECRET__'
    ),
    body := jsonb_build_object(
      'table', TG_TABLE_NAME,
      'record', to_jsonb(new)
    ),
    timeout_milliseconds := 10000
  );
  return new;
end;
$$;

revoke all on function public.notify_submission_webhook() from public, anon, authenticated;

create trigger material_orders_notify
  after insert on public.material_orders
  for each row execute function public.notify_submission_webhook();

create trigger timesheets_notify
  after insert on public.timesheets
  for each row execute function public.notify_submission_webhook();

create trigger qc_reports_notify
  after insert on public.qc_reports
  for each row execute function public.notify_submission_webhook();
