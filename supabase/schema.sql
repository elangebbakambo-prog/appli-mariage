-- Base de l'appli du mariage.
-- À coller UNE FOIS dans Supabase → SQL Editor → Run.
--
-- Sécurité : les tables sont fermées (RLS activé, aucune règle d'accès).
-- On ne peut lire ou modifier les données qu'avec deux fonctions qui demandent
-- le code perso de la personne : chacun ne voit que ce qui le concerne.

-- ---------------------------------------------------------------
-- 1. Les tables
-- ---------------------------------------------------------------

-- Une ligne par personne qui reçoit un lien (mariés, témoins, prestataires…)
create table if not exists personnes (
  id      uuid primary key default gen_random_uuid(),
  prenom  text not null,
  role    text not null,                 -- ex. « Témoin », « Garçon d'honneur », « DJ », « Traiteur »
  admin   boolean not null default false, -- true = voit et coche tout (mariés, Elange)
  tel     text,                          -- facultatif, pour envoyer le lien par WhatsApp
  code    text not null unique default left(replace(gen_random_uuid()::text, '-', ''), 12)
);

-- Le programme heure par heure
create table if not exists moments (
  id      bigint generated always as identity primary key,
  debut   time not null,
  fin     time,
  titre   text not null,
  lieu    text,
  details text,
  pour    text[] not null default '{}'   -- vide = tout le monde ; sinon des rôles ou des prénoms
);

-- Les tâches, données à une personne précise OU à tout un rôle
create table if not exists taches (
  id          bigint generated always as identity primary key,
  titre       text not null,
  details     text,
  heure       time,
  personne_id uuid references personnes(id) on delete cascade,
  role        text,                       -- utilisé si personne_id est vide
  fait        boolean not null default false,
  fait_par    text,
  fait_le     timestamptz
);

-- Ajouts (version 2) : groupes de personnes, jour des moments, sections des tâches
alter table personnes add column if not exists groupes text[] not null default '{}';  -- ex. {Team,Filles}
alter table moments   add column if not exists jour date not null default '2026-12-19';
alter table moments   add column if not exists public boolean not null default false; -- visible par les invités
alter table taches    add column if not exists section text;                          -- ex. « Vendredi · Salle principale »
alter table taches    add column if not exists pour text[] not null default '{}';     -- groupes ou prénoms

-- Les fiches (fiche DJ, bar et menu…) : texte simple, « ## » = titre, « - » = puce
create table if not exists fiches (
  id      bigint generated always as identity primary key,
  titre   text not null,
  icone   text,
  contenu text not null default '',
  pour    text[] not null default '{}',    -- vide = seulement les admins (sauf si public)
  public  boolean not null default false,  -- visible par les invités (QR code)
  ordre   int not null default 0
);

-- Le plan de table, pour « Trouve ta table »
create table if not exists plan_table (
  id       bigint generated always as identity primary key,
  nom      text not null,
  table_no int not null
);

-- Les numéros importants (prestataires, famille…) : boutons Appeler et WhatsApp dans l'appli.
-- « pour » vide = toute personne qui a un lien perso ; sinon seulement ces rôles / prénoms / groupes. Jamais les invités.
create table if not exists contacts (
  id      bigint generated always as identity primary key,
  section text not null default 'Important',
  nom     text not null,
  role    text,
  tel     text not null,
  pour    text[] not null default '{}',
  ordre   int not null default 0
);
alter table contacts enable row level security;
revoke all on contacts from anon, authenticated;

alter table personnes enable row level security;
alter table fiches     enable row level security;
alter table plan_table enable row level security;
revoke all on fiches, plan_table from anon, authenticated;
alter table moments   enable row level security;
alter table taches    enable row level security;
revoke all on personnes, moments, taches from anon, authenticated;

-- ---------------------------------------------------------------
-- 2. Qui voit quoi
-- ---------------------------------------------------------------

-- Est-ce que ce « pour » (liste de rôles, de prénoms ou de groupes) concerne cette personne ?
create or replace function concerne(p_pour text[], p_role text, p_prenom text, p_groupes text[])
returns boolean language sql immutable as $$
  select cardinality(p_pour) = 0
      or exists (select 1 from unnest(p_pour) r
                 where lower(trim(r)) in (lower(p_role), lower(p_prenom), 'tous')
                    or lower(trim(r)) in (select lower(g) from unnest(p_groupes) g));
$$;
create or replace function concerne(p_pour text[], p_role text, p_prenom text)
returns boolean language sql immutable as $$
  select concerne(p_pour, p_role, p_prenom, '{}'::text[]);
$$;

-- Une tâche est pour moi si elle porte mon nom, mon rôle, ou un de mes groupes (champ « pour »)
create or replace function tache_pour_moi(t taches, m personnes)
returns boolean language sql immutable as $$
  select t.personne_id = m.id
      or (t.personne_id is null and (
            (t.role is not null and lower(t.role) = lower(m.role))
         or (cardinality(t.pour) > 0 and concerne(t.pour, m.role, m.prenom, m.groupes))));
$$;

-- Tout ce qu'une personne a le droit de voir, à partir de son code
create or replace function mon_espace(p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare m personnes;
begin
  select * into m from personnes where code = p_code;
  if not found then return null; end if;

  return jsonb_build_object(
    'moi', jsonb_build_object('prenom', m.prenom, 'role', m.role, 'admin', m.admin, 'photo', m.photo),
    'ma_table', ma_table(m),
    'annonces', annonces_recentes(),
    'maintenant', now(),
    -- L'annuaire de l'équipe (sans les liens) : pour choisir à qui envoyer un wizz
    'annuaire', (select coalesce(jsonb_agg(jsonb_build_object('prenom', prenom, 'role', role, 'photo', photo, 'groupes', groupes)
                                           order by prenom), '[]'::jsonb) from personnes where id <> m.id),
    'invite', (select valeur from reglages where cle = 'code_invites'),

    'moments', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.jour, x.debut, x.id)
      from moments x
      where m.admin or concerne(x.pour, m.role, m.prenom, m.groupes)), '[]'::jsonb),

    'fiches', coalesce((
      select jsonb_agg(jsonb_build_object('id', f.id, 'titre', f.titre, 'icone', f.icone,
                                          'contenu', f.contenu, 'public', f.public)
                       order by f.ordre, f.id)
      from fiches f
      where m.admin or f.public or (cardinality(f.pour) > 0 and concerne(f.pour, m.role, m.prenom, m.groupes))), '[]'::jsonb),

    'taches', coalesce((
      select jsonb_agg(
               jsonb_build_object('id', t.id, 'titre', t.titre, 'details', t.details, 'heure', t.heure,
                                  'fait', t.fait, 'fait_par', t.fait_par, 'fait_le', t.fait_le,
                                  'section', t.section,
                                  'pour', coalesce(p.prenom, t.role, array_to_string(t.pour, ', ')))
               order by t.id)
      from taches t left join personnes p on p.id = t.personne_id
      where m.admin or tache_pour_moi(t, m)), '[]'::jsonb),

    -- Les numéros importants qui me concernent
    'contacts', coalesce((
      select jsonb_agg(jsonb_build_object('section', c.section, 'nom', c.nom, 'role', c.role, 'tel', c.tel) order by c.ordre, c.id)
      from contacts c where m.admin or concerne(c.pour, m.role, m.prenom, m.groupes)), '[]'::jsonb),

    -- La liste de l'équipe et des liens : seulement pour les admins
    'equipe', case when m.admin then (
      select jsonb_agg(jsonb_build_object('prenom', prenom, 'role', role, 'admin', admin,
                                          'tel', tel, 'code', code, 'photo', photo)
                       order by admin desc, role, prenom)
      from personnes) end
  );
end $$;

-- Cocher / décocher une tâche (seulement si elle nous concerne, ou si on est admin)
create or replace function cocher(p_code text, p_tache bigint, p_fait boolean)
returns boolean language plpgsql security definer set search_path = public as $$
declare m personnes; n int;
begin
  select * into m from personnes where code = p_code;
  if not found then return false; end if;

  update taches t
     set fait = p_fait,
         fait_par = case when p_fait then m.prenom end,
         fait_le  = case when p_fait then now() end
   where t.id = p_tache
     and (m.admin or tache_pour_moi(t, m));
  get diagnostics n = row_count;
  return n > 0;
end $$;

revoke execute on function mon_espace(text), cocher(text, bigint, boolean) from public;
grant  execute on function mon_espace(text), cocher(text, bigint, boolean) to anon, authenticated;

-- ===============================================================
-- 3. Le live des invités (stories photos et vidéos)
-- ===============================================================
-- Les invités entrent avec UN code commun (le QR code sur les tables).
-- Ce code est rangé ici, jamais dans le code de l'appli.

create table if not exists reglages (
  cle    text primary key,
  valeur text not null
);
insert into reglages (cle, valeur)
  values ('code_invites', left(replace(gen_random_uuid()::text, '-', ''), 10))
  on conflict (cle) do nothing;

create table if not exists posts (
  id        uuid primary key default gen_random_uuid(),
  auteur    text not null check (char_length(auteur) between 1 and 30),
  type      text not null check (type in ('photo', 'video')),
  fichier   text not null,                -- chemin dans le stockage « live »
  miniature text not null,                -- petite image pour le fil (économise la bande passante)
  texte     text check (char_length(texte) <= 200),
  cree_le   timestamptz not null default now(),
  maj       timestamptz not null default now(),
  cache     boolean not null default false -- masqué par un admin
);
create index if not exists posts_maj on posts (maj);

alter table reglages enable row level security;
alter table posts    enable row level security;
revoke all on reglages, posts from anon, authenticated;

-- Le bon code invités ? (sert aussi au stockage, pour accepter ou refuser un envoi)
create or replace function code_invites_ok(p_code text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from reglages where cle = 'code_invites' and valeur = p_code);
$$;

-- Le fil : seulement les posts modifiés depuis la dernière visite (petit et rapide)
create or replace function live_fil(p_code text, p_depuis timestamptz default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not code_invites_ok(p_code) then return null; end if;
  return jsonb_build_object(
    'maintenant', now(),
    'posts', coalesce((
      select jsonb_agg(case when p.cache then jsonb_build_object('id', p.id, 'cache', true)
                            else jsonb_build_object('id', p.id, 'auteur', p.auteur, 'type', p.type,
                                                    'fichier', p.fichier, 'miniature', p.miniature,
                                                    'texte', p.texte, 'cree_le', p.cree_le) end
                       order by p.cree_le)
      from posts p
      where (p_depuis is null and not p.cache) or p.maj > p_depuis), '[]'::jsonb));
end $$;

-- Publier un post (les fichiers ont déjà été envoyés dans le stockage)
create or replace function live_poster(p_code text, p_auteur text, p_type text,
                                       p_fichier text, p_miniature text, p_texte text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare forme text; n uuid;
begin
  if not code_invites_ok(p_code) then raise exception 'code invités incorrect'; end if;
  forme := '^' || p_code || '/[0-9a-f-]{36}';
  if p_fichier !~ (forme || '\.(jpg|mp4|webm|mov)$') or p_miniature !~ (forme || '-m\.jpg$') then
    raise exception 'fichier invalide';
  end if;
  -- Anti-spam : 15 posts maximum en 5 minutes pour un même prénom
  if (select count(*) from posts where auteur = trim(p_auteur) and cree_le > now() - interval '5 minutes') >= 15 then
    raise exception 'trop de posts, attends un peu';
  end if;
  insert into posts (auteur, type, fichier, miniature, texte)
    values (trim(p_auteur), p_type, p_fichier, p_miniature, nullif(trim(p_texte), ''))
    returning id into n;
  return n;
end $$;

-- Masquer / remontrer un post : seulement les admins (avec leur lien perso)
create or replace function live_cacher(p_code text, p_post uuid, p_cache boolean)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from personnes where code = p_code and admin) then return false; end if;
  update posts set cache = p_cache, maj = now() where id = p_post;
  return found;
end $$;

revoke execute on function code_invites_ok(text), live_fil(text, timestamptz),
  live_poster(text, text, text, text, text, text), live_cacher(text, uuid, boolean) from public;
grant execute on function code_invites_ok(text), live_fil(text, timestamptz),
  live_poster(text, text, text, text, text, text), live_cacher(text, uuid, boolean) to anon, authenticated;

-- Le stockage des photos et vidéos (seulement sur Supabase : ignoré ailleurs)
-- Public en lecture (les adresses sont impossibles à deviner), 20 Mo maximum par fichier.
-- Envoi accepté seulement dans le dossier du bon code invités ; pas de liste, pas de modification, pas de suppression.
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
      values ('live', 'live', true, 20971520, array['image/jpeg', 'video/mp4', 'video/webm', 'video/quicktime'])
      on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit,
                                     allowed_mime_types = excluded.allowed_mime_types;
    execute 'drop policy if exists "live : envoi avec le code invites" on storage.objects';
    execute 'create policy "live : envoi avec le code invites" on storage.objects for insert to anon, authenticated
             with check (bucket_id = ''live'' and public.code_invites_ok((storage.foldername(name))[1]))';
  end if;
end $$;

-- ===============================================================
-- 4. Pour les invités (QR code) : programme public, fiches publiques, « Trouve ta table »
-- ===============================================================

create or replace function infos_invites(p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not code_invites_ok(p_code) then return null; end if;
  return jsonb_build_object(
    'moments', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'jour', x.jour, 'debut', x.debut, 'fin', x.fin,
                                                             'titre', x.titre, 'lieu', x.lieu, 'details', x.details)
                                          order by x.jour, x.debut, x.id)
                         from moments x where x.public), '[]'::jsonb),
    'fiches', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'titre', f.titre, 'icone', f.icone, 'contenu', f.contenu)
                                         order by f.ordre, f.id)
                        from fiches f where f.public), '[]'::jsonb));
end $$;

-- Sans accents ni majuscules, pour chercher « chloe » et trouver « Chloé »
create or replace function sans_accent(t text)
returns text language sql immutable as $$
  select lower(translate(coalesce(t, ''), 'àâäáãéèêëíìîïóòôöõúùûüçñÀÂÄÁÃÉÈÊËÍÌÎÏÓÒÔÖÕÚÙÛÜÇÑ',
                                          'aaaaaeeeeiiiiooooouuuucnaaaaaeeeeiiiiooooouuuucn'));
$$;

-- On tape (au moins 2 lettres de) son prénom ou son nom : on reçoit sa table et ses voisins (8 réponses max)
create or replace function trouver_table(p_code text, p_nom text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare q text := sans_accent(trim(p_nom));
begin
  if not code_invites_ok(p_code) then return null; end if;
  if char_length(q) < 2 then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'nom', p.nom, 'table', p.table_no,
             'voisins', (select coalesce(jsonb_agg(v.nom order by v.id), '[]'::jsonb)
                         from plan_table v where v.table_no = p.table_no and v.id <> p.id))
           order by p.nom)
    from (select * from plan_table where sans_accent(nom) like '%' || q || '%' order by nom limit 8) p), '[]'::jsonb);
end $$;

revoke execute on function infos_invites(text), trouver_table(text, text) from public;
grant  execute on function infos_invites(text), trouver_table(text, text) to anon, authenticated;

-- ===============================================================
-- 5. Les places à table (dessin de la table) et les photos de l'équipe
-- ===============================================================

-- La forme de chaque table : « ronde », « rect » (rectangle, deux rangées face à face) ou « honneur »
create table if not exists les_tables (
  no    int primary key,
  nom   text,                                   -- ex. « Table d'honneur » (sinon « Table 3 »)
  forme text not null default 'ronde' check (forme in ('ronde', 'rect', 'honneur'))
);
alter table plan_table add column if not exists place int;   -- numéro de la place autour de la table
alter table personnes  add column if not exists nom_plan text; -- son nom tel qu'écrit dans le plan de table
alter table personnes  add column if not exists photo text;    -- chemin de sa photo dans le stockage « live »
alter table les_tables enable row level security;
revoke all on les_tables from anon, authenticated;

-- Une table complète : son nom, sa forme et les places dans l'ordre (usage interne)
create or replace function details_table(p_no int)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'table', p_no,
    'nom', coalesce(t.nom, 'Table ' || p_no),
    'forme', coalesce(t.forme, 'ronde'),
    'places', coalesce((
      select jsonb_agg(jsonb_build_object('place', v.rang, 'nom', v.nom) order by v.rang)
      from (select pt.nom, row_number() over (order by pt.place nulls last, pt.id) as rang
            from plan_table pt where pt.table_no = p_no) v), '[]'::jsonb))
  from (select 1) x left join les_tables t on t.no = p_no;
$$;
revoke execute on function details_table(int) from public, anon, authenticated;

-- « Trouve ta table » renvoie maintenant aussi le dessin de la table
create or replace function trouver_table(p_code text, p_nom text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare q text := sans_accent(trim(p_nom));
begin
  if not code_invites_ok(p_code) then return null; end if;
  if char_length(q) < 2 then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'nom', p.nom, 'table', p.table_no,
             'voisins', (select coalesce(jsonb_agg(v.nom order by v.place nulls last, v.id), '[]'::jsonb)
                         from plan_table v where v.table_no = p.table_no and v.id <> p.id),
             'detail', details_table(p.table_no))
           order by p.nom)
    from (select * from plan_table where sans_accent(nom) like '%' || q || '%' order by nom limit 8) p), '[]'::jsonb);
end $$;

-- Ma place à moi (pour ceux qui ont un lien perso et dont le nom est relié au plan de table)
create or replace function ma_table(m personnes)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('nom', p.nom, 'detail', details_table(p.table_no))
  from plan_table p where m.nom_plan is not null and p.nom = m.nom_plan limit 1;
$$;
revoke execute on function ma_table(personnes) from public, anon, authenticated;

-- Changer une photo : la sienne, ou celle de n'importe qui si on est admin.
-- La photo a déjà été envoyée dans le stockage, dans le dossier « <code invités>/equipe/ ».
create or replace function changer_photo(p_code text, p_prenom text, p_chemin text)
returns boolean language plpgsql security definer set search_path = public as $$
declare m personnes; inv text; n int;
begin
  select * into m from personnes where code = p_code;
  if not found then return false; end if;
  if p_prenom is not null and p_prenom <> m.prenom and not m.admin then return false; end if;
  select valeur into inv from reglages where cle = 'code_invites';
  if p_chemin is not null and p_chemin !~ ('^' || inv || '/equipe/[0-9a-f-]{36}\.jpg$') then return false; end if;
  update personnes set photo = p_chemin where prenom = coalesce(p_prenom, m.prenom);
  get diagnostics n = row_count;
  return n > 0;
end $$;
revoke execute on function changer_photo(text, text, text) from public;
grant  execute on function changer_photo(text, text, text) to anon, authenticated;

-- ===============================================================
-- 6. Le Wizz : biper quelqu'un de l'équipe (« Besoin de toi ici ! »)
-- ===============================================================
-- Un wizz = une ligne par destinataire. Il s'affiche (écran qui tremble) quand l'appli est ouverte.

create table if not exists wizz (
  id       bigint generated always as identity primary key,
  de       text not null,
  de_id    uuid references personnes(id) on delete cascade,
  pour_id  uuid not null references personnes(id) on delete cascade,
  message  text not null check (char_length(message) between 1 and 140),
  cree_le  timestamptz not null default now(),
  vu_le    timestamptz,
  reponse  text check (char_length(reponse) <= 40)
);
create index if not exists wizz_pour on wizz (pour_id, vu_le);
alter table wizz enable row level security;
revoke all on wizz from anon, authenticated;

-- Envoyer un wizz à des prénoms, des rôles ou des groupes (« Team », « Filles »…). Renvoie le nombre de personnes bipées.
create or replace function envoyer_wizz(p_code text, p_pour text[], p_message text)
returns int language plpgsql security definer set search_path = public as $$
declare m personnes; n int; msg text := left(trim(coalesce(p_message, '')), 140);
begin
  select * into m from personnes where code = p_code;
  if not found then raise exception 'lien inconnu'; end if;
  if msg = '' or cardinality(coalesce(p_pour, '{}')) = 0 then return 0; end if;
  -- Anti-spam : 40 wizz maximum en 2 minutes par personne
  if (select count(*) from wizz where de_id = m.id and cree_le > now() - interval '2 minutes') >= 40 then
    raise exception 'trop de wizz, attends un peu';
  end if;
  insert into wizz (de, de_id, pour_id, message)
    select m.prenom, m.id, p.id, msg from personnes p
    where p.id <> m.id and concerne(p_pour, p.role, p.prenom, p.groupes);
  get diagnostics n = row_count;
  return n;
end $$;

-- Mes wizz pas encore vus, et les réponses à mes wizz (des 3 dernières heures)
create or replace function mes_wizz(p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare m personnes;
begin
  select * into m from personnes where code = p_code;
  if not found then return null; end if;
  return jsonb_build_object(
    'recus', coalesce((select jsonb_agg(jsonb_build_object('id', w.id, 'de', w.de, 'photo', d.photo, 'message', w.message, 'cree_le', w.cree_le) order by w.cree_le)
                       from wizz w left join personnes d on d.id = w.de_id
                       where w.pour_id = m.id and w.vu_le is null and w.cree_le > now() - interval '3 hours'), '[]'::jsonb),
    'reponses', coalesce((select jsonb_agg(jsonb_build_object('id', w.id, 'qui', p.prenom, 'reponse', w.reponse, 'message', w.message) order by w.vu_le)
                          from wizz w join personnes p on p.id = w.pour_id
                          where w.de_id = m.id and w.reponse is not null and w.vu_le > now() - interval '3 hours'), '[]'::jsonb));
end $$;

-- Répondre à un wizz reçu (« J'arrive », « Pas dispo », « Vu »)
create or replace function repondre_wizz(p_code text, p_id bigint, p_reponse text)
returns boolean language plpgsql security definer set search_path = public as $$
declare m personnes; n int;
begin
  select * into m from personnes where code = p_code;
  if not found then return false; end if;
  update wizz set vu_le = coalesce(vu_le, now()), reponse = nullif(left(trim(coalesce(p_reponse, '')), 40), '')
   where id = p_id and pour_id = m.id;
  get diagnostics n = row_count;
  return n > 0;
end $$;

revoke execute on function envoyer_wizz(text, text[], text), mes_wizz(text), repondre_wizz(text, bigint, text) from public;
grant  execute on function envoyer_wizz(text, text[], text), mes_wizz(text), repondre_wizz(text, bigint, text) to anon, authenticated;

-- ===============================================================
-- 7. Les notifications (comme l'appli Vegas) : un wizz fait sonner le téléphone même verrouillé
-- ===============================================================
-- Chaque téléphone qui accepte les notifications est enregistré ici, relié à la personne.
-- À chaque nouveau wizz, la base appelle la fonction « vegas-push » (un simple relais qui ne garde rien)
-- avec les clés VAPID rangées dans push_cfg. La clé privée n'est JAMAIS sur GitHub : elle est dans donnees-mariage.sql.

do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then create extension if not exists pg_net; end if;
end $$;

create table if not exists push_abonnes (
  endpoint    text primary key,
  personne_id uuid not null references personnes(id) on delete cascade,
  sub         jsonb not null,
  maj         timestamptz not null default now()
);
create table if not exists push_cfg (
  id      int primary key default 1 check (id = 1),
  url     text not null,     -- adresse du relais (fonction vegas-push)
  pub     text not null,     -- clé publique VAPID (aussi dans config.js)
  priv    text not null,     -- clé privée VAPID : SECRÈTE
  subject text not null
);
alter table push_abonnes enable row level security;
alter table push_cfg     enable row level security;
revoke all on push_abonnes, push_cfg from anon, authenticated;

-- Enregistrer le téléphone de quelqu'un (avec son lien perso)
create or replace function push_enregistrer(p_code text, p_sub jsonb)
returns boolean language plpgsql security definer set search_path = public as $$
declare m personnes; ep text := p_sub->>'endpoint';
begin
  select * into m from personnes where code = p_code;
  if not found then return false; end if;
  if ep is null or ep !~ '^https://' or char_length(ep) > 1000 or char_length(p_sub::text) > 4000
     or coalesce(p_sub->'keys'->>'p256dh', '') = '' or coalesce(p_sub->'keys'->>'auth', '') = '' then return false; end if;
  insert into push_abonnes (endpoint, personne_id, sub) values (ep, m.id, p_sub)
    on conflict (endpoint) do update set personne_id = excluded.personne_id, sub = excluded.sub, maj = now();
  return true;
end $$;

create or replace function push_retirer(p_code text, p_endpoint text)
returns boolean language plpgsql security definer set search_path = public as $$
declare m personnes; n int;
begin
  select * into m from personnes where code = p_code;
  if not found then return false; end if;
  delete from push_abonnes where endpoint = p_endpoint and personne_id = m.id;
  get diagnostics n = row_count;
  return n > 0;
end $$;

revoke execute on function push_enregistrer(text, jsonb), push_retirer(text, text) from public;
grant  execute on function push_enregistrer(text, jsonb), push_retirer(text, text) to anon, authenticated;

-- À chaque nouveau wizz : notifier les téléphones du destinataire
create or replace function wizz_notifier()
returns trigger language plpgsql security definer set search_path = public as $$
declare cfg push_cfg; abonnes jsonb;
begin
  select * into cfg from push_cfg where id = 1;
  if not found then return new; end if;
  select coalesce(jsonb_agg(sub), '[]'::jsonb) into abonnes from push_abonnes where personne_id = new.pour_id;
  if jsonb_array_length(abonnes) = 0 then return new; end if;
  perform net.http_post(
    url := cfg.url,
    body := jsonb_build_object(
      'vapid', jsonb_build_object('pub', cfg.pub, 'priv', cfg.priv, 'subject', cfg.subject),
      'subs', abonnes, 'urgency', 'high',
      'payload', jsonb_build_object('title', '⚡ WIZZ de ' || new.de, 'body', new.message, 'tag', 'wizz-' || new.id, 'url', cfg.subject)),
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 10000);
  return new;
exception when others then
  return new;   -- une notification ratée ne doit jamais empêcher le wizz
end $$;
revoke execute on function wizz_notifier() from public, anon, authenticated;

drop trigger if exists wizz_notif on wizz;
create trigger wizz_notif after insert on wizz for each row execute function wizz_notifier();

-- ===============================================================
-- 8. Annonces, « Moment ! », rappels automatiques, notifications des invités, livre d'or
-- ===============================================================

insert into reglages (cle, valeur) values ('jour_j', '2026-12-19') on conflict (cle) do nothing;

-- Envoyer une notification à une liste de téléphones (par paquets de 150). Ne plante jamais.
create or replace function notifier(p_subs jsonb, p_titre text, p_corps text, p_tag text, p_urgent boolean default true)
returns void language plpgsql security definer set search_path = public as $$
declare cfg push_cfg; n int; i int := 0;
begin
  select * into cfg from push_cfg where id = 1;
  if not found or p_subs is null then return; end if;
  n := jsonb_array_length(p_subs);
  while i < n loop
    perform net.http_post(
      url := cfg.url,
      body := jsonb_build_object(
        'vapid', jsonb_build_object('pub', cfg.pub, 'priv', cfg.priv, 'subject', cfg.subject),
        'subs', (select jsonb_agg(x) from (select x from jsonb_array_elements(p_subs) with ordinality t(x, k) where k > i and k <= i + 150) s),
        'urgency', case when p_urgent then 'high' else 'normal' end,
        'payload', jsonb_build_object('title', p_titre, 'body', coalesce(p_corps, ''), 'tag', p_tag, 'url', cfg.subject)),
      headers := '{"Content-Type": "application/json"}'::jsonb,
      timeout_milliseconds := 10000);
    i := i + 150;
  end loop;
exception when others then
  return;
end $$;
revoke execute on function notifier(jsonb, text, text, text, boolean) from public, anon, authenticated;

-- Le wizz passe maintenant par notifier()
create or replace function wizz_notifier()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform notifier((select jsonb_agg(sub) from push_abonnes where personne_id = new.pour_id),
                   '⚡ WIZZ de ' || new.de, new.message, 'wizz-' || new.id, true);
  return new;
exception when others then
  return new;
end $$;
revoke execute on function wizz_notifier() from public, anon, authenticated;

create or replace function est_admin(p_code text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from personnes where code = p_code and admin);
$$;
revoke execute on function est_admin(text) from public, anon, authenticated;

-- Téléphones des invités (QR code) qui acceptent les notifications des annonces
create table if not exists push_invites (
  endpoint text primary key,
  prenom   text,
  sub      jsonb not null,
  maj      timestamptz not null default now()
);
-- Annonces (« Photo de groupe dehors dans 5 min ») et Moments (« 2 min pour poster ! »)
create table if not exists annonces (
  id      bigint generated always as identity primary key,
  type    text not null check (type in ('annonce', 'moment')),
  texte   text not null check (char_length(texte) between 1 and 140),
  de      text,
  cree_le timestamptz not null default now(),
  fin     timestamptz                       -- fin du Moment (2 min)
);
alter table posts add column if not exists moment text;  -- le Moment pendant lequel la photo a été postée
-- Livre d'or : les mots des invités, que seuls les mariés (admins) lisent
create table if not exists livre_or (
  id      bigint generated always as identity primary key,
  auteur  text not null check (char_length(auteur) between 1 and 30),
  texte   text not null check (char_length(texte) between 1 and 1000),
  cree_le timestamptz not null default now()
);
create table if not exists rappels_envoyes (cle text primary key, envoye_le timestamptz not null default now());

alter table push_invites    enable row level security;
alter table annonces        enable row level security;
alter table livre_or        enable row level security;
alter table rappels_envoyes enable row level security;
revoke all on push_invites, annonces, livre_or, rappels_envoyes from anon, authenticated;

create or replace function push_invite_enregistrer(p_invite text, p_sub jsonb, p_prenom text)
returns boolean language plpgsql security definer set search_path = public as $$
declare ep text := p_sub->>'endpoint';
begin
  if not code_invites_ok(p_invite) then return false; end if;
  if ep is null or ep !~ '^https://' or char_length(ep) > 1000 or char_length(p_sub::text) > 4000
     or coalesce(p_sub->'keys'->>'p256dh', '') = '' or coalesce(p_sub->'keys'->>'auth', '') = '' then return false; end if;
  insert into push_invites (endpoint, prenom, sub) values (ep, left(trim(coalesce(p_prenom, '')), 30), p_sub)
    on conflict (endpoint) do update set prenom = excluded.prenom, sub = excluded.sub, maj = now();
  return true;
end $$;

-- Les annonces récentes (6 h), pour les bandeaux dans l'appli
create or replace function annonces_recentes()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'type', type, 'texte', texte, 'de', de, 'cree_le', cree_le, 'fin', fin) order by id desc), '[]'::jsonb)
  from (select * from annonces where cree_le > now() - interval '6 hours' order by id desc limit 5) a;
$$;
revoke execute on function annonces_recentes() from public, anon, authenticated;

-- Envoyer une annonce ou lancer un Moment : seulement les admins. Tout le monde est notifié (équipe et invités).
create or replace function envoyer_annonce(p_code text, p_type text, p_texte text)
returns int language plpgsql security definer set search_path = public as $$
declare m personnes; t text := left(trim(coalesce(p_texte, '')), 140); a annonces; subs jsonb;
begin
  select * into m from personnes where code = p_code and admin;
  if not found then raise exception 'réservé aux mariés'; end if;
  if p_type not in ('annonce', 'moment') then raise exception 'type inconnu'; end if;
  if t = '' then t := case when p_type = 'moment' then 'Moment !' else '' end; end if;
  if t = '' then return 0; end if;
  if (select count(*) from annonces where cree_le > now() - interval '1 minute') >= 5 then raise exception 'trop d''annonces, attends un peu'; end if;
  insert into annonces (type, texte, de, fin) values (p_type, t, m.prenom, case when p_type = 'moment' then now() + interval '2 minutes' end)
    returning * into a;
  select coalesce(jsonb_agg(sub), '[]'::jsonb) into subs from (
    select sub from push_abonnes where personne_id <> m.id union all select sub from push_invites) s;
  perform notifier(subs,
    case when p_type = 'moment' then '⚡ MOMENT : ' || t else '📣 ' || t end,
    case when p_type = 'moment' then '2 minutes pour poster ta photo ou ta vidéo sur le live !' else 'Annonce de ' || m.prenom end,
    'annonce-' || a.id, true);
  return jsonb_array_length(subs);
end $$;

-- Livre d'or
create or replace function livre_or_ecrire(p_invite text, p_auteur text, p_texte text)
returns boolean language plpgsql security definer set search_path = public as $$
declare au text := left(trim(coalesce(p_auteur, '')), 30); tx text := left(trim(coalesce(p_texte, '')), 1000);
begin
  if not code_invites_ok(p_invite) or au = '' or tx = '' then return false; end if;
  if (select count(*) from livre_or where auteur = au and cree_le > now() - interval '10 minutes') >= 3 then raise exception 'trop de messages, attends un peu'; end if;
  insert into livre_or (auteur, texte) values (au, tx);
  return true;
end $$;
create or replace function livre_or_lire(p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not est_admin(p_code) then return null; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('auteur', auteur, 'texte', texte, 'cree_le', cree_le) order by id) from livre_or), '[]'::jsonb);
end $$;

-- Les rappels automatiques : 10 min avant chaque moment ou tâche, la personne concernée reçoit une notification.
-- Lancé chaque minute par pg_cron (voir plus bas). Chaque rappel n'est envoyé qu'une fois.
create or replace function envoyer_rappels()
returns int language plpgsql security definer set search_path = public as $$
declare maintenant timestamp := now() at time zone 'Europe/Paris'; jj date; r record; n int := 0;
begin
  select valeur::date into jj from reglages where cle = 'jour_j';
  for r in
    select 'm' || x.id as cle, '⏰ Dans 10 min : ' || x.titre as titre, coalesce(x.lieu, '') as corps,
           (select jsonb_agg(pa.sub) from push_abonnes pa join personnes p on p.id = pa.personne_id
             where concerne(x.pour, p.role, p.prenom, p.groupes)) as subs
    from moments x
    where cardinality(x.pour) > 0 and (x.jour + x.debut) > maintenant and (x.jour + x.debut) <= maintenant + interval '10 minutes'
    union all
    select 't' || t.id, '⏰ Dans 10 min : ' || t.titre, coalesce(t.details, ''),
           (select jsonb_agg(pa.sub) from push_abonnes pa where pa.personne_id = t.personne_id)
    from taches t
    where t.personne_id is not null and t.heure is not null and not t.fait and jj is not null
      and (jj + t.heure) > maintenant and (jj + t.heure) <= maintenant + interval '10 minutes'
  loop
    if exists (select 1 from rappels_envoyes where cle = r.cle) then continue; end if;
    insert into rappels_envoyes (cle) values (r.cle);
    n := n + 1;
    if r.subs is not null then perform notifier(r.subs, r.titre, r.corps, 'rappel-' || r.cle, true); end if;
  end loop;
  return n;
end $$;
revoke execute on function envoyer_rappels() from public, anon, authenticated;

do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('rappels-mariage', '* * * * *', 'select public.envoyer_rappels()');
  end if;
exception when others then
  raise notice 'Rappels : active « Cron » dans Supabase (Integrations), puis relance ce fichier. (%)', sqlerrm;
end $$;

revoke execute on function push_invite_enregistrer(text, jsonb, text), envoyer_annonce(text, text, text),
  livre_or_ecrire(text, text, text), livre_or_lire(text) from public;
grant  execute on function push_invite_enregistrer(text, jsonb, text), envoyer_annonce(text, text, text),
  livre_or_ecrire(text, text, text), livre_or_lire(text) to anon, authenticated;

-- Les annonces s'affichent aussi dans l'appli : on les ajoute aux réponses de mon_espace et infos_invites
create or replace function infos_invites(p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not code_invites_ok(p_code) then return null; end if;
  return jsonb_build_object(
    'moments', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'jour', x.jour, 'debut', x.debut, 'fin', x.fin,
                                                             'titre', x.titre, 'lieu', x.lieu, 'details', x.details)
                                          order by x.jour, x.debut, x.id)
                         from moments x where x.public), '[]'::jsonb),
    'fiches', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'titre', f.titre, 'icone', f.icone, 'contenu', f.contenu)
                                         order by f.ordre, f.id)
                        from fiches f where f.public), '[]'::jsonb),
    'annonces', annonces_recentes(),
    'maintenant', now());
end $$;

-- Une photo postée pendant un Moment est marquée avec son nom
create or replace function marquer_moment()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  select texte into new.moment from annonces where type = 'moment' and now() between cree_le and fin + interval '30 seconds' order by id desc limit 1;
  return new;
end $$;
revoke execute on function marquer_moment() from public, anon, authenticated;
drop trigger if exists posts_moment on posts;
create trigger posts_moment before insert on posts for each row execute function marquer_moment();

create or replace function live_fil(p_code text, p_depuis timestamptz default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not code_invites_ok(p_code) then return null; end if;
  return jsonb_build_object(
    'maintenant', now(),
    'posts', coalesce((
      select jsonb_agg(case when p.cache then jsonb_build_object('id', p.id, 'cache', true)
                            else jsonb_build_object('id', p.id, 'auteur', p.auteur, 'type', p.type,
                                                    'fichier', p.fichier, 'miniature', p.miniature,
                                                    'texte', p.texte, 'cree_le', p.cree_le, 'moment', p.moment) end
                       order by p.cree_le)
      from posts p
      where (p_depuis is null and not p.cache) or p.maj > p_depuis), '[]'::jsonb));
end $$;
