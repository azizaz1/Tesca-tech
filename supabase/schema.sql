-- Run this once in Supabase: SQL Editor > New query > Run.
create type public.user_role as enum ('employee', 'technician', 'admin');
create type public.ticket_status as enum ('open', 'assigned', 'in_progress', 'waiting_parts', 'resolved', 'closed', 'reopened', 'cancelled');
create type public.ticket_priority as enum ('normal', 'high');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role public.user_role not null default 'employee',
  created_at timestamptz not null default now()
);
create table public.assets (
  id text primary key,
  name text not null,
  kind text not null,
  department text not null,
  location text not null,
  created_at timestamptz not null default now()
);
create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  reference text generated always as ('INC-' || upper(substr(replace(id::text, '-', ''), 1, 6))) stored,
  asset_id text not null references public.assets(id),
  reporter_id uuid not null references public.profiles(id),
  technician_id uuid references public.profiles(id),
  issue text not null check (char_length(issue) between 5 and 2000),
  priority public.ticket_priority not null default 'normal',
  status public.ticket_status not null default 'open',
  technician_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.assets enable row level security;
alter table public.tickets enable row level security;

create policy "read own profile" on public.profiles for select to authenticated using (id = auth.uid());
create policy "read assets" on public.assets for select to authenticated using (true);
create policy "employees create tickets" on public.tickets for insert to authenticated with check (reporter_id = auth.uid());
create policy "employees read own tickets" on public.tickets for select to authenticated using (reporter_id = auth.uid());
create policy "technicians read tickets" on public.tickets for select to authenticated using ((select role from public.profiles where id = auth.uid()) in ('technician', 'admin'));
create policy "technicians update tickets" on public.tickets for update to authenticated using ((select role from public.profiles where id = auth.uid()) in ('technician', 'admin')) with check ((select role from public.profiles where id = auth.uid()) in ('technician', 'admin'));

insert into public.assets (id, name, kind, department, location) values
('PC-FIN-014', 'Poste comptable', 'PC fixe', 'Finance', '2e étage · Bureau 204'),
('PC-FIN-008', 'Poste recouvrement', 'PC fixe', 'Finance', '2e étage · Bureau 206'),
('IMP-RH-002', 'Imprimante RH', 'Ressources humaines', 'Ressources humaines', '1er étage · Accueil RH'),
('NET-001', 'Routeur principal', 'Réseau', 'Infrastructure', 'Salle serveur · RDC')
on conflict (id) do nothing;

insert into public.assets (id, name, kind, department, location) values
('IMP-FIN-001', 'Imprimante Finance', 'Imprimante', 'Finance', '2e étage · Bureau 210'),
('PC-RH-001', 'Poste gestion RH', 'PC fixe', 'Ressources humaines', '1er étage · Bureau RH'),
('PC-RH-002', 'Poste RH', 'PC fixe', 'Ressources humaines', '1er étage · Bureau RH'),
('PC-INF-002', 'Poste technicien IT', 'PC portable', 'Infrastructure', 'Salle serveur · RDC'),
('SW-INF-001', 'Commutateur réseau', 'Réseau', 'Infrastructure', 'Salle serveur · Baie 2'),
('PC-LOG-001', 'Poste expédition', 'PC fixe', 'Logistique', 'Entrepôt · Bureau logistique'),
('SCAN-LOG-001', 'Scanner codes-barres', 'Scanner', 'Logistique', 'Entrepôt · Zone expédition'),
('IMP-LOG-001', 'Imprimante étiquettes', 'Imprimante', 'Logistique', 'Entrepôt · Zone expédition'),
('TAB-LOG-001', 'Tablette inventaire', 'Tablette', 'Logistique', 'Entrepôt · Réserve'),
('PC-ADM-001', 'Poste administratif', 'PC fixe', 'Administration', 'Bâtiment principal · Bureau 101'),
('IMP-PRD-001', 'Imprimante de production', 'Imprimante', 'Production', 'Atelier · Poste de contrôle')
on conflict (id) do nothing;
