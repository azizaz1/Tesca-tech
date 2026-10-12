-- Let support staff archive catalog entries without deleting their audit history.
create or replace function public.set_inventory_item_active(p_item_id uuid, p_active boolean)
returns public.inventory_items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.inventory_items%rowtype;
begin
  if not public.is_current_user_technician() then
    raise exception 'Support team access required';
  end if;
  if p_active is null then
    raise exception 'Active state is required';
  end if;

  update public.inventory_items
  set active = p_active
  where id = p_item_id
  returning * into v_item;

  if not found then
    raise exception 'Consumable not found';
  end if;
  return v_item;
end;
$$;

revoke all on function public.set_inventory_item_active(uuid, boolean) from public;
grant execute on function public.set_inventory_item_active(uuid, boolean) to authenticated;
