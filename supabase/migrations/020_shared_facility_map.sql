-- Share an uploaded site map and equipment pin positions across devices.
create table if not exists public.facility_map_settings (
  id boolean primary key default true check (id),
  map_path text,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

insert into public.facility_map_settings (id) values (true)
on conflict (id) do nothing;

alter table public.facility_map_settings enable row level security;
grant select, update on public.facility_map_settings to authenticated;

drop policy if exists "authenticated users read facility map settings" on public.facility_map_settings;
create policy "authenticated users read facility map settings" on public.facility_map_settings
  for select to authenticated using (true);

drop policy if exists "IT managers update facility map settings" on public.facility_map_settings;
create policy "IT managers update facility map settings" on public.facility_map_settings
  for update to authenticated using (
    (select role::text from public.profiles where id = auth.uid()) in ('it_manager', 'admin')
  ) with check (
    (select role::text from public.profiles where id = auth.uid()) in ('it_manager', 'admin')
  );

create table if not exists public.facility_map_positions (
  asset_id text primary key,
  x numeric not null check (x between 0 and 100),
  y numeric not null check (y between 0 and 100),
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

alter table public.facility_map_positions enable row level security;
grant select, insert, update, delete on public.facility_map_positions to authenticated;

drop policy if exists "authenticated users read facility map positions" on public.facility_map_positions;
create policy "authenticated users read facility map positions" on public.facility_map_positions
  for select to authenticated using (true);

drop policy if exists "IT managers manage facility map positions" on public.facility_map_positions;
create policy "IT managers manage facility map positions" on public.facility_map_positions
  for all to authenticated using (
    (select role::text from public.profiles where id = auth.uid()) in ('it_manager', 'admin')
  ) with check (
    (select role::text from public.profiles where id = auth.uid()) in ('it_manager', 'admin')
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('facility-maps', 'facility-maps', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "authenticated users read facility maps" on storage.objects;
create policy "authenticated users read facility maps" on storage.objects
  for select to authenticated using (bucket_id = 'facility-maps');

drop policy if exists "IT managers upload facility maps" on storage.objects;
create policy "IT managers upload facility maps" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'facility-maps'
    and (select role::text from public.profiles where id = auth.uid()) in ('it_manager', 'admin')
  );

drop policy if exists "IT managers update facility maps" on storage.objects;
create policy "IT managers update facility maps" on storage.objects
  for update to authenticated using (
    bucket_id = 'facility-maps'
    and (select role::text from public.profiles where id = auth.uid()) in ('it_manager', 'admin')
  ) with check (
    bucket_id = 'facility-maps'
    and (select role::text from public.profiles where id = auth.uid()) in ('it_manager', 'admin')
  );

drop policy if exists "IT managers delete facility maps" on storage.objects;
create policy "IT managers delete facility maps" on storage.objects
  for delete to authenticated using (
    bucket_id = 'facility-maps'
    and (select role::text from public.profiles where id = auth.uid()) in ('it_manager', 'admin')
  );

do $$ begin
  alter publication supabase_realtime add table public.facility_map_settings;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.facility_map_positions;
exception when duplicate_object then null;
end $$;
