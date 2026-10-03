-- Allow admins to inspect the team and update roles through a guarded RPC.
create or replace function public.admin_set_user_role(p_user_id uuid, p_role public.user_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles
    where id = auth.uid() and role::text = 'admin'
  ) then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'Administrators cannot change their own role' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.profiles where id = p_user_id and role::text <> 'admin'
  ) then
    raise exception 'User not found or is already an administrator' using errcode = '42501';
  end if;

  update public.profiles set role = p_role where id = p_user_id;
end;
$$;

revoke all on function public.admin_set_user_role(uuid, public.user_role) from public;
grant execute on function public.admin_set_user_role(uuid, public.user_role) to authenticated;
