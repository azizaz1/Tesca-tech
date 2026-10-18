-- Support multiple named facility plans, each with independent equipment pins.
create table if not exists public.facility_maps (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 100),
  map_path text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.facility_maps enable row level security;
grant select, insert, update, delete on public.facility_maps to authenticated;
drop policy if exists "authenticated users read facility maps" on public.facility_maps;
create policy "authenticated users read facility maps" on public.facility_maps for select to authenticated using (true);
drop policy if exists "IT managers manage facility maps" on public.facility_maps;
create policy "IT managers manage facility maps" on public.facility_maps for all to authenticated using (
  (select role::text from public.profiles where id = auth.uid()) in ('it_manager', 'admin')
) with check ((select role::text from public.profiles where id = auth.uid()) in ('it_manager', 'admin'));

alter table public.facility_map_positions add column if not exists map_id uuid references public.facility_maps(id) on delete cascade;
-- The old primary key is replaced below; keep Realtime updates valid during the backfill.
alter table public.facility_map_positions replica identity full;
do $$ begin
  if exists (select 1 from pg_constraint where conrelid = 'public.facility_map_positions'::regclass and conname = 'facility_map_positions_pkey') then
    alter table public.facility_map_positions drop constraint facility_map_positions_pkey;
  end if;
end $$;
do $$
declare legacy_id uuid;
begin
  select id into legacy_id from public.facility_maps order by created_at limit 1;
  if legacy_id is null then
    insert into public.facility_maps (name, map_path)
    select 'Plan principal', map_path from public.facility_map_settings where id = true
    returning id into legacy_id;
  end if;
  update public.facility_map_positions set map_id = legacy_id where map_id is null;
end $$;

alter table public.facility_map_positions alter column map_id set not null;
alter table public.facility_map_positions add primary key (map_id, asset_id);
alter table public.facility_map_positions replica identity default;

do $$ begin
  alter publication supabase_realtime add table public.facility_maps;
exception when duplicate_object then null;
end $$;
