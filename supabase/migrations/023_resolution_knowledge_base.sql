create table if not exists public.resolution_articles (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 3 and 160),
  asset_id text not null,
  issue text not null,
  solution text not null check (char_length(trim(solution)) > 0),
  playbook_title text not null default '',
  source_ticket_id uuid not null unique references public.tickets(id) on delete cascade,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists resolution_articles_created_at_idx
  on public.resolution_articles (created_at desc);
create index if not exists resolution_articles_asset_id_idx
  on public.resolution_articles (asset_id);

alter table public.resolution_articles enable row level security;

create policy "support team reads resolution articles"
  on public.resolution_articles for select to authenticated
  using ((select role::text from public.profiles where id = auth.uid()) in ('technician', 'it_manager', 'admin'));

create policy "support team publishes resolution articles"
  on public.resolution_articles for insert to authenticated
  with check (
    created_by = auth.uid()
    and (select role::text from public.profiles where id = auth.uid()) in ('technician', 'it_manager', 'admin')
    and exists (
      select 1 from public.tickets t
      where t.id = source_ticket_id and t.status = 'resolved'
    )
  );
