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

alter table personnes enable row level security;
alter table moments   enable row level security;
alter table taches    enable row level security;
revoke all on personnes, moments, taches from anon, authenticated;

-- ---------------------------------------------------------------
-- 2. Qui voit quoi
-- ---------------------------------------------------------------

-- Est-ce que ce « pour » (liste de rôles ou de prénoms) concerne cette personne ?
create or replace function concerne(p_pour text[], p_role text, p_prenom text)
returns boolean language sql immutable as $$
  select cardinality(p_pour) = 0
      or exists (select 1 from unnest(p_pour) r
                 where lower(trim(r)) in (lower(p_role), lower(p_prenom), 'tous'));
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

    'moments', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.debut, x.id)
      from moments x
      where m.admin or concerne(x.pour, m.role, m.prenom)), '[]'::jsonb),

    'taches', coalesce((
      select jsonb_agg(
               jsonb_build_object('id', t.id, 'titre', t.titre, 'details', t.details, 'heure', t.heure,
                                  'fait', t.fait, 'fait_par', t.fait_par, 'fait_le', t.fait_le,
                                  'pour', coalesce(p.prenom, t.role))
               order by t.heure nulls last, t.id)
      from taches t left join personnes p on p.id = t.personne_id
      where m.admin
         or t.personne_id = m.id
         or (t.personne_id is null and lower(t.role) = lower(m.role))), '[]'::jsonb),

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
     and (m.admin or t.personne_id = m.id
          or (t.personne_id is null and lower(t.role) = lower(m.role)));
  get diagnostics n = row_count;
  return n > 0;
end $$;

revoke execute on function mon_espace(text), cocher(text, bigint, boolean) from public;
grant  execute on function mon_espace(text), cocher(text, bigint, boolean) to anon, authenticated;
