grant select, insert on public.assets to authenticated;

drop policy if exists "IT managers add facility assets" on public.assets;
create policy "IT managers add facility assets" on public.assets
  for insert to authenticated with check (
    (select role::text from public.profiles where id = auth.uid()) in ('it_manager', 'admin')
  );

do $$ begin
  alter publication supabase_realtime add table public.assets;
exception when duplicate_object then null;
end $$;
