-- Add an IT manager role with the same incident operations access as technicians.
alter type public.user_role add value if not exists 'it_manager';

create or replace function public.is_current_user_technician()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role::text in ('technician', 'it_manager', 'admin')
  );
$$;

drop policy if exists "technicians read tickets" on public.tickets;
create policy "technicians read tickets" on public.tickets
  for select to authenticated
  using (public.is_current_user_technician());

drop policy if exists "technicians update tickets" on public.tickets;
create policy "technicians update tickets" on public.tickets
  for update to authenticated
  using (public.is_current_user_technician())
  with check (public.is_current_user_technician());

-- Promote an account after creating it through the app:
-- update public.profiles set role = 'it_manager' where id = '<USER_UUID>';
