-- Private storage and metadata for incident photos and PDF evidence.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ticket-attachments', 'ticket-attachments', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.ticket_attachments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null,
  created_at timestamptz not null default now()
);

alter table public.ticket_attachments enable row level security;
grant select, insert on public.ticket_attachments to authenticated;

drop policy if exists "ticket attachments visible to reporter and technicians" on public.ticket_attachments;
create policy "ticket attachments visible to reporter and technicians" on public.ticket_attachments
  for select to authenticated
  using (exists (
    select 1 from public.tickets t
    where t.id = ticket_id
      and (t.reporter_id = auth.uid() or public.is_current_user_technician())
  ));

drop policy if exists "reporters add ticket attachments" on public.ticket_attachments;
create policy "reporters add ticket attachments" on public.ticket_attachments
  for insert to authenticated
  with check (exists (
    select 1 from public.tickets t
    where t.id = ticket_id and t.reporter_id = auth.uid()
  ));

drop policy if exists "reporters upload their ticket attachments" on storage.objects;
create policy "reporters upload their ticket attachments" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'ticket-attachments'
    and exists (
      select 1 from public.tickets t
      where t.id::text = (storage.foldername(name))[1]
        and t.reporter_id = auth.uid()
    )
  );

drop policy if exists "reporters and technicians read ticket attachments" on storage.objects;
create policy "reporters and technicians read ticket attachments" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'ticket-attachments'
    and exists (
      select 1 from public.tickets t
      where t.id::text = (storage.foldername(name))[1]
        and (t.reporter_id = auth.uid() or public.is_current_user_technician())
    )
  );
