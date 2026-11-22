reset role;
-- Test des rappels (en tant que propriétaire) : un moment dans 5 min, un autre dans 30 min
insert into moments (jour, debut, titre, pour) values
  ((now() at time zone 'Europe/Paris')::date, ((now() at time zone 'Europe/Paris') + interval '5 minutes')::time, 'Discours test', '{Team}'),
  ((now() at time zone 'Europe/Paris')::date, ((now() at time zone 'Europe/Paris') + interval '30 minutes')::time, 'Trop tard', '{Team}');
do $$ declare n int; begin
  if ((now() at time zone 'Europe/Paris') + interval '5 minutes')::date <> (now() at time zone 'Europe/Paris')::date then raise notice 'rappels : test sauté (minuit)'; return; end if;
  n := envoyer_rappels(); if n <> 1 then raise exception 'ÉCHEC : 1 rappel attendu, % envoyés', n; end if;
  n := envoyer_rappels(); if n <> 0 then raise exception 'ÉCHEC : le rappel est renvoyé deux fois'; end if;
  raise notice '✅ Rappels OK';
end $$;
