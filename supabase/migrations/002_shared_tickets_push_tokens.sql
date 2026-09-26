-- Shared incident storage and push notification device registrations.
-- Apply after schema.sql and 001_auth_profiles.sql.

create or replace function public.is_current_user_technician()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('technician', 'admin')
  );
$$;

revoke all on function public.is_current_user_technician() from public;
grant execute on function public.is_current_user_technician() to authenticated;

drop policy if exists "read own profile" on public.profiles;
create policy "read own profile and technician directory" on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_current_user_technician());

create table if not exists public.push_tokens (
  user_id uuid not null references public.profiles(id) on delete cascade,
  token text not null,
  platform text not null default 'android' check (platform in ('android', 'ios')),
  updated_at timestamptz not null default now(),
  primary key (user_id, token)
);

grant select, insert, update, delete on public.push_tokens to authenticated;
alter table public.push_tokens enable row level security;

drop policy if exists "users manage own push tokens" on public.push_tokens;
create policy "users manage own push tokens" on public.push_tokens
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create or replace function public.set_ticket_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_ticket_updated_at on public.tickets;
create trigger set_ticket_updated_at
  before update on public.tickets
  for each row execute function public.set_ticket_updated_at();

do $$
begin
  alter publication supabase_realtime add table public.tickets;
exception
  when duplicate_object then null;
end;
$$;
