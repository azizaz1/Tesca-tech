-- Keep an auditable timeline for every technician handoff.
create table if not exists public.ticket_escalations (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  from_level smallint not null check (from_level between 1 and 2),
  to_level smallint not null check (to_level between 2 and 3),
  technician_id uuid not null references public.profiles(id),
  note text not null default '',
  created_at timestamptz not null default now(),
  check (to_level = from_level + 1)
);

create index if not exists ticket_escalations_ticket_created_idx
  on public.ticket_escalations (ticket_id, created_at);

alter table public.ticket_escalations enable row level security;
grant select on public.ticket_escalations to authenticated;

drop policy if exists "ticket escalation history visible to reporter and technicians" on public.ticket_escalations;
create policy "ticket escalation history visible to reporter and technicians" on public.ticket_escalations
  for select to authenticated
  using (exists (
    select 1 from public.tickets t
    where t.id = ticket_id
      and (t.reporter_id = auth.uid() or public.is_current_user_technician())
  ));

create or replace function public.escalate_ticket(p_ticket_id uuid, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket public.tickets%rowtype;
  v_event public.ticket_escalations%rowtype;
begin
  if not public.is_current_user_technician() then
    raise exception 'Technician access required';
  end if;

  select * into v_ticket
  from public.tickets
  where id = p_ticket_id
  for update;

  if not found then
    raise exception 'Incident not found';
  end if;
  if v_ticket.technician_level >= 3 then
    raise exception 'Maximum technician level reached';
  end if;
  if v_ticket.status in ('resolved', 'closed') then
    raise exception 'Resolved incidents cannot be escalated';
  end if;

  update public.tickets
  set status = 'open',
      technician_level = v_ticket.technician_level + 1,
      technician_id = null,
      technician_note = coalesce(p_note, '')
  where id = p_ticket_id
  returning * into v_ticket;

  insert into public.ticket_escalations (ticket_id, from_level, to_level, technician_id, note)
  values (p_ticket_id, v_ticket.technician_level - 1, v_ticket.technician_level, auth.uid(), coalesce(p_note, ''))
  returning * into v_event;

  return jsonb_build_object('ticket', to_jsonb(v_ticket), 'escalation', to_jsonb(v_event));
end;
$$;

revoke all on function public.escalate_ticket(uuid, text) from public;
grant execute on function public.escalate_ticket(uuid, text) to authenticated;
