-- Persist per-user read cursors so unread chat counts survive sign-out and device changes.
create table if not exists public.ticket_chat_reads (
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (ticket_id, user_id)
);

alter table public.ticket_chat_reads enable row level security;
grant select, insert, update on public.ticket_chat_reads to authenticated;

drop policy if exists "users read their ticket chat cursors" on public.ticket_chat_reads;
create policy "users read their ticket chat cursors" on public.ticket_chat_reads
  for select to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.tickets t
      where t.id = ticket_id
        and (t.reporter_id = auth.uid() or public.is_current_user_technician())
    )
  );

drop policy if exists "users create their ticket chat cursors" on public.ticket_chat_reads;
create policy "users create their ticket chat cursors" on public.ticket_chat_reads
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.tickets t
      where t.id = ticket_id
        and (t.reporter_id = auth.uid() or public.is_current_user_technician())
    )
  );

drop policy if exists "users update their ticket chat cursors" on public.ticket_chat_reads;
create policy "users update their ticket chat cursors" on public.ticket_chat_reads
  for update to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.tickets t
      where t.id = ticket_id
        and (t.reporter_id = auth.uid() or public.is_current_user_technician())
    )
  );

create or replace function public.mark_ticket_chat_read(p_ticket_id uuid)
returns timestamptz
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_read_at timestamptz;
begin
  insert into public.ticket_chat_reads (ticket_id, user_id, last_read_at)
  values (p_ticket_id, auth.uid(), now())
  on conflict (ticket_id, user_id) do update
    set last_read_at = greatest(public.ticket_chat_reads.last_read_at, excluded.last_read_at)
  returning last_read_at into v_read_at;

  return v_read_at;
end;
$$;

revoke all on function public.mark_ticket_chat_read(uuid) from public;
grant execute on function public.mark_ticket_chat_read(uuid) to authenticated;

create or replace function public.get_unread_ticket_chat_counts(p_ticket_ids uuid[])
returns table (ticket_id uuid, unread_count bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select m.ticket_id, count(*) as unread_count
  from public.ticket_chat_messages m
  left join public.ticket_chat_reads r
    on r.ticket_id = m.ticket_id
   and r.user_id = auth.uid()
  where m.ticket_id = any(coalesce(p_ticket_ids, array[]::uuid[]))
    and m.sender_id <> auth.uid()
    and m.created_at > coalesce(r.last_read_at, '-infinity'::timestamptz)
  group by m.ticket_id;
$$;

revoke all on function public.get_unread_ticket_chat_counts(uuid[]) from public;
grant execute on function public.get_unread_ticket_chat_counts(uuid[]) to authenticated;
