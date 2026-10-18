-- Track the condition of each asset and let the support team update it.
alter table public.assets
  add column if not exists operational_status text not null default 'unknown',
  add column if not exists status_updated_at timestamptz,
  add column if not exists status_updated_by uuid references public.profiles(id) on delete set null;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.assets'::regclass
      and conname = 'assets_operational_status_check'
  ) then
    alter table public.assets
      add constraint assets_operational_status_check
      check (operational_status in ('unknown', 'operational', 'out_of_service', 'maintenance'));
  end if;
end $$;

grant update (operational_status) on public.assets to authenticated;

drop policy if exists "support team updates equipment status" on public.assets;
create policy "support team updates equipment status" on public.assets
  for update to authenticated
  using (public.is_current_user_technician())
  with check (public.is_current_user_technician());

create or replace function public.set_asset_status_metadata()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.operational_status is distinct from old.operational_status then
    new.status_updated_at := now();
    new.status_updated_by := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists assets_status_metadata on public.assets;
create trigger assets_status_metadata
  before update of operational_status on public.assets
  for each row execute function public.set_asset_status_metadata();

-- A new incident means the equipment needs attention until the support team
-- confirms its condition. Preserve an explicit out-of-service status.
create or replace function public.mark_ticket_asset_for_maintenance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.assets
  set operational_status = 'maintenance'
  where id = new.asset_id
    and operational_status in ('unknown', 'operational');
  return new;
end;
$$;

revoke all on function public.mark_ticket_asset_for_maintenance() from public, anon, authenticated;

drop trigger if exists ticket_sets_asset_maintenance on public.tickets;
create trigger ticket_sets_asset_maintenance
  after insert on public.tickets
  for each row execute function public.mark_ticket_asset_for_maintenance();

create or replace function public.restore_asset_after_ticket_resolution()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('resolved', 'closed', 'cancelled') then
    -- Serialize resolutions for the same asset before checking for other open tickets.
    perform 1 from public.assets where id = new.asset_id for update;

    update public.assets a
    set operational_status = 'operational'
    where a.id = new.asset_id
      and a.operational_status = 'maintenance'
      and not exists (
        select 1
        from public.tickets t
        where t.asset_id = new.asset_id
          and t.id <> new.id
          and t.status in ('open', 'assigned', 'in_progress', 'waiting_parts', 'reopened')
      );
  end if;
  return new;
end;
$$;

revoke all on function public.restore_asset_after_ticket_resolution() from public, anon, authenticated;

drop trigger if exists ticket_restores_asset_after_resolution on public.tickets;
create trigger ticket_restores_asset_after_resolution
  after update of status on public.tickets
  for each row execute function public.restore_asset_after_ticket_resolution();

-- Bring existing open incidents into the map status as well.
update public.assets a
set operational_status = 'maintenance'
where a.operational_status in ('unknown', 'operational')
  and exists (
    select 1
    from public.tickets t
    where t.asset_id = a.id
      and t.status in ('open', 'assigned', 'in_progress', 'waiting_parts', 'reopened')
  );
