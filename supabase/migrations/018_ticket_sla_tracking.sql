-- Track response and resolution targets for each ticket priority.
-- Targets use calendar minutes; office-hour calendars are not configured.
create table if not exists public.ticket_sla_policies (
  priority public.ticket_priority primary key,
  response_minutes integer not null check (response_minutes > 0),
  resolution_minutes integer not null check (resolution_minutes >= response_minutes),
  updated_at timestamptz not null default now()
);

insert into public.ticket_sla_policies (priority, response_minutes, resolution_minutes)
values ('high', 60, 240), ('normal', 240, 1440)
on conflict (priority) do nothing;

alter table public.ticket_sla_policies enable row level security;
grant select, update (response_minutes, resolution_minutes) on public.ticket_sla_policies to authenticated;

drop policy if exists "anyone reads ticket SLA policies" on public.ticket_sla_policies;
create policy "anyone reads ticket SLA policies" on public.ticket_sla_policies
  for select to authenticated using (true);

drop policy if exists "admins update ticket SLA policies" on public.ticket_sla_policies;
create policy "admins update ticket SLA policies" on public.ticket_sla_policies
  for update to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role::text = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role::text = 'admin'));

alter table public.tickets
  add column if not exists sla_started_at timestamptz,
  add column if not exists first_response_at timestamptz,
  add column if not exists response_due_at timestamptz,
  add column if not exists resolution_due_at timestamptz;

update public.tickets t
set sla_started_at = coalesce(t.sla_started_at, t.created_at),
    first_response_at = case
      when t.status::text in ('assigned', 'in_progress', 'waiting_parts', 'resolved', 'closed')
        then coalesce(t.first_response_at, t.resolved_at, t.updated_at)
      else t.first_response_at
    end,
    response_due_at = coalesce(t.response_due_at, t.created_at + make_interval(mins => p.response_minutes)),
    resolution_due_at = coalesce(t.resolution_due_at, t.created_at + make_interval(mins => p.resolution_minutes))
from public.ticket_sla_policies p
where p.priority = t.priority;

alter table public.tickets alter column sla_started_at set default now();

create or replace function public.apply_ticket_sla()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_response_minutes integer;
  v_resolution_minutes integer;
  v_new_cycle boolean := false;
begin
  if tg_op = 'INSERT' then
    new.sla_started_at := coalesce(new.sla_started_at, new.created_at, now());
    new.first_response_at := null;
    v_new_cycle := true;
  else
    new.sla_started_at := coalesce(new.sla_started_at, old.sla_started_at, old.created_at, now());
    if old.status::text in ('resolved', 'closed') and new.status::text in ('open', 'reopened') then
      new.sla_started_at := now();
      new.first_response_at := null;
      v_new_cycle := true;
    end if;
  end if;

  if v_new_cycle or new.priority is distinct from old.priority then
    select response_minutes, resolution_minutes
      into v_response_minutes, v_resolution_minutes
    from public.ticket_sla_policies
    where priority = new.priority;

    new.response_due_at := new.sla_started_at + make_interval(mins => v_response_minutes);
    new.resolution_due_at := new.sla_started_at + make_interval(mins => v_resolution_minutes);
  end if;

  if tg_op = 'UPDATE'
    and not v_new_cycle
    and old.first_response_at is null
    and new.first_response_at is null
    and (new.technician_id is not null or new.status::text in ('assigned', 'in_progress', 'waiting_parts'))
  then
    new.first_response_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists apply_ticket_sla on public.tickets;
create trigger apply_ticket_sla
  before insert or update of priority, status, technician_id, sla_started_at
  on public.tickets
  for each row execute function public.apply_ticket_sla();

create or replace function public.refresh_ticket_sla_for_policy()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update public.tickets
  set response_due_at = sla_started_at + make_interval(mins => new.response_minutes),
      resolution_due_at = sla_started_at + make_interval(mins => new.resolution_minutes)
  where priority = new.priority
    and status::text not in ('resolved', 'closed', 'cancelled');
  return new;
end;
$$;

drop trigger if exists refresh_ticket_sla_for_policy on public.ticket_sla_policies;
create trigger refresh_ticket_sla_for_policy
  after update of response_minutes, resolution_minutes on public.ticket_sla_policies
  for each row execute function public.refresh_ticket_sla_for_policy();

create or replace function public.touch_ticket_sla_policy_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists touch_ticket_sla_policy_updated_at on public.ticket_sla_policies;
create trigger touch_ticket_sla_policy_updated_at
  before update on public.ticket_sla_policies
  for each row execute function public.touch_ticket_sla_policy_updated_at();

create table if not exists public.ticket_sla_notifications (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  sla_cycle_started_at timestamptz not null,
  alert_type text not null check (alert_type in (
    'response_approaching', 'response_breached', 'resolution_approaching', 'resolution_breached'
  )),
  title text not null,
  message text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique (ticket_id, recipient_id, sla_cycle_started_at, alert_type)
);

create index if not exists ticket_sla_notifications_recipient_created_idx
  on public.ticket_sla_notifications (recipient_id, created_at desc);

alter table public.ticket_sla_notifications enable row level security;
grant select on public.ticket_sla_notifications to authenticated;
grant update (read_at) on public.ticket_sla_notifications to authenticated;

drop policy if exists "users read their SLA notifications" on public.ticket_sla_notifications;
create policy "users read their SLA notifications" on public.ticket_sla_notifications
  for select to authenticated using (recipient_id = auth.uid());

drop policy if exists "users mark their SLA notifications read" on public.ticket_sla_notifications;
create policy "users mark their SLA notifications read" on public.ticket_sla_notifications
  for update to authenticated using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

create or replace function public.check_ticket_slas()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.ticket_sla_notifications (
    ticket_id, recipient_id, sla_cycle_started_at, alert_type, title, message
  )
  select t.id, p.id, t.sla_started_at, alert.alert_type, alert.title,
    t.reference || ' - ' || alert.message
  from public.tickets t
  join public.profiles p on p.role::text in ('it_manager', 'admin')
  cross join lateral (values
    ('response_breached', 'Delai de reponse depasse', 'Le delai de premiere reponse est depasse.', t.response_due_at, t.first_response_at is null, t.response_due_at <= now()),
    ('response_approaching', 'Reponse bientot attendue', 'Le delai de premiere reponse approche.', t.response_due_at, t.first_response_at is null, t.response_due_at > now()),
    ('resolution_breached', 'Delai de resolution depasse', 'Le delai de resolution est depasse.', t.resolution_due_at, true, t.resolution_due_at <= now()),
    ('resolution_approaching', 'Resolution bientot attendue', 'Le delai de resolution approche.', t.resolution_due_at, true, t.resolution_due_at > now())
  ) as alert(alert_type, title, message, due_at, applies, breached)
  where t.status::text not in ('resolved', 'closed', 'cancelled')
    and alert.applies
    and alert.due_at is not null
    and alert.due_at <= now() + interval '60 minutes'
    and (alert.breached or alert.due_at > now())
  on conflict (ticket_id, recipient_id, sla_cycle_started_at, alert_type) do nothing;
end;
$$;

revoke all on function public.check_ticket_slas() from public, anon, authenticated;

-- Run the SLA monitor every five minutes and persist alerts for IT managers/admins.
create extension if not exists pg_cron with schema pg_catalog;

do $$
declare
  v_job_id bigint;
begin
  for v_job_id in select jobid from cron.job where jobname = 'ticket-sla-monitor' loop
    perform cron.unschedule(v_job_id);
  end loop;
  perform cron.schedule('ticket-sla-monitor', '*/5 * * * *', 'select public.check_ticket_slas()');
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.ticket_sla_notifications;
exception when duplicate_object then null;
end;
$$;
