-- Call the push Edge Function without the Database Webhooks dashboard integration.
-- Store PUSH_WEBHOOK_SECRET in Supabase Vault before applying this migration.

create or replace function public.dispatch_ticket_push()
returns trigger
language plpgsql
security definer
set search_path = public, net, vault, pg_temp
as $$
declare
  webhook_secret text;
begin
  select decrypted_secret into webhook_secret
  from vault.decrypted_secrets
  where name = 'PUSH_WEBHOOK_SECRET'
  limit 1;

  if webhook_secret is null then
    raise warning 'PUSH_WEBHOOK_SECRET is missing from Supabase Vault; push notification skipped.';
    return new;
  end if;

  perform net.http_post(
    url := 'https://dqnhjdeufmtuuwxoeecl.supabase.co/functions/v1/clever-handler',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', webhook_secret
    ),
    body := jsonb_build_object(
      'type', tg_op,
      'table', tg_table_name,
      'schema', tg_table_schema,
      'record', to_jsonb(new),
      'old_record', case when tg_op = 'UPDATE' then to_jsonb(old) else null end
    ),
    timeout_milliseconds := 10000
  );

  return new;
end;
$$;

drop trigger if exists ticket_push_after_change on public.tickets;
create trigger ticket_push_after_change
  after insert or update on public.tickets
  for each row execute function public.dispatch_ticket_push();
