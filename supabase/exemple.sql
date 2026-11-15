-- Données d'exemple pour tester (à remplacer par les vraies).
-- À coller dans Supabase → SQL Editor → Run, APRÈS schema.sql.
-- Ensuite, pour voir les liens : select prenom, role, code from personnes;

insert into personnes (prenom, role, admin) values
  ('La mariée', 'Mariée', true),
  ('Elange',    'Organisation', true),
  ('Témoin 1',  'Témoin', false),
  ('Témoin 2',  'Témoin', false),
  ('DJ',        'DJ', false),
  ('Traiteur',  'Traiteur', false);

insert into moments (debut, fin, titre, lieu, details, pour) values
  ('08:00', '10:00', 'Installation de la salle', 'Salle de réception', 'Déco des tables, plan de table, livre d''or.', '{Témoin,Traiteur}'),
  ('14:00', '15:00', 'Cérémonie', 'Mairie', 'Arriver 15 min avant. Les témoins signent le registre.', '{}'),
  ('16:00', '18:30', 'Vin d''honneur', 'Salle de réception', null, '{}'),
  ('19:30', null,    'Entrée des mariés', 'Salle de réception', 'Le DJ lance la musique d''entrée au signal des témoins.', '{}'),
  ('20:00', '22:30', 'Dîner', 'Salle de réception', null, '{}'),
  ('23:00', null,    'Ouverture du bal', 'Piste de danse', null, '{}');

insert into taches (titre, details, heure, role) values
  ('Récupérer les alliances', 'Chez la mariée, la veille au soir.', null, 'Témoin'),
  ('Donner le signal au DJ pour l''entrée des mariés', null, '19:25', 'Témoin'),
  ('Tester le son et le micro', null, '15:30', 'DJ'),
  ('Dresser le buffet du vin d''honneur', null, '15:30', 'Traiteur');

insert into taches (titre, heure, personne_id)
  select 'Préparer le discours des témoins', null, id from personnes where prenom = 'Témoin 1';

-- Version 2 : groupes, moments publics, tâches par section, fiches, plan de table (exemples)
update personnes set groupes = '{Team}' where prenom in ('Témoin 1', 'Témoin 2', 'Elange');
update moments set public = true where titre in ('Cérémonie', 'Vin d''honneur', 'Entrée des mariés', 'Dîner', 'Ouverture du bal');

insert into taches (titre, section, pour) values
  ('Installer les sapins de la salle', 'Vendredi · Salle principale', '{Team}');

insert into fiches (titre, icone, contenu, pour, public, ordre) values
  ('Fiche DJ', '🎧', E'## Déroulé\n- 21h00 : entrée des mariés\n## Blacklist\n- Pas de **macarena**', '{DJ}', false, 1),
  ('Le bar et le menu', '🥂', E'## Le bar\n- Soupe de champagne\n- Sans alcool', '{}', true, 2);

insert into plan_table (nom, table_no) values
  ('Léa Martin', 1), ('Chloé Durand', 1), ('Paul Petit', 2), ('Hugo Petit', 2);
