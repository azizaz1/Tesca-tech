-- Track the support tier currently handling each incident.
alter table public.tickets
  add column if not exists technician_level smallint not null default 1
  check (technician_level between 1 and 3);
