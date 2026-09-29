-- Add sample equipment used by the employee ticket form and technician reports.
insert into public.assets (id, name, kind, department, location) values
('IMP-FIN-001', 'Imprimante Finance', 'Imprimante', 'Finance', '2e étage · Bureau 210'),
('PC-RH-001', 'Poste gestion RH', 'PC fixe', 'Ressources humaines', '1er étage · Bureau RH'),
('PC-INF-002', 'Poste technicien IT', 'PC portable', 'Infrastructure', 'Salle serveur · RDC'),
('SW-INF-001', 'Commutateur réseau', 'Réseau', 'Infrastructure', 'Salle serveur · Baie 2'),
('PC-LOG-001', 'Poste expédition', 'PC fixe', 'Logistique', 'Entrepôt · Bureau logistique'),
('SCAN-LOG-001', 'Scanner codes-barres', 'Scanner', 'Logistique', 'Entrepôt · Zone expédition'),
('IMP-LOG-001', 'Imprimante étiquettes', 'Imprimante', 'Logistique', 'Entrepôt · Zone expédition'),
('TAB-LOG-001', 'Tablette inventaire', 'Tablette', 'Logistique', 'Entrepôt · Réserve'),
('PC-ADM-001', 'Poste administratif', 'PC fixe', 'Administration', 'Bâtiment principal · Bureau 101'),
('IMP-PRD-001', 'Imprimante de production', 'Imprimante', 'Production', 'Atelier · Poste de contrôle')
on conflict (id) do nothing;
