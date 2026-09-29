-- Track the most recent transition into a resolved state for reporting.
alter table public.tickets
  add column if not exists resolved_at timestamptz;

create or replace function public.set_ticket_resolved_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status in ('resolved', 'closed') then
    if tg_op = 'INSERT' then
      new.resolved_at = now();
    elsif old.status not in ('resolved', 'closed') then
      new.resolved_at = now();
    else
      new.resolved_at = coalesce(new.resolved_at, old.resolved_at);
    end if;
  else
    new.resolved_at = null;
  end if;

  return new;
end;
$$;

drop trigger if exists set_ticket_resolved_at on public.tickets;
create trigger set_ticket_resolved_at
  before insert or update of status on public.tickets
  for each row execute function public.set_ticket_resolved_at();
