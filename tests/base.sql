-- Test de sécurité de la base, lancé par GitHub sur un Postgres vide (voir .github/workflows/tests.yml).
-- On joue le rôle « anon » (= n'importe qui avec la clé publique) et on vérifie qu'il ne peut rien faire
-- d'autre que ce que son code autorise. Une erreur arrête tout : le test est ❌.
\set ON_ERROR_STOP on

create temp table codes as select prenom, code from personnes
  union all select 'INVITES', valeur from reglages where cle = 'code_invites';
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
  if jsonb_array_length(e->'taches') <> 4 then raise exception 'ÉCHEC : le témoin devrait avoir 4 tâches (dont 1 du groupe Team)'; end if;

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

  -- 7. Le live
  declare inv text; p uuid; f jsonb; u text := gen_random_uuid()::text;
  begin
    select code into inv from codes where prenom = 'INVITES';
    begin perform 1 from reglages; raise exception 'ÉCHEC : anon peut lire le code invités';
    exception when insufficient_privilege then null; end;
    begin perform 1 from posts; raise exception 'ÉCHEC : anon peut lire les posts directement';
    exception when insufficient_privilege then null; end;
    if live_fil('faux') is not null then raise exception 'ÉCHEC : le fil s''ouvre avec un mauvais code'; end if;
    if live_fil(c_temoin) is not null then raise exception 'ÉCHEC : un code perso sert de code invités'; end if;
    if (mon_espace(c_temoin)->>'invite') <> inv then raise exception 'ÉCHEC : l''organisation ne reçoit pas le code invités'; end if;

    begin perform live_poster('faux', 'Pirate', 'photo', 'faux/' || u || '.jpg', 'faux/' || u || '-m.jpg');
      raise exception 'ÉCHEC : poster avec un mauvais code';
    exception when raise_exception then if sqlerrm like 'ÉCHEC%' then raise; end if; end;
    begin perform live_poster(inv, 'Pirate', 'photo', 'https://pirate.example/x.jpg', inv || '/' || u || '-m.jpg');
      raise exception 'ÉCHEC : un post peut pointer vers un autre site';
    exception when raise_exception then if sqlerrm like 'ÉCHEC%' then raise; end if; end;
    begin perform live_poster(inv, 'Pirate', 'photo', inv || '/../' || u || '.jpg', inv || '/' || u || '-m.jpg');
      raise exception 'ÉCHEC : un chemin bizarre est accepté';
    exception when raise_exception then if sqlerrm like 'ÉCHEC%' then raise; end if; end;

    p := live_poster(inv, 'Léa', 'photo', inv || '/' || u || '.jpg', inv || '/' || u || '-m.jpg', 'Trop beau');
    f := live_fil(inv);
    if jsonb_array_length(f->'posts') <> 1 then raise exception 'ÉCHEC : le post n''apparaît pas dans le fil'; end if;
    if jsonb_array_length(live_fil(inv, (f->>'maintenant')::timestamptz + interval '1 second')->'posts') <> 0 then
      raise exception 'ÉCHEC : le fil renvoie tout au lieu des nouveautés'; end if;

    if live_cacher(c_temoin, p, true) then raise exception 'ÉCHEC : un témoin peut masquer un post'; end if;
    if live_cacher(inv, p, true) then raise exception 'ÉCHEC : le code invités peut masquer un post'; end if;
    if not live_cacher(c_mariee, p, true) then raise exception 'ÉCHEC : l''admin ne peut pas masquer'; end if;
    if live_fil(inv)::text like '%Trop beau%' then raise exception 'ÉCHEC : un post masqué reste visible'; end if;
    if live_fil(inv, (f->>'maintenant')::timestamptz)->'posts'->0->>'cache' <> 'true' then
      raise exception 'ÉCHEC : les téléphones ne sont pas prévenus qu''un post est masqué'; end if;

    for i in 1..15 loop
      perform live_poster(inv, 'Spam', 'photo', inv || '/' || gen_random_uuid() || '.jpg', inv || '/' || u || '-m.jpg');
    end loop;
    begin perform live_poster(inv, 'Spam', 'photo', inv || '/' || u || '.jpg', inv || '/' || u || '-m.jpg');
      raise exception 'ÉCHEC : pas d''anti-spam';
    exception when raise_exception then if sqlerrm like 'ÉCHEC%' then raise; end if; end;
  end;

  -- 8. Version 2 : groupes, fiches, programme des invités, « Trouve ta table »
  declare inv text; r jsonb;
  begin
    select code into inv from codes where prenom = 'INVITES';
    if mon_espace(c_dj)::text like '%Installer les sapins%' then raise exception 'ÉCHEC : le DJ voit une tâche du groupe Team'; end if;
    if mon_espace(c_temoin)::text not like '%Installer les sapins%' then raise exception 'ÉCHEC : un témoin (Team) ne voit pas la tâche du groupe'; end if;
    if not cocher(c_temoin, (select (x->>'id')::bigint from jsonb_array_elements(mon_espace(c_mariee)->'taches') x where x->>'titre' like 'Installer les sapins%'), true) then
      raise exception 'ÉCHEC : un membre du groupe ne peut pas cocher la tâche du groupe'; end if;
    if cocher(c_dj, (select (x->>'id')::bigint from jsonb_array_elements(mon_espace(c_mariee)->'taches') x where x->>'titre' like 'Installer les sapins%'), false) then
      raise exception 'ÉCHEC : le DJ peut cocher une tâche du groupe Team'; end if;

    if mon_espace(c_dj)::text not like '%Fiche DJ%' then raise exception 'ÉCHEC : le DJ ne voit pas sa fiche'; end if;
    if mon_espace(c_temoin)::text like '%Fiche DJ%' then raise exception 'ÉCHEC : un témoin voit la fiche DJ'; end if;
    if mon_espace(c_temoin)::text not like '%Le bar et le menu%' then raise exception 'ÉCHEC : la fiche publique est cachée'; end if;

    if infos_invites('faux') is not null or infos_invites(c_temoin) is not null then raise exception 'ÉCHEC : infos invités sans le code invités'; end if;
    r := infos_invites(inv);
    if r::text like '%Fiche DJ%' then raise exception 'ÉCHEC : les invités voient la fiche DJ'; end if;
    if r::text like '%Installation de la salle%' then raise exception 'ÉCHEC : les invités voient un moment privé'; end if;
    if r::text not like '%Cérémonie%' or r::text not like '%Le bar et le menu%' then raise exception 'ÉCHEC : le programme invités est incomplet'; end if;

    if trouver_table('faux', 'lea') is not null then raise exception 'ÉCHEC : trouver_table sans le code invités'; end if;
    if jsonb_array_length(trouver_table(inv, 'e')) <> 0 then raise exception 'ÉCHEC : 1 lettre suffit pour lister les invités'; end if;
    r := trouver_table(inv, 'CHLOE');
    if jsonb_array_length(r) <> 1 or (r->0->>'table')::int <> 1 or r->0->'voisins' <> '["Léa Martin"]'::jsonb then
      raise exception 'ÉCHEC : « chloe » doit trouver Chloé Durand, table 1, avec Léa Martin : %', r; end if;
    if jsonb_array_length(trouver_table(inv, 'petit')) <> 2 then raise exception 'ÉCHEC : la recherche par nom de famille'; end if;
  end;

  -- 9. Version 3 : dessin des tables, ma table, photos
  declare inv text; r jsonb; u text := gen_random_uuid()::text;
  begin
    select code into inv from codes where prenom = 'INVITES';
    r := trouver_table(inv, 'hugo');
    if r->0->'detail'->>'forme' <> 'rect' or jsonb_array_length(r->0->'detail'->'places') <> 4 then
      raise exception 'ÉCHEC : le dessin de la table 2 est faux : %', r; end if;
    if (mon_espace(c_temoin)->'ma_table'->'detail'->>'table')::int <> 2 then raise exception 'ÉCHEC : le témoin ne voit pas sa table'; end if;
    if mon_espace(c_dj)->'ma_table' <> 'null'::jsonb then raise exception 'ÉCHEC : le DJ a une table alors qu''il n''est pas relié au plan'; end if;
    begin perform details_table(1); raise exception 'ÉCHEC : details_table est appelable directement';
    exception when insufficient_privilege then null; end;

    if changer_photo(c_temoin, 'DJ', inv || '/equipe/' || u || '.jpg') then raise exception 'ÉCHEC : un témoin change la photo du DJ'; end if;
    if changer_photo(c_temoin, null, 'https://pirate.example/x.jpg') then raise exception 'ÉCHEC : une photo peut venir d''un autre site'; end if;
    if changer_photo(c_temoin, null, inv || '/' || u || '.jpg') then raise exception 'ÉCHEC : une photo hors du dossier equipe'; end if;
    if changer_photo('faux', null, inv || '/equipe/' || u || '.jpg') then raise exception 'ÉCHEC : changer une photo sans code'; end if;
    if not changer_photo(c_temoin, null, inv || '/equipe/' || u || '.jpg') then raise exception 'ÉCHEC : un témoin ne peut pas mettre sa photo'; end if;
    if mon_espace(c_temoin)->'moi'->>'photo' <> inv || '/equipe/' || u || '.jpg' then raise exception 'ÉCHEC : la photo n''est pas enregistrée'; end if;
    if not changer_photo(c_mariee, 'DJ', inv || '/equipe/' || u || '.jpg') then raise exception 'ÉCHEC : l''admin ne peut pas changer la photo du DJ'; end if;
    if mon_espace(c_dj)::text not like '%/equipe/%' then raise exception 'ÉCHEC : le DJ ne voit pas sa photo'; end if;
  end;

  -- 10. Le Wizz
  declare inv text; r jsonb; n int; wid bigint;
  begin
    select code into inv from codes where prenom = 'INVITES';
    if mon_espace(c_temoin)::text like '%' || c_dj || '%' then raise exception 'ÉCHEC : l''annuaire montre des codes'; end if;
    begin perform 1 from wizz; raise exception 'ÉCHEC : anon peut lire les wizz';
    exception when insufficient_privilege then null; end;
    begin perform envoyer_wizz(inv, '{DJ}', 'coucou'); raise exception 'ÉCHEC : le code invités peut envoyer un wizz';
    exception when raise_exception then if sqlerrm like 'ÉCHEC%' then raise; end if; end;
    n := envoyer_wizz(c_mariee, '{DJ}', 'Besoin de toi ici');
    if n <> 1 then raise exception 'ÉCHEC : le wizz au DJ devrait toucher 1 personne (%)', n; end if;
    n := envoyer_wizz(c_mariee, '{Team}', 'Photo de groupe !');
    if n <> 3 then raise exception 'ÉCHEC : le wizz à la Team devrait toucher 3 personnes, sans soi-même (%)', n; end if;
    if envoyer_wizz(c_mariee, '{}', 'x') <> 0 then raise exception 'ÉCHEC : un wizz sans destinataire part à tout le monde'; end if;
    r := mes_wizz(c_dj);
    if jsonb_array_length(r->'recus') <> 1 or r->'recus'->0->>'de' <> 'La mariée' then raise exception 'ÉCHEC : le DJ ne reçoit pas son wizz : %', r; end if;
    if jsonb_array_length(mes_wizz(c_temoin)->'recus') <> 1 then raise exception 'ÉCHEC : le témoin devrait avoir 1 wizz (Team)'; end if;
    wid := (r->'recus'->0->>'id')::bigint;
    if repondre_wizz(c_temoin, wid, 'pirate') then raise exception 'ÉCHEC : un témoin répond au wizz du DJ'; end if;
    if not repondre_wizz(c_dj, wid, 'J''arrive 🏃') then raise exception 'ÉCHEC : le DJ ne peut pas répondre'; end if;
    if jsonb_array_length(mes_wizz(c_dj)->'recus') <> 0 then raise exception 'ÉCHEC : le wizz reste affiché après réponse'; end if;
    if mes_wizz(c_mariee)->'reponses'->0->>'qui' <> 'DJ' then raise exception 'ÉCHEC : la mariée ne voit pas la réponse du DJ'; end if;
    if mes_wizz('faux') is not null then raise exception 'ÉCHEC : mes_wizz sans lien'; end if;
  end;

  -- 11. Notifications
  declare inv text;
  begin
    select code into inv from codes where prenom = 'INVITES';
    begin perform 1 from push_cfg; raise exception 'ÉCHEC : anon peut lire la clé privée des notifications';
    exception when insufficient_privilege then null; end;
    begin perform 1 from push_abonnes; raise exception 'ÉCHEC : anon peut lire les abonnés';
    exception when insufficient_privilege then null; end;
    if push_enregistrer(inv, '{"endpoint":"https://push.example/a","keys":{"p256dh":"x","auth":"y"}}') then raise exception 'ÉCHEC : le code invités s''abonne aux wizz'; end if;
    if push_enregistrer(c_dj, '{"endpoint":"http://pirate.example/a","keys":{"p256dh":"x","auth":"y"}}') then raise exception 'ÉCHEC : abonnement non https accepté'; end if;
    if push_enregistrer(c_dj, '{"endpoint":"https://push.example/a"}') then raise exception 'ÉCHEC : abonnement sans clés accepté'; end if;
    if not push_enregistrer(c_dj, '{"endpoint":"https://push.example/a","keys":{"p256dh":"x","auth":"y"}}') then raise exception 'ÉCHEC : le DJ ne peut pas s''abonner'; end if;
    if push_retirer(c_temoin, 'https://push.example/a') then raise exception 'ÉCHEC : un témoin désabonne le téléphone du DJ'; end if;
    -- Un wizz part même si le relais des notifications n'est pas joignable
    if envoyer_wizz(c_mariee, '{DJ}', 'Test notif') <> 1 then raise exception 'ÉCHEC : le wizz ne part plus avec les notifications'; end if;
    if not push_retirer(c_dj, 'https://push.example/a') then raise exception 'ÉCHEC : le DJ ne peut pas se désabonner'; end if;
  end;

  -- 12. Annonces, Moment, livre d'or, notifications des invités, rappels
  declare inv text; r jsonb; n int; uu text := gen_random_uuid()::text;
  begin
    select code into inv from codes where prenom = 'INVITES';
    begin perform envoyer_annonce(c_temoin, 'annonce', 'Pirate'); raise exception 'ÉCHEC : un témoin envoie une annonce';
    exception when raise_exception then if sqlerrm like 'ÉCHEC%' then raise; end if; end;
    begin perform envoyer_annonce(inv, 'annonce', 'Pirate'); raise exception 'ÉCHEC : le code invités envoie une annonce';
    exception when raise_exception then if sqlerrm like 'ÉCHEC%' then raise; end if; end;
    perform envoyer_annonce(c_mariee, 'annonce', 'Photo de groupe dehors');
    perform envoyer_annonce(c_mariee, 'moment', 'Entrée des mariés');
    r := infos_invites(inv);
    if jsonb_array_length(r->'annonces') <> 2 or r->'annonces'->0->>'type' <> 'moment' then raise exception 'ÉCHEC : les invités ne voient pas les annonces : %', r->'annonces'; end if;
    if jsonb_array_length(mon_espace(c_dj)->'annonces') <> 2 then raise exception 'ÉCHEC : l''équipe ne voit pas les annonces'; end if;
    perform live_poster(inv, 'Léa', 'photo', inv || '/' || uu || '.jpg', inv || '/' || uu || '-m.jpg');
    if not (live_fil(inv)::text like '%"moment": "Entrée des mariés"%') then raise exception 'ÉCHEC : la photo postée pendant le Moment n''est pas marquée'; end if;

    if push_invite_enregistrer('faux', '{"endpoint":"https://push.example/i","keys":{"p256dh":"x","auth":"y"}}', 'Léa') then raise exception 'ÉCHEC : abonnement invité sans code'; end if;
    if not push_invite_enregistrer(inv, '{"endpoint":"https://push.example/i","keys":{"p256dh":"x","auth":"y"}}', 'Léa') then raise exception 'ÉCHEC : un invité ne peut pas s''abonner'; end if;
    begin perform 1 from push_invites; raise exception 'ÉCHEC : anon lit les abonnés invités';
    exception when insufficient_privilege then null; end;

    if livre_or_ecrire('faux', 'Léa', 'Bravo') then raise exception 'ÉCHEC : livre d''or sans code'; end if;
    if not livre_or_ecrire(inv, 'Léa', 'Tous nos vœux ❤️') then raise exception 'ÉCHEC : un invité ne peut pas écrire dans le livre d''or'; end if;
    if livre_or_lire(c_temoin) is not null or livre_or_lire(inv) is not null then raise exception 'ÉCHEC : le livre d''or est lisible par un non-admin'; end if;
    if livre_or_lire(c_mariee)->0->>'texte' <> 'Tous nos vœux ❤️' then raise exception 'ÉCHEC : la mariée ne lit pas le livre d''or'; end if;
    begin perform 1 from livre_or; raise exception 'ÉCHEC : anon lit le livre d''or';
    exception when insufficient_privilege then null; end;
    begin perform envoyer_rappels(); raise exception 'ÉCHEC : anon lance les rappels';
    exception when insufficient_privilege then null; end;
  end;

  raise notice '✅ Base : tous les tests de sécurité passent';
end $$;
