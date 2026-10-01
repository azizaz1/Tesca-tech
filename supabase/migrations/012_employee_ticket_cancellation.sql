-- Let employees cancel only their own open, unassigned incidents.
-- Keep the ticket row and related history for audit purposes.
alter type public.ticket_status add value if not exists 'cancelled';

create or replace function public.prevent_cancelled_ticket_reopen()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'cancelled' and new.status <> 'cancelled' then
    raise exception 'Cancelled incidents cannot be reopened' using errcode = '55000';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_cancelled_ticket_reopen on public.tickets;
create trigger prevent_cancelled_ticket_reopen
  before update of status on public.tickets
  for each row execute function public.prevent_cancelled_ticket_reopen();

create or replace function public.cancel_own_ticket(p_ticket_id uuid)
returns public.tickets
language plpgsql
security definer
set search_path = ''
as $$
declare
  cancelled_ticket public.tickets%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  update public.tickets
  set status = 'cancelled'
  where id = p_ticket_id
    and reporter_id = auth.uid()
    and status = 'open'
    and technician_id is null
  returning * into cancelled_ticket;

  if not found then
    raise exception 'Only your own open, unassigned incidents can be cancelled' using errcode = '42501';
  end if;

  return cancelled_ticket;
end;
$$;

revoke all on function public.cancel_own_ticket(uuid) from public;
grant execute on function public.cancel_own_ticket(uuid) to authenticated;
