-- Run this now in Supabase SQL Editor. It creates an employee profile for
-- every new Supabase Auth user, without trusting a role sent by the app.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', 'Utilisateur'), 'employee');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- A signed-in user may read their own profile; account creation is handled by
-- the trigger above, not by a browser policy.

-- After registering a technician, promote that account from SQL Editor:
-- update public.profiles set role = 'technician' where id = '<USER_UUID>';
