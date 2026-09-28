-- Private, realtime conversations attached to support incidents.
create table if not exists public.ticket_chat_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index if not exists ticket_chat_messages_ticket_created_idx
  on public.ticket_chat_messages (ticket_id, created_at);

alter table public.ticket_chat_messages enable row level security;
grant select, insert on public.ticket_chat_messages to authenticated;

drop policy if exists "ticket chat visible to reporter and technicians" on public.ticket_chat_messages;
create policy "ticket chat visible to reporter and technicians" on public.ticket_chat_messages
  for select to authenticated
  using (exists (
    select 1 from public.tickets t
    where t.id = ticket_id
      and (t.reporter_id = auth.uid() or public.is_current_user_technician())
  ));

drop policy if exists "ticket participants send chat messages" on public.ticket_chat_messages;
create policy "ticket participants send chat messages" on public.ticket_chat_messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.tickets t
      where t.id = ticket_id
        and (t.reporter_id = auth.uid() or public.is_current_user_technician())
    )
  );

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'ticket_chat_messages'
  ) then
    alter publication supabase_realtime add table public.ticket_chat_messages;
  end if;
end;
$$;
