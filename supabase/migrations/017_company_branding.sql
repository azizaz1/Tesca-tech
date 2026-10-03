-- One company-wide brand configuration, editable only by admins.
create table if not exists public.company_settings (
  id boolean primary key default true check (id),
  company_name text not null default 'Tesca Tech' check (char_length(company_name) between 1 and 80),
  logo_path text,
  updated_at timestamptz not null default now()
);

insert into public.company_settings (id, company_name, logo_path)
values (true, 'Tesca Tech', null)
on conflict (id) do nothing;

alter table public.company_settings enable row level security;
grant select on public.company_settings to anon, authenticated;
grant update on public.company_settings to authenticated;

drop policy if exists "anyone reads company branding" on public.company_settings;
create policy "anyone reads company branding" on public.company_settings
  for select to anon, authenticated using (true);

drop policy if exists "admins update company branding" on public.company_settings;
create policy "admins update company branding" on public.company_settings
  for update to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role::text = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role::text = 'admin'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('company-branding', 'company-branding', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = true,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "anyone reads company logo" on storage.objects;
create policy "anyone reads company logo" on storage.objects
  for select to anon, authenticated using (bucket_id = 'company-branding');

drop policy if exists "admins upload company logo" on storage.objects;
create policy "admins upload company logo" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'company-branding'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role::text = 'admin')
  );

drop policy if exists "admins update company logo" on storage.objects;
create policy "admins update company logo" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'company-branding'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role::text = 'admin')
  )
  with check (
    bucket_id = 'company-branding'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role::text = 'admin')
  );

drop policy if exists "admins delete company logo" on storage.objects;
create policy "admins delete company logo" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'company-branding'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role::text = 'admin')
  );

do $$
begin
  alter publication supabase_realtime add table public.company_settings;
exception when duplicate_object then null;
end;
$$;
