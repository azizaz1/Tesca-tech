-- Moving an asset between maps must remove its old map assignments atomically.
create or replace function public.move_facility_map_asset(
  p_map_id uuid,
  p_asset_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce((select role::text from public.profiles where id = auth.uid()), '') not in ('it_manager', 'admin') then
    raise exception 'Only IT managers and admins can move equipment between maps.' using errcode = '42501';
  end if;

  if not exists (select 1 from public.facility_maps where id = p_map_id) then
    raise exception 'The selected map does not exist.' using errcode = '23503';
  end if;

  if not exists (select 1 from public.assets where id = p_asset_id) then
    raise exception 'The selected equipment does not exist.' using errcode = '23503';
  end if;

  delete from public.facility_map_positions
  where asset_id = p_asset_id
    and map_id <> p_map_id;

  insert into public.facility_map_positions (map_id, asset_id, x, y, updated_by, updated_at)
  values (p_map_id, p_asset_id, 50, 50, auth.uid(), now())
  on conflict (map_id, asset_id) do nothing;
end;
$$;

revoke all on function public.move_facility_map_asset(uuid, text) from public, anon;
grant execute on function public.move_facility_map_asset(uuid, text) to authenticated;
