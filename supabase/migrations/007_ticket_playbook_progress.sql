-- Persist technician repair checklist progress and diagnostic notes per incident.
create table if not exists public.ticket_playbook_progress (
  ticket_id uuid primary key references public.tickets(id) on delete cascade,
  playbook_id text not null,
  checked_steps jsonb not null default '[]'::jsonb check (jsonb_typeof(checked_steps) = 'array'),
  technician_note text not null default '',
  technician_id uuid not null references public.profiles(id),
  updated_at timestamptz not null default now()
);

alter table public.ticket_playbook_progress enable row level security;
grant select, insert, update on public.ticket_playbook_progress to authenticated;

drop policy if exists "playbook progress visible to reporters and technicians" on public.ticket_playbook_progress;
create policy "playbook progress visible to reporters and technicians" on public.ticket_playbook_progress
  for select to authenticated
  using (exists (
    select 1 from public.tickets t
    where t.id = ticket_id
      and (t.reporter_id = auth.uid() or public.is_current_user_technician())
  ));

drop policy if exists "technicians create playbook progress" on public.ticket_playbook_progress;
create policy "technicians create playbook progress" on public.ticket_playbook_progress
  for insert to authenticated
  with check (public.is_current_user_technician() and technician_id = auth.uid());

drop policy if exists "technicians update playbook progress" on public.ticket_playbook_progress;
create policy "technicians update playbook progress" on public.ticket_playbook_progress
  for update to authenticated
  using (public.is_current_user_technician())
  with check (public.is_current_user_technician() and technician_id = auth.uid());
