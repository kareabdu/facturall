-- =============================================================================
-- FacturAll — Socle multi-entreprises / multi-boutiques
--
-- Contenu :
--   • profils (1 par utilisateur Supabase Auth)
--   • entreprises, boutiques
--   • membres (rôle par entreprise) et membres_boutiques (accès restreint)
--   • invitations par e-mail
--   • fonctions d'aide à la sécurité dans le schéma « prive » (non exposé)
--   • RLS sur toutes les tables
--   • fonctions RPC : creer_entreprise, mes_entreprises, membres_entreprise,
--     inviter_membre, accepter_invitations, modifier_membre
--
-- Règles de conception :
--   • Chaque table métier porte entreprise_id ; la RLS isole les entreprises.
--   • Pas de suppression d'entreprise ni de boutique depuis l'API : les données
--     comptables doivent être conservées (archivage OHADA). On désactive.
--   • Une entreprise a toujours au moins un propriétaire actif.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Schéma privé pour les fonctions de sécurité (non exposé par l'API Data)
-- -----------------------------------------------------------------------------
create schema if not exists prive;
revoke all on schema prive from public, anon;
grant usage on schema prive to authenticated;

-- -----------------------------------------------------------------------------
-- Types
-- -----------------------------------------------------------------------------
create type public.role_membre as enum (
  'proprietaire',
  'admin',
  'comptable',
  'gestionnaire',
  'vendeur',
  'lecteur'
);

-- -----------------------------------------------------------------------------
-- Utilitaire : updated_at
-- -----------------------------------------------------------------------------
create or replace function prive.maj_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Profils
-- -----------------------------------------------------------------------------
create table public.profils (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text,
  nom_complet text check (nom_complet is null or length(nom_complet) <= 120),
  telephone   text check (telephone is null or length(telephone) <= 30),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.profils is 'Profil public d''un utilisateur (1–1 avec auth.users).';

create trigger profils_updated_at
  before update on public.profils
  for each row execute function prive.maj_updated_at();

-- Création automatique du profil à l'inscription
create or replace function prive.creer_profil()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profils (id, email, nom_complet)
  values (
    new.id,
    lower(new.email),
    nullif(trim(new.raw_user_meta_data ->> 'nom_complet'), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Le service d'authentification exécute ces triggers : il doit voir le schéma privé.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    grant usage on schema prive to supabase_auth_admin;
  end if;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function prive.creer_profil();

-- Synchronisation de l'e-mail si l'utilisateur le change
create or replace function prive.synchroniser_email_profil()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is distinct from old.email then
    update public.profils set email = lower(new.email) where id = new.id;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_email_updated
  after update of email on auth.users
  for each row execute function prive.synchroniser_email_profil();

-- -----------------------------------------------------------------------------
-- Entreprises
-- -----------------------------------------------------------------------------
create table public.entreprises (
  id                 uuid primary key default gen_random_uuid(),
  raison_sociale     text not null check (length(trim(raison_sociale)) between 2 and 200),
  sigle              text check (sigle is null or length(sigle) <= 30),
  forme_juridique    text check (forme_juridique is null or length(forme_juridique) <= 30),
  -- Zone UEMOA (XOF). À élargir si l'on ouvre la CEMAC (XAF).
  pays               char(2) not null
                     constraint entreprises_pays_check
                     check (pays in ('BJ', 'BF', 'CI', 'GW', 'ML', 'NE', 'SN', 'TG')),
  ville              text check (ville is null or length(ville) <= 100),
  adresse            text check (adresse is null or length(adresse) <= 300),
  telephone          text check (telephone is null or length(telephone) <= 30),
  email              text check (email is null or length(email) <= 200),
  rccm               text check (rccm is null or length(rccm) <= 50),
  -- NINEA (SN), NCC (CI), IFU (BJ, BF), NIF…
  identifiant_fiscal text check (identifiant_fiscal is null or length(identifiant_fiscal) <= 50),
  devise             char(3) not null default 'XOF' check (devise = 'XOF'),
  -- Système comptable SYSCOHADA révisé : normal, ou système minimal de trésorerie
  systeme_comptable  text not null default 'normal' check (systeme_comptable in ('normal', 'smt')),
  -- Interface : saisie simplifiée (recettes/dépenses) ou avancée (écritures)
  mode_comptable     text not null default 'simplifie' check (mode_comptable in ('simplifie', 'avance')),
  created_by         uuid references auth.users (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on table public.entreprises is 'Entité juridique tenant sa propre comptabilité (locataire).';

create trigger entreprises_updated_at
  before update on public.entreprises
  for each row execute function prive.maj_updated_at();

-- -----------------------------------------------------------------------------
-- Boutiques (points de vente / établissements)
-- -----------------------------------------------------------------------------
create table public.boutiques (
  id             uuid primary key default gen_random_uuid(),
  entreprise_id  uuid not null references public.entreprises (id) on delete cascade,
  code           text not null check (code ~ '^[A-Z0-9-]{2,10}$'),
  nom            text not null check (length(trim(nom)) between 2 and 120),
  ville          text check (ville is null or length(ville) <= 100),
  adresse        text check (adresse is null or length(adresse) <= 300),
  telephone      text check (telephone is null or length(telephone) <= 30),
  est_principale boolean not null default false,
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (entreprise_id, code),
  -- Permet des clés étrangères composites garantissant la même entreprise
  unique (id, entreprise_id),
  constraint boutiques_principale_active check (not est_principale or active)
);

create unique index boutiques_une_principale
  on public.boutiques (entreprise_id)
  where est_principale;

create index boutiques_entreprise_idx on public.boutiques (entreprise_id);

create trigger boutiques_updated_at
  before update on public.boutiques
  for each row execute function prive.maj_updated_at();

-- -----------------------------------------------------------------------------
-- Membres
-- -----------------------------------------------------------------------------
create table public.membres (
  id               uuid primary key default gen_random_uuid(),
  entreprise_id    uuid not null references public.entreprises (id) on delete cascade,
  user_id          uuid not null references auth.users (id) on delete cascade,
  role             public.role_membre not null,
  -- false = accès limité aux boutiques listées dans membres_boutiques
  toutes_boutiques boolean not null default true,
  actif            boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (entreprise_id, user_id),
  unique (id, entreprise_id)
);

create index membres_user_idx on public.membres (user_id) where actif;

create trigger membres_updated_at
  before update on public.membres
  for each row execute function prive.maj_updated_at();

create table public.membres_boutiques (
  membre_id     uuid not null,
  boutique_id   uuid not null,
  entreprise_id uuid not null,
  created_at    timestamptz not null default now(),
  primary key (membre_id, boutique_id),
  foreign key (membre_id, entreprise_id)
    references public.membres (id, entreprise_id) on delete cascade,
  foreign key (boutique_id, entreprise_id)
    references public.boutiques (id, entreprise_id) on delete cascade
);

create index membres_boutiques_boutique_idx on public.membres_boutiques (boutique_id);

-- -----------------------------------------------------------------------------
-- Invitations
-- -----------------------------------------------------------------------------
create table public.invitations (
  id               uuid primary key default gen_random_uuid(),
  entreprise_id    uuid not null references public.entreprises (id) on delete cascade,
  email            text not null check (email = lower(trim(email)) and email like '%_@_%'),
  role             public.role_membre not null,
  toutes_boutiques boolean not null default true,
  boutique_ids     uuid[] not null default '{}',
  invite_par       uuid references auth.users (id) on delete set null,
  expire_le        timestamptz not null default now() + interval '14 days',
  acceptee_le      timestamptz,
  created_at       timestamptz not null default now()
);

-- Une seule invitation en attente par e-mail et par entreprise
create unique index invitations_en_attente_unique
  on public.invitations (entreprise_id, email)
  where acceptee_le is null;

create index invitations_email_idx on public.invitations (email) where acceptee_le is null;

-- =============================================================================
-- Fonctions de sécurité (utilisées par la RLS)
-- SECURITY DEFINER pour éviter la récursion RLS sur « membres ».
-- =============================================================================

create or replace function prive.est_membre(p_entreprise_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.membres m
    where m.entreprise_id = p_entreprise_id
      and m.user_id = (select auth.uid())
      and m.actif
  );
$$;

create or replace function prive.a_role(p_entreprise_id uuid, p_roles public.role_membre[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.membres m
    where m.entreprise_id = p_entreprise_id
      and m.user_id = (select auth.uid())
      and m.actif
      and m.role = any (p_roles)
  );
$$;

create or replace function prive.est_admin(p_entreprise_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select prive.a_role(p_entreprise_id, array['proprietaire', 'admin']::public.role_membre[]);
$$;

-- Accès à une boutique : propriétaire/admin, membre « toutes boutiques »,
-- ou boutique explicitement attribuée. Ne relit pas la table boutiques
-- (sinon une boutique tout juste insérée serait invisible dans RETURNING).
create or replace function prive.peut_acceder_boutique(p_boutique_id uuid, p_entreprise_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.membres m
    where m.entreprise_id = p_entreprise_id
      and m.user_id = (select auth.uid())
      and m.actif
      and (
        m.toutes_boutiques
        or m.role in ('proprietaire', 'admin')
        or exists (
          select 1 from public.membres_boutiques mb
          where mb.membre_id = m.id and mb.boutique_id = p_boutique_id
        )
      )
  );
$$;

-- Deux utilisateurs partagent-ils une entreprise ? (visibilité des profils)
create or replace function prive.partage_entreprise(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.membres moi
    join public.membres autre
      on autre.entreprise_id = moi.entreprise_id
    where moi.user_id = (select auth.uid())
      and moi.actif
      and autre.user_id = p_user_id
  );
$$;

revoke all on all functions in schema prive from public, anon;
grant execute on function
  prive.est_membre(uuid),
  prive.a_role(uuid, public.role_membre[]),
  prive.est_admin(uuid),
  prive.peut_acceder_boutique(uuid, uuid),
  prive.partage_entreprise(uuid)
to authenticated;

-- =============================================================================
-- Garde-fous sur les membres (triggers)
-- =============================================================================

-- Seul un propriétaire peut créer, modifier ou retirer un propriétaire,
-- et l'entreprise doit toujours garder au moins un propriétaire actif.
create or replace function prive.proteger_proprietaires()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entreprise uuid := coalesce(new.entreprise_id, old.entreprise_id);
  v_touche_proprietaire boolean;
  v_reste integer;
begin
  -- Opérations système (service_role, tableau de bord, suppression d'un compte en cascade)
  -- et fonctions internes (creer_entreprise, accepter_invitations) : pas de contrôle.
  if (select auth.uid()) is null
     or coalesce(current_setting('facturall.bypass_membres', true), '') = 'on' then
    return coalesce(new, old);
  end if;

  if tg_op = 'UPDATE' and (new.entreprise_id <> old.entreprise_id or new.user_id <> old.user_id) then
    raise exception 'Impossible de déplacer un membre vers une autre entreprise ou un autre utilisateur.'
      using errcode = '42501';
  end if;

  v_touche_proprietaire :=
       (tg_op in ('UPDATE', 'DELETE') and old.role = 'proprietaire')
    or (tg_op in ('INSERT', 'UPDATE') and new.role = 'proprietaire');

  if v_touche_proprietaire
     and not prive.a_role(v_entreprise, array['proprietaire']::public.role_membre[]) then
    raise exception 'Seul un propriétaire peut gérer les propriétaires.'
      using errcode = '42501';
  end if;

  if tg_op in ('UPDATE', 'DELETE') and old.role = 'proprietaire' and old.actif then
    select count(*) into v_reste
    from public.membres m
    where m.entreprise_id = v_entreprise
      and m.role = 'proprietaire'
      and m.actif
      and m.id <> old.id;

    if v_reste = 0 and (tg_op = 'DELETE' or new.role <> 'proprietaire' or not new.actif) then
      raise exception 'L''entreprise doit conserver au moins un propriétaire actif.'
        using errcode = '23514';
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

create trigger membres_proteger_proprietaires
  before insert or update or delete on public.membres
  for each row execute function prive.proteger_proprietaires();

-- =============================================================================
-- Row Level Security
-- =============================================================================

alter table public.profils           enable row level security;
alter table public.entreprises       enable row level security;
alter table public.boutiques         enable row level security;
alter table public.membres           enable row level security;
alter table public.membres_boutiques enable row level security;
alter table public.invitations       enable row level security;

-- Supabase accorde par défaut tous les droits à anon et authenticated :
-- on repart de zéro, puis on n'accorde que le nécessaire (la RLS filtre ensuite les lignes).
revoke all on public.profils, public.entreprises, public.boutiques,
  public.membres, public.membres_boutiques, public.invitations from anon, authenticated;

grant select, update on public.profils to authenticated;
grant select, update on public.entreprises to authenticated;
grant select, insert, update on public.boutiques to authenticated;
grant select, update, delete on public.membres to authenticated;
grant select, insert, delete on public.membres_boutiques to authenticated;
grant select, delete on public.invitations to authenticated;

-- ---- profils ---------------------------------------------------------------
create policy "profils : lecture de soi et des collègues"
  on public.profils for select to authenticated
  using (id = (select auth.uid()) or prive.partage_entreprise(id));

create policy "profils : modification de soi"
  on public.profils for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- L'e-mail du profil est piloté par auth.users : on interdit sa modification directe.
revoke update on public.profils from authenticated;
grant update (nom_complet, telephone) on public.profils to authenticated;

-- ---- entreprises -----------------------------------------------------------
-- Création uniquement via creer_entreprise() ; pas de suppression par l'API.
create policy "entreprises : lecture par les membres"
  on public.entreprises for select to authenticated
  using (prive.est_membre(id));

create policy "entreprises : modification par les admins"
  on public.entreprises for update to authenticated
  using (prive.est_admin(id))
  with check (prive.est_admin(id));

revoke update on public.entreprises from authenticated;
grant update (raison_sociale, sigle, forme_juridique, ville, adresse, telephone, email,
              rccm, identifiant_fiscal, systeme_comptable, mode_comptable)
  on public.entreprises to authenticated;

-- ---- boutiques -------------------------------------------------------------
create policy "boutiques : lecture selon les accès"
  on public.boutiques for select to authenticated
  using (prive.peut_acceder_boutique(id, entreprise_id));

create policy "boutiques : création par les admins"
  on public.boutiques for insert to authenticated
  with check (prive.est_admin(entreprise_id) and not est_principale);

create policy "boutiques : modification par les admins"
  on public.boutiques for update to authenticated
  using (prive.est_admin(entreprise_id))
  with check (prive.est_admin(entreprise_id));

-- entreprise_id et est_principale ne sont pas modifiables depuis l'API
revoke update on public.boutiques from authenticated;
grant update (code, nom, ville, adresse, telephone, active) on public.boutiques to authenticated;

-- ---- membres ---------------------------------------------------------------
-- Ajout uniquement via invitation (accepter_invitations) ou creer_entreprise.
create policy "membres : lecture par les membres"
  on public.membres for select to authenticated
  using (prive.est_membre(entreprise_id));

create policy "membres : modification par les admins"
  on public.membres for update to authenticated
  using (prive.est_admin(entreprise_id))
  with check (prive.est_admin(entreprise_id));

create policy "membres : retrait par les admins ou départ volontaire"
  on public.membres for delete to authenticated
  using (prive.est_admin(entreprise_id) or user_id = (select auth.uid()));

revoke update on public.membres from authenticated;
grant update (role, toutes_boutiques, actif) on public.membres to authenticated;

-- ---- membres_boutiques -----------------------------------------------------
create policy "membres_boutiques : lecture par les membres"
  on public.membres_boutiques for select to authenticated
  using (prive.est_membre(entreprise_id));

create policy "membres_boutiques : ajout par les admins"
  on public.membres_boutiques for insert to authenticated
  with check (prive.est_admin(entreprise_id));

create policy "membres_boutiques : retrait par les admins"
  on public.membres_boutiques for delete to authenticated
  using (prive.est_admin(entreprise_id));

-- ---- invitations -----------------------------------------------------------
-- Création via inviter_membre() (contrôle des rôles), acceptation via accepter_invitations().
create policy "invitations : lecture par les admins ou l'invité"
  on public.invitations for select to authenticated
  using (
    prive.est_admin(entreprise_id)
    or email = lower((select auth.jwt()) ->> 'email')
  );

create policy "invitations : annulation par les admins"
  on public.invitations for delete to authenticated
  using (prive.est_admin(entreprise_id) and acceptee_le is null);

-- =============================================================================
-- Fonctions RPC (appelées depuis le web et le mobile)
-- =============================================================================

-- Crée une entreprise, sa boutique principale et fait de l'appelant le propriétaire.
create or replace function public.creer_entreprise(
  p_raison_sociale     text,
  p_pays               text,
  p_forme_juridique    text default null,
  p_sigle              text default null,
  p_ville              text default null,
  p_telephone          text default null,
  p_email              text default null,
  p_rccm               text default null,
  p_identifiant_fiscal text default null,
  p_nom_boutique       text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_entreprise uuid;
  v_nb integer;
begin
  if v_user is null then
    raise exception 'Authentification requise.' using errcode = '42501';
  end if;

  -- Limite anti-abus : 20 entreprises créées par utilisateur
  select count(*) into v_nb from public.entreprises where created_by = v_user;
  if v_nb >= 20 then
    raise exception 'Nombre maximal d''entreprises atteint.' using errcode = '54000';
  end if;

  insert into public.entreprises (
    raison_sociale, pays, forme_juridique, sigle, ville, telephone, email,
    rccm, identifiant_fiscal, created_by
  )
  values (
    trim(p_raison_sociale),
    upper(trim(p_pays)),
    nullif(trim(p_forme_juridique), ''),
    nullif(trim(p_sigle), ''),
    nullif(trim(p_ville), ''),
    nullif(trim(p_telephone), ''),
    nullif(lower(trim(p_email)), ''),
    nullif(trim(p_rccm), ''),
    nullif(trim(p_identifiant_fiscal), ''),
    v_user
  )
  returning id into v_entreprise;

  perform set_config('facturall.bypass_membres', 'on', true);
  insert into public.membres (entreprise_id, user_id, role, toutes_boutiques)
  values (v_entreprise, v_user, 'proprietaire', true);
  perform set_config('facturall.bypass_membres', 'off', true);

  insert into public.boutiques (entreprise_id, code, nom, ville, est_principale)
  values (
    v_entreprise,
    'PRINC',
    coalesce(nullif(trim(p_nom_boutique), ''), 'Boutique principale'),
    nullif(trim(p_ville), ''),
    true
  );

  return v_entreprise;
end;
$$;

-- Entreprises de l'utilisateur connecté, avec son rôle.
create or replace function public.mes_entreprises()
returns table (
  entreprise_id    uuid,
  raison_sociale   text,
  sigle            text,
  pays             text,
  role             public.role_membre,
  toutes_boutiques boolean,
  mode_comptable   text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select e.id, e.raison_sociale, e.sigle, e.pays::text, m.role, m.toutes_boutiques, e.mode_comptable
  from public.membres m
  join public.entreprises e on e.id = m.entreprise_id
  where m.user_id = (select auth.uid())
    and m.actif
  order by e.raison_sociale;
$$;

-- Membres d'une entreprise avec e-mail, nom et boutiques attribuées.
create or replace function public.membres_entreprise(p_entreprise_id uuid)
returns table (
  membre_id        uuid,
  user_id          uuid,
  email            text,
  nom_complet      text,
  role             public.role_membre,
  toutes_boutiques boolean,
  boutique_ids     uuid[],
  actif            boolean,
  created_at       timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    m.id, m.user_id, p.email, p.nom_complet, m.role, m.toutes_boutiques,
    coalesce(
      (select array_agg(mb.boutique_id order by mb.boutique_id)
       from public.membres_boutiques mb where mb.membre_id = m.id),
      '{}'
    ),
    m.actif, m.created_at
  from public.membres m
  left join public.profils p on p.id = m.user_id
  where m.entreprise_id = p_entreprise_id
  order by m.created_at;
$$;

-- Invite (ou ré-invite) un e-mail dans une entreprise.
create or replace function public.inviter_membre(
  p_entreprise_id    uuid,
  p_email            text,
  p_role             public.role_membre,
  p_toutes_boutiques boolean default true,
  p_boutique_ids     uuid[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(trim(p_email));
  v_id uuid;
begin
  if not prive.est_admin(p_entreprise_id) then
    raise exception 'Seuls les administrateurs peuvent inviter.' using errcode = '42501';
  end if;

  if p_role = 'proprietaire'
     and not prive.a_role(p_entreprise_id, array['proprietaire']::public.role_membre[]) then
    raise exception 'Seul un propriétaire peut inviter un propriétaire.' using errcode = '42501';
  end if;

  if v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    raise exception 'Adresse e-mail invalide.' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.membres m
    join public.profils p on p.id = m.user_id
    where m.entreprise_id = p_entreprise_id and p.email = v_email
  ) then
    raise exception 'Cette personne est déjà membre de l''entreprise.' using errcode = '23505';
  end if;

  if not p_toutes_boutiques and exists (
    select 1 from unnest(p_boutique_ids) as b(id)
    where not exists (
      select 1 from public.boutiques bo where bo.id = b.id and bo.entreprise_id = p_entreprise_id
    )
  ) then
    raise exception 'Boutique inconnue pour cette entreprise.' using errcode = '22023';
  end if;

  insert into public.invitations (entreprise_id, email, role, toutes_boutiques, boutique_ids, invite_par)
  values (
    p_entreprise_id, v_email, p_role, p_toutes_boutiques,
    case when p_toutes_boutiques then '{}' else coalesce(p_boutique_ids, '{}') end,
    auth.uid()
  )
  on conflict (entreprise_id, email) where acceptee_le is null
  do update set
    role = excluded.role,
    toutes_boutiques = excluded.toutes_boutiques,
    boutique_ids = excluded.boutique_ids,
    invite_par = excluded.invite_par,
    expire_le = now() + interval '14 days'
  returning id into v_id;

  return v_id;
end;
$$;

-- Accepte toutes les invitations valides adressées à l'e-mail (confirmé) de l'appelant.
-- Renvoie le nombre d'entreprises rejointes.
create or replace function public.accepter_invitations()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_email text;
  v_inv record;
  v_membre uuid;
  v_nb integer := 0;
begin
  if v_user is null then
    raise exception 'Authentification requise.' using errcode = '42501';
  end if;

  select lower(u.email) into v_email
  from auth.users u
  where u.id = v_user and u.email_confirmed_at is not null;

  if v_email is null then
    return 0; -- e-mail non confirmé : on n'accepte rien
  end if;

  perform set_config('facturall.bypass_membres', 'on', true);

  for v_inv in
    select * from public.invitations i
    where i.email = v_email and i.acceptee_le is null and i.expire_le > now()
    for update
  loop
    v_membre := null;
    insert into public.membres (entreprise_id, user_id, role, toutes_boutiques)
    values (v_inv.entreprise_id, v_user, v_inv.role, v_inv.toutes_boutiques)
    on conflict (entreprise_id, user_id) do nothing
    returning id into v_membre;

    if v_membre is not null then
      insert into public.membres_boutiques (membre_id, boutique_id, entreprise_id)
      select v_membre, b.id, v_inv.entreprise_id
      from public.boutiques b
      where b.entreprise_id = v_inv.entreprise_id
        and b.id = any (v_inv.boutique_ids)
      on conflict do nothing;
      v_nb := v_nb + 1;
    end if;

    update public.invitations set acceptee_le = now() where id = v_inv.id;
  end loop;

  perform set_config('facturall.bypass_membres', 'off', true);
  return v_nb;
end;
$$;

-- Modifie le rôle et les boutiques d'un membre en une seule opération.
create or replace function public.modifier_membre(
  p_membre_id        uuid,
  p_role             public.role_membre,
  p_toutes_boutiques boolean,
  p_boutique_ids     uuid[] default '{}'
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_entreprise uuid;
begin
  select entreprise_id into v_entreprise from public.membres where id = p_membre_id;
  if v_entreprise is null or not prive.est_admin(v_entreprise) then
    raise exception 'Membre introuvable ou droits insuffisants.' using errcode = '42501';
  end if;

  update public.membres
  set role = p_role, toutes_boutiques = p_toutes_boutiques
  where id = p_membre_id;

  delete from public.membres_boutiques where membre_id = p_membre_id;

  if not p_toutes_boutiques then
    insert into public.membres_boutiques (membre_id, boutique_id, entreprise_id)
    select p_membre_id, b.id, v_entreprise
    from public.boutiques b
    where b.entreprise_id = v_entreprise and b.id = any (p_boutique_ids);
  end if;
end;
$$;

-- Droits d'exécution : uniquement les utilisateurs connectés
revoke execute on function
  public.creer_entreprise(text, text, text, text, text, text, text, text, text, text),
  public.mes_entreprises(),
  public.membres_entreprise(uuid),
  public.inviter_membre(uuid, text, public.role_membre, boolean, uuid[]),
  public.accepter_invitations(),
  public.modifier_membre(uuid, public.role_membre, boolean, uuid[])
from public, anon;

grant execute on function
  public.creer_entreprise(text, text, text, text, text, text, text, text, text, text),
  public.mes_entreprises(),
  public.membres_entreprise(uuid),
  public.inviter_membre(uuid, text, public.role_membre, boolean, uuid[]),
  public.accepter_invitations(),
  public.modifier_membre(uuid, public.role_membre, boolean, uuid[])
to authenticated;
