-- Test de sécurité de la base, lancé par GitHub sur un Postgres vide (voir .github/workflows/tests.yml).
-- On joue le rôle « anon » (= n'importe qui avec la clé publique) et on vérifie qu'il ne peut rien faire
-- d'autre que ce que son code autorise. Une erreur arrête tout : le test est ❌.
\set ON_ERROR_STOP on

create temp table codes as select prenom, code from personnes;
grant select on codes to anon;
set role anon;

do $$
declare c_temoin text; c_dj text; c_mariee text; e jsonb; ok boolean;
begin
  select code into c_temoin from codes where prenom = 'Témoin 1';
  select code into c_dj     from codes where prenom = 'DJ';
  select code into c_mariee from codes where prenom = 'La mariée';

  -- 1. Les tables sont fermées
  begin perform 1 from personnes; raise exception 'ÉCHEC : anon peut lire personnes';
  exception when insufficient_privilege then null; end;
  begin perform 1 from taches; raise exception 'ÉCHEC : anon peut lire taches';
  exception when insufficient_privilege then null; end;
  begin update taches set fait = true; raise exception 'ÉCHEC : anon peut modifier taches';
  exception when insufficient_privilege then null; end;
  begin insert into personnes (prenom, role, admin) values ('pirate', 'x', true); raise exception 'ÉCHEC : anon peut ajouter un admin';
  exception when insufficient_privilege then null; end;

  -- 2. Un mauvais code ne donne rien
  if mon_espace('faux') is not null or mon_espace('') is not null or mon_espace(null) is not null then
    raise exception 'ÉCHEC : un mauvais code ouvre un espace';
  end if;

  -- 3. Un témoin voit ses tâches, pas celles du DJ, et pas les liens de l'équipe
  e := mon_espace(c_temoin);
  if e->'equipe' <> 'null'::jsonb then raise exception 'ÉCHEC : un témoin voit les liens de l''équipe'; end if;
  if e::text like '%Tester le son%' then raise exception 'ÉCHEC : un témoin voit la tâche du DJ'; end if;
  if e::text like '%' || c_dj || '%' then raise exception 'ÉCHEC : un témoin voit le code du DJ'; end if;
  if jsonb_array_length(e->'taches') <> 3 then raise exception 'ÉCHEC : le témoin devrait avoir 3 tâches'; end if;

  -- 4. Le DJ ne voit pas le moment réservé aux témoins et au traiteur
  if mon_espace(c_dj)::text like '%Installation de la salle%' then raise exception 'ÉCHEC : le DJ voit un moment qui ne le concerne pas'; end if;

  -- 5. Cocher : seulement ses propres tâches
  ok := cocher(c_temoin, (select (x->>'id')::bigint from jsonb_array_elements(mon_espace(c_mariee)->'taches') x where x->>'titre' like 'Tester le son%'), true);
  if ok then raise exception 'ÉCHEC : un témoin peut cocher la tâche du DJ'; end if;
  if cocher('faux', 1, true) then raise exception 'ÉCHEC : un mauvais code peut cocher'; end if;
  ok := cocher(c_temoin, (select (x->>'id')::bigint from jsonb_array_elements(e->'taches') x limit 1), true);
  if not ok then raise exception 'ÉCHEC : un témoin ne peut pas cocher sa propre tâche'; end if;

  -- 6. La mariée (admin) voit tout, avec les liens
  e := mon_espace(c_mariee);
  if jsonb_array_length(e->'equipe') <> 6 then raise exception 'ÉCHEC : l''admin devrait voir les 6 personnes'; end if;

  raise notice '✅ Base : tous les tests de sécurité passent';
end $$;
