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
    'moi', jsonb_build_object('prenom', m.prenom, 'role', m.role, 'admin', m.admin),
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

    -- La liste de l'équipe et des liens : seulement pour les admins
    'equipe', case when m.admin then (
      select jsonb_agg(jsonb_build_object('prenom', prenom, 'role', role, 'admin', admin,
                                          'tel', tel, 'code', code)
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
