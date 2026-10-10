-- Track consumable stock as an auditable ledger for the support team.
create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (char_length(code) between 1 and 80),
  name text not null check (char_length(name) between 1 and 160),
  color text not null default '' check (char_length(color) <= 80),
  min_stock integer not null default 0 check (min_stock >= 0),
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.inventory_items(id) on delete restrict,
  movement_type text not null check (movement_type in ('arrival', 'usage', 'adjustment')),
  quantity_change integer not null check (quantity_change <> 0),
  asset_id text references public.assets(id) on delete set null,
  ticket_id uuid references public.tickets(id) on delete set null,
  technician_id uuid not null references public.profiles(id),
  note text not null default '' check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  check ((movement_type = 'arrival' and quantity_change > 0)
      or (movement_type = 'usage' and quantity_change < 0)
      or movement_type = 'adjustment')
);

create index if not exists inventory_movements_item_created_idx
  on public.inventory_movements (item_id, created_at desc);
create index if not exists inventory_movements_created_idx
  on public.inventory_movements (created_at desc);

alter table public.inventory_items enable row level security;
alter table public.inventory_movements enable row level security;
grant select, insert on public.inventory_items to authenticated;
grant select on public.inventory_movements to authenticated;

drop policy if exists "support team reads inventory items" on public.inventory_items;
create policy "support team reads inventory items" on public.inventory_items
  for select to authenticated using (public.is_current_user_technician());

drop policy if exists "support team adds inventory items" on public.inventory_items;
create policy "support team adds inventory items" on public.inventory_items
  for insert to authenticated with check (
    public.is_current_user_technician()
    and (created_by is null or created_by = auth.uid())
  );

drop policy if exists "support team reads inventory movements" on public.inventory_movements;
create policy "support team reads inventory movements" on public.inventory_movements
  for select to authenticated using (public.is_current_user_technician());

create or replace function public.record_inventory_movement(
  p_item_id uuid,
  p_movement_type text,
  p_quantity integer,
  p_adjustment_direction text default 'add',
  p_asset_id text default null,
  p_ticket_id uuid default null,
  p_note text default ''
)
returns public.inventory_movements
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.inventory_items%rowtype;
  v_balance integer;
  v_delta integer;
  v_movement public.inventory_movements%rowtype;
begin
  if not public.is_current_user_technician() then
    raise exception 'Support team access required';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantity must be greater than zero';
  end if;
  if p_movement_type not in ('arrival', 'usage', 'adjustment') then
    raise exception 'Invalid inventory movement type';
  end if;

  select * into v_item from public.inventory_items where id = p_item_id and active for update;
  if not found then
    raise exception 'Inventory item not found or inactive';
  end if;

  select coalesce(sum(quantity_change), 0)::integer into v_balance
  from public.inventory_movements where item_id = p_item_id;

  v_delta := case
    when p_movement_type = 'arrival' then p_quantity
    when p_movement_type = 'usage' then -p_quantity
    when p_adjustment_direction = 'remove' then -p_quantity
    when p_adjustment_direction = 'add' then p_quantity
    else null
  end;
  if v_delta is null then
    raise exception 'Invalid adjustment direction';
  end if;
  if v_balance + v_delta < 0 then
    raise exception 'Insufficient stock: only % item(s) are available', v_balance;
  end if;
  if p_movement_type = 'usage' and p_asset_id is null then
    raise exception 'Choose the equipment that received the consumable';
  end if;

  insert into public.inventory_movements (
    item_id, movement_type, quantity_change, asset_id, ticket_id, technician_id, note
  ) values (
    p_item_id, p_movement_type, v_delta, p_asset_id, p_ticket_id, auth.uid(), coalesce(p_note, '')
  ) returning * into v_movement;
  return v_movement;
end;
$$;

revoke all on function public.record_inventory_movement(uuid, text, integer, text, text, uuid, text) from public;
grant execute on function public.record_inventory_movement(uuid, text, integer, text, text, uuid, text) to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.inventory_items;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.inventory_movements;
exception when duplicate_object then null;
end $$;
