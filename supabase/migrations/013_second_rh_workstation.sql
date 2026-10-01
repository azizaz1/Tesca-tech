-- Add a second illustrative RH workstation for the facility map.
insert into public.assets (id, name, kind, department, location) values
('PC-RH-002', 'Poste RH', 'PC fixe', 'Ressources humaines', '1er étage · Bureau RH')
on conflict (id) do nothing;
