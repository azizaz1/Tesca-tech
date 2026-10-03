-- Grant IT managers the same incident read and update policies as technicians.
-- This is separate from 014 so projects that already applied 014 receive it.
drop policy if exists "technicians read tickets" on public.tickets;
create policy "technicians read tickets" on public.tickets
  for select to authenticated
  using (public.is_current_user_technician());

drop policy if exists "technicians update tickets" on public.tickets;
create policy "technicians update tickets" on public.tickets
  for update to authenticated
  using (public.is_current_user_technician())
  with check (public.is_current_user_technician());
