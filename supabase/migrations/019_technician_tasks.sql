-- Let IT managers assign operational work independently from incident tickets.
create table if not exists public.technician_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 3 and 160),
  description text not null default '' check (char_length(description) <= 2000),
  equipment text not null default '' check (char_length(equipment) <= 160),
  assigned_to uuid not null references public.profiles(id),
  created_by uuid not null references public.profiles(id) default auth.uid(),
  due_date date,
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'completed', 'cancelled')),
  completion_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists technician_tasks_assignee_status_idx
  on public.technician_tasks (assigned_to, status, created_at desc);

alter table public.technician_tasks enable row level security;
grant select, insert, update on public.technician_tasks to authenticated;

drop policy if exists "IT managers manage technician tasks" on public.technician_tasks;
create policy "IT managers manage technician tasks" on public.technician_tasks
  for all to authenticated
  using ((select role::text from public.profiles where id = auth.uid()) in ('it_manager', 'admin'))
  with check (
    (select role::text from public.profiles where id = auth.uid()) in ('it_manager', 'admin')
    and exists (select 1 from public.profiles p where p.id = assigned_to and p.role::text = 'technician')
  );

drop policy if exists "Technicians read assigned tasks" on public.technician_tasks;
create policy "Technicians read assigned tasks" on public.technician_tasks
  for select to authenticated using (assigned_to = auth.uid());

drop policy if exists "Technicians update assigned tasks" on public.technician_tasks;
create policy "Technicians update assigned tasks" on public.technician_tasks
  for update to authenticated using (
    assigned_to = auth.uid()
    and (select role::text from public.profiles where id = auth.uid()) = 'technician'
  ) with check (
    assigned_to = auth.uid()
    and (select role::text from public.profiles where id = auth.uid()) = 'technician'
  );

create table if not exists public.technician_task_notifications (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.technician_tasks(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  message text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists technician_task_notifications_recipient_idx
  on public.technician_task_notifications (recipient_id, created_at desc);

alter table public.technician_task_notifications enable row level security;
grant select, update (read_at) on public.technician_task_notifications to authenticated;

drop policy if exists "Technicians read their task notifications" on public.technician_task_notifications;
create policy "Technicians read their task notifications" on public.technician_task_notifications
  for select to authenticated using (recipient_id = auth.uid());

drop policy if exists "Technicians mark their task notifications read" on public.technician_task_notifications;
create policy "Technicians mark their task notifications read" on public.technician_task_notifications
  for update to authenticated using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());

create or replace function public.notify_technician_task_assignment()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or old.assigned_to is distinct from new.assigned_to then
    insert into public.technician_task_notifications (task_id, recipient_id, title, message)
    values (new.id, new.assigned_to, 'Nouvelle tâche', 'Une tâche vous a été attribuée : ' || new.title);
  end if;
  return new;
end;
$$;

drop trigger if exists technician_task_assignment_notification on public.technician_tasks;
create trigger technician_task_assignment_notification
  after insert or update of assigned_to on public.technician_tasks
  for each row execute function public.notify_technician_task_assignment();

do $$ begin
  alter publication supabase_realtime add table public.technician_tasks;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.technician_task_notifications;
exception when duplicate_object then null;
end $$;
