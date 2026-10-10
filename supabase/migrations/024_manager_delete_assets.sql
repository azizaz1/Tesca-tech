-- Allow IT managers and admins to remove unused assets from the facility map.
grant delete on public.assets to authenticated;

drop policy if exists "IT managers delete facility assets" on public.assets;
create policy "IT managers delete facility assets" on public.assets
  for delete to authenticated using (
    (select role::text from public.profiles where id = auth.uid()) in ('it_manager', 'admin')
  );
