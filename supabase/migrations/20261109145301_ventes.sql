-- =============================================================================
-- FacturAll — Gestion commerciale : ventes
--
--   • parametres_vente : comptes et journal utilisés pour les écritures de vente
--   • taux_tva         : taux par entreprise (TVA normale du pays + exonéré)
--   • clients, articles
--   • documents_vente (devis, factures, avoirs) + lignes_documents_vente
--   • reglements       : encaissements des factures (caisse, banque, Mobile Money)
--
-- Règles garanties par la base :
--   • montants entiers FCFA, calculés par la base (HT, TVA, TTC par ligne puis totaux) ;
--   • numérotation continue et sans trou par type et par année : DV-2026-00001,
--     FA-2026-00001, AV-2026-00001, attribuée à la validation ;
--   • une facture validée est inaltérable : on l'annule par un avoir ;
--   • la validation d'une facture passe l'écriture au journal des ventes
--     (411 au débit, 70x et 443x au crédit), un règlement l'écriture de trésorerie ;
--   • ces écritures automatiques ne peuvent pas être contre-passées à la main ;
--   • vendeurs et gestionnaires n'agissent que dans leurs boutiques.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Droits
-- -----------------------------------------------------------------------------
-- Peut vendre (créer devis, factures, clients, encaisser)
create or replace function prive.est_vendeur(p_entreprise_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select prive.a_role(p_entreprise_id,
    array['proprietaire', 'admin', 'comptable', 'gestionnaire', 'vendeur']::public.role_membre[]);
$$;

-- Peut gérer le catalogue (articles, prix)
create or replace function prive.gere_catalogue(p_entreprise_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select prive.a_role(p_entreprise_id,
    array['proprietaire', 'admin', 'comptable', 'gestionnaire']::public.role_membre[]);
$$;

revoke all on function prive.est_vendeur(uuid), prive.gere_catalogue(uuid) from public, anon;
grant execute on function prive.est_vendeur(uuid), prive.gere_catalogue(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Compteurs de numérotation (documents, codes clients)
-- -----------------------------------------------------------------------------
create table prive.compteurs_documents (
  entreprise_id uuid not null references public.entreprises (id) on delete cascade,
  type          text not null,
  annee         integer not null,
  dernier       integer not null default 0,
  primary key (entreprise_id, type, annee)
);
revoke all on prive.compteurs_documents from public, anon, authenticated;

create or replace function prive.prochain_numero(p_entreprise_id uuid, p_type text, p_annee integer)
returns integer language plpgsql security definer set search_path = ''
as $$
declare
  v_n integer;
begin
  insert into prive.compteurs_documents (entreprise_id, type, annee, dernier)
  values (p_entreprise_id, p_type, p_annee, 0)
  on conflict (entreprise_id, type, annee) do nothing;

  update prive.compteurs_documents
  set dernier = dernier + 1
  where entreprise_id = p_entreprise_id and type = p_type and annee = p_annee
  returning dernier into v_n;
  return v_n;
end;
$$;
revoke all on function prive.prochain_numero(uuid, text, integer) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Taux de TVA
-- -----------------------------------------------------------------------------
create table public.taux_tva (
  id                   uuid primary key default gen_random_uuid(),
  entreprise_id        uuid not null references public.entreprises (id) on delete cascade,
  libelle              text not null check (length(trim(libelle)) between 2 and 60),
  taux                 numeric(5, 2) not null check (taux >= 0 and taux <= 100),
  compte_collecte_id   uuid,
  compte_deductible_id uuid,
  par_defaut           boolean not null default false,
  actif                boolean not null default true,
  created_at           timestamptz not null default now(),
  unique (entreprise_id, libelle),
  unique (id, entreprise_id),
  foreign key (compte_collecte_id, entreprise_id) references public.comptes (id, entreprise_id),
  foreign key (compte_deductible_id, entreprise_id) references public.comptes (id, entreprise_id),
  check (taux = 0 or compte_collecte_id is not null)
);
create unique index taux_tva_un_defaut on public.taux_tva (entreprise_id) where par_defaut;
create index taux_tva_collecte_idx on public.taux_tva (compte_collecte_id, entreprise_id);
create index taux_tva_deductible_idx on public.taux_tva (compte_deductible_id, entreprise_id);

-- -----------------------------------------------------------------------------
-- Paramètres de vente
-- -----------------------------------------------------------------------------
create table public.parametres_vente (
  entreprise_id             uuid primary key references public.entreprises (id) on delete cascade,
  compte_clients_id         uuid not null,
  journal_ventes_id         uuid not null,
  compte_ventes_biens_id    uuid not null,
  compte_ventes_services_id uuid not null,
  delai_paiement_jours      smallint not null default 30 check (delai_paiement_jours between 0 and 365),
  mentions_facture          text check (mentions_facture is null or length(mentions_facture) <= 1000),
  updated_at                timestamptz not null default now(),
  foreign key (compte_clients_id, entreprise_id) references public.comptes (id, entreprise_id),
  foreign key (journal_ventes_id, entreprise_id) references public.journaux (id, entreprise_id),
  foreign key (compte_ventes_biens_id, entreprise_id) references public.comptes (id, entreprise_id),
  foreign key (compte_ventes_services_id, entreprise_id) references public.comptes (id, entreprise_id)
);
create index parametres_vente_clients_idx on public.parametres_vente (compte_clients_id, entreprise_id);
create index parametres_vente_journal_idx on public.parametres_vente (journal_ventes_id, entreprise_id);
create index parametres_vente_biens_idx on public.parametres_vente (compte_ventes_biens_id, entreprise_id);
create index parametres_vente_services_idx on public.parametres_vente (compte_ventes_services_id, entreprise_id);

create trigger parametres_vente_updated_at
  before update on public.parametres_vente
  for each row execute function prive.maj_updated_at();

-- -----------------------------------------------------------------------------
-- Clients
-- -----------------------------------------------------------------------------
create table public.clients (
  id                   uuid primary key default gen_random_uuid(),
  entreprise_id        uuid not null references public.entreprises (id) on delete cascade,
  code                 text not null check (code ~ '^[A-Z0-9-]{2,20}$'),
  nom                  text not null check (length(trim(nom)) between 2 and 150),
  type                 text not null default 'entreprise' check (type in ('particulier', 'entreprise')),
  telephone            text check (telephone is null or length(telephone) <= 30),
  email                text check (email is null or length(email) <= 200),
  adresse              text check (adresse is null or length(adresse) <= 300),
  ville                text check (ville is null or length(ville) <= 100),
  identifiant_fiscal   text check (identifiant_fiscal is null or length(identifiant_fiscal) <= 50),
  rccm                 text check (rccm is null or length(rccm) <= 50),
  delai_paiement_jours smallint check (delai_paiement_jours is null or delai_paiement_jours between 0 and 365),
  notes                text check (notes is null or length(notes) <= 1000),
  actif                boolean not null default true,
  created_by           uuid references auth.users (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (entreprise_id, code),
  unique (id, entreprise_id)
);
create index clients_entreprise_nom_idx on public.clients (entreprise_id, nom);
create index clients_created_by_idx on public.clients (created_by);

create trigger clients_updated_at
  before update on public.clients
  for each row execute function prive.maj_updated_at();

-- Code client automatique : CL0001, CL0002…
create or replace function prive.code_client()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.code is null or trim(new.code) = '' then
    new.code := 'CL' || lpad(prive.prochain_numero(new.entreprise_id, 'client', 0)::text, 4, '0');
  end if;
  new.created_by := coalesce(new.created_by, auth.uid());
  return new;
end;
$$;

create trigger clients_code
  before insert on public.clients
  for each row execute function prive.code_client();

-- -----------------------------------------------------------------------------
-- Articles (biens et services vendus)
-- -----------------------------------------------------------------------------
create table public.articles (
  id              uuid primary key default gen_random_uuid(),
  entreprise_id   uuid not null references public.entreprises (id) on delete cascade,
  reference       text check (reference is null or reference ~ '^[A-Za-z0-9._/-]{1,30}$'),
  designation     text not null check (length(trim(designation)) between 2 and 200),
  type            text not null default 'bien' check (type in ('bien', 'service')),
  unite           text not null default 'unité' check (length(unite) between 1 and 20),
  prix_vente      bigint not null default 0 check (prix_vente >= 0),
  taux_tva_id     uuid,
  compte_vente_id uuid,
  actif           boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (id, entreprise_id),
  foreign key (taux_tva_id, entreprise_id) references public.taux_tva (id, entreprise_id),
  foreign key (compte_vente_id, entreprise_id) references public.comptes (id, entreprise_id)
);
create unique index articles_reference_unique on public.articles (entreprise_id, reference) where reference is not null;
create index articles_entreprise_designation_idx on public.articles (entreprise_id, designation);
create index articles_taux_tva_idx on public.articles (taux_tva_id, entreprise_id);
create index articles_compte_vente_idx on public.articles (compte_vente_id, entreprise_id);

create trigger articles_updated_at
  before update on public.articles
  for each row execute function prive.maj_updated_at();

-- -----------------------------------------------------------------------------
-- Documents de vente : devis, factures, avoirs
-- -----------------------------------------------------------------------------
create table public.documents_vente (
  id                  uuid primary key default gen_random_uuid(),
  entreprise_id       uuid not null references public.entreprises (id) on delete cascade,
  boutique_id         uuid not null,
  type                text not null check (type in ('devis', 'facture', 'avoir')),
  numero              text,
  -- devis : brouillon → valide (envoyé) → transforme | annule ; facture : brouillon → valide ; avoir : valide
  statut              text not null default 'brouillon' check (statut in ('brouillon', 'valide', 'transforme', 'annule')),
  client_id           uuid not null,
  date_document       date not null default current_date,
  date_echeance       date,
  reference_client    text check (reference_client is null or length(reference_client) <= 60),
  notes               text check (notes is null or length(notes) <= 2000),
  total_ht            bigint not null default 0 check (total_ht >= 0),
  total_tva           bigint not null default 0 check (total_tva >= 0),
  total_ttc           bigint not null default 0 check (total_ttc >= 0),
  montant_regle       bigint not null default 0 check (montant_regle >= 0),
  montant_avoir       bigint not null default 0 check (montant_avoir >= 0),
  document_origine_id uuid,
  ecriture_id         uuid,
  created_by          uuid references auth.users (id) on delete set null,
  valide_le           timestamptz,
  valide_par          uuid references auth.users (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (id, entreprise_id),
  foreign key (boutique_id, entreprise_id) references public.boutiques (id, entreprise_id),
  foreign key (client_id, entreprise_id) references public.clients (id, entreprise_id),
  foreign key (document_origine_id, entreprise_id) references public.documents_vente (id, entreprise_id),
  foreign key (ecriture_id, entreprise_id) references public.ecritures (id, entreprise_id),
  check ((statut = 'brouillon') = (numero is null)),
  check (date_echeance is null or date_echeance >= date_document),
  check (montant_regle + montant_avoir <= total_ttc)
);
create unique index documents_vente_numero_unique
  on public.documents_vente (entreprise_id, type, numero) where numero is not null;
create index documents_vente_liste_idx on public.documents_vente (entreprise_id, type, date_document desc);
create index documents_vente_boutique_idx on public.documents_vente (boutique_id, entreprise_id);
create index documents_vente_client_idx on public.documents_vente (client_id, entreprise_id);
create index documents_vente_origine_idx on public.documents_vente (document_origine_id, entreprise_id);
create index documents_vente_ecriture_idx on public.documents_vente (ecriture_id, entreprise_id);
create index documents_vente_created_by_idx on public.documents_vente (created_by);
create index documents_vente_valide_par_idx on public.documents_vente (valide_par);

create trigger documents_vente_updated_at
  before update on public.documents_vente
  for each row execute function prive.maj_updated_at();

create table public.lignes_documents_vente (
  id              uuid primary key default gen_random_uuid(),
  document_id     uuid not null,
  entreprise_id   uuid not null,
  ordre           smallint not null,
  article_id      uuid,
  designation     text not null check (length(trim(designation)) between 1 and 300),
  quantite        numeric(14, 3) not null check (quantite > 0),
  unite           text,
  prix_unitaire   bigint not null check (prix_unitaire >= 0),
  remise_pct      numeric(5, 2) not null default 0 check (remise_pct >= 0 and remise_pct <= 100),
  taux_tva_id     uuid,
  taux_tva        numeric(5, 2) not null default 0,
  compte_vente_id uuid not null,
  montant_ht      bigint not null,
  montant_tva     bigint not null,
  montant_ttc     bigint not null,
  unique (document_id, ordre),
  foreign key (document_id, entreprise_id) references public.documents_vente (id, entreprise_id) on delete cascade,
  foreign key (article_id, entreprise_id) references public.articles (id, entreprise_id),
  foreign key (taux_tva_id, entreprise_id) references public.taux_tva (id, entreprise_id),
  foreign key (compte_vente_id, entreprise_id) references public.comptes (id, entreprise_id),
  check (montant_ttc = montant_ht + montant_tva)
);
create index lignes_documents_vente_document_idx on public.lignes_documents_vente (document_id, entreprise_id);
create index lignes_documents_vente_article_idx on public.lignes_documents_vente (article_id, entreprise_id);
create index lignes_documents_vente_taux_idx on public.lignes_documents_vente (taux_tva_id, entreprise_id);
create index lignes_documents_vente_compte_idx on public.lignes_documents_vente (compte_vente_id, entreprise_id);

-- -----------------------------------------------------------------------------
-- Règlements
-- -----------------------------------------------------------------------------
create table public.reglements (
  id             uuid primary key default gen_random_uuid(),
  entreprise_id  uuid not null references public.entreprises (id) on delete cascade,
  boutique_id    uuid not null,
  document_id    uuid not null,
  client_id      uuid not null,
  date_reglement date not null,
  montant        bigint not null check (montant > 0),
  mode           text not null check (mode in ('especes', 'mobile_money', 'virement', 'cheque', 'carte', 'autre')),
  journal_id     uuid not null,
  reference      text check (reference is null or length(reference) <= 60),
  ecriture_id    uuid not null,
  created_by     uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  foreign key (boutique_id, entreprise_id) references public.boutiques (id, entreprise_id),
  foreign key (document_id, entreprise_id) references public.documents_vente (id, entreprise_id),
  foreign key (client_id, entreprise_id) references public.clients (id, entreprise_id),
  foreign key (journal_id, entreprise_id) references public.journaux (id, entreprise_id),
  foreign key (ecriture_id, entreprise_id) references public.ecritures (id, entreprise_id)
);
create index reglements_document_idx on public.reglements (document_id, entreprise_id);
create index reglements_boutique_idx on public.reglements (boutique_id, entreprise_id);
create index reglements_client_idx on public.reglements (client_id, entreprise_id);
create index reglements_journal_idx on public.reglements (journal_id, entreprise_id);
create index reglements_ecriture_idx on public.reglements (ecriture_id, entreprise_id);
create index reglements_created_by_idx on public.reglements (created_by);
create index reglements_date_idx on public.reglements (entreprise_id, date_reglement desc);

-- Tiers client sur les lignes d'écriture (compte 411)
alter table public.ecriture_lignes add column client_id uuid;
alter table public.ecriture_lignes
  add foreign key (client_id, entreprise_id) references public.clients (id, entreprise_id);
create index ecriture_lignes_client_idx on public.ecriture_lignes (client_id, entreprise_id);

-- -----------------------------------------------------------------------------
-- Inaltérabilité des documents validés
-- -----------------------------------------------------------------------------
create or replace function prive.proteger_documents_vente()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if coalesce(current_setting('facturall.purge', true), '') = 'on' or old.statut = 'brouillon' then
    return coalesce(new, old);
  end if;
  if tg_op = 'DELETE' then
    raise exception 'Le document % est validé : il ne peut pas être supprimé.', old.numero using errcode = '42501';
  end if;
  -- Après validation, seuls le suivi des paiements et le statut du devis évoluent.
  if (to_jsonb(new) - array['montant_regle', 'montant_avoir', 'statut', 'updated_at'])
     is distinct from (to_jsonb(old) - array['montant_regle', 'montant_avoir', 'statut', 'updated_at'])
     or (old.type <> 'devis' and new.statut <> old.statut) then
    raise exception 'Le document % est validé : il ne peut plus être modifié (établissez un avoir).', old.numero
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger documents_vente_inalterables
  before update or delete on public.documents_vente
  for each row execute function prive.proteger_documents_vente();

create or replace function prive.proteger_lignes_vente()
returns trigger language plpgsql set search_path = ''
as $$
declare
  v_statut text;
begin
  if coalesce(current_setting('facturall.purge', true), '') = 'on' then
    return coalesce(new, old);
  end if;
  select statut into v_statut from public.documents_vente where id = coalesce(new.document_id, old.document_id);
  if v_statut is not null and v_statut <> 'brouillon' then
    raise exception 'Les lignes d''un document validé ne peuvent plus être modifiées.' using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger lignes_documents_vente_inalterables
  before insert or update or delete on public.lignes_documents_vente
  for each row execute function prive.proteger_lignes_vente();

create or replace function prive.proteger_reglements()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if coalesce(current_setting('facturall.purge', true), '') = 'on' then
    return coalesce(new, old);
  end if;
  raise exception 'Un règlement enregistré ne peut être ni modifié ni supprimé.' using errcode = '42501';
end;
$$;

create trigger reglements_inalterables
  before update or delete on public.reglements
  for each row execute function prive.proteger_reglements();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.taux_tva               enable row level security;
alter table public.parametres_vente       enable row level security;
alter table public.clients                enable row level security;
alter table public.articles               enable row level security;
alter table public.documents_vente        enable row level security;
alter table public.lignes_documents_vente enable row level security;
alter table public.reglements             enable row level security;

revoke all on public.taux_tva, public.parametres_vente, public.clients, public.articles,
  public.documents_vente, public.lignes_documents_vente, public.reglements from anon, authenticated;

grant select on public.taux_tva, public.parametres_vente, public.clients, public.articles,
  public.documents_vente, public.lignes_documents_vente, public.reglements to authenticated;
grant insert (entreprise_id, libelle, taux, compte_collecte_id, compte_deductible_id) on public.taux_tva to authenticated;
grant update (libelle, actif) on public.taux_tva to authenticated;
grant update (compte_clients_id, journal_ventes_id, compte_ventes_biens_id, compte_ventes_services_id,
              delai_paiement_jours, mentions_facture) on public.parametres_vente to authenticated;
grant insert (entreprise_id, nom, type, telephone, email, adresse, ville, identifiant_fiscal, rccm,
              delai_paiement_jours, notes) on public.clients to authenticated;
grant update (nom, type, telephone, email, adresse, ville, identifiant_fiscal, rccm,
              delai_paiement_jours, notes, actif) on public.clients to authenticated;
grant insert (entreprise_id, reference, designation, type, unite, prix_vente, taux_tva_id, compte_vente_id)
  on public.articles to authenticated;
grant update (reference, designation, type, unite, prix_vente, taux_tva_id, compte_vente_id, actif)
  on public.articles to authenticated;

create policy "taux_tva : lecture" on public.taux_tva for select to authenticated
  using (prive.est_membre(entreprise_id));
create policy "taux_tva : ajout comptable" on public.taux_tva for insert to authenticated
  with check (prive.est_compta(entreprise_id));
create policy "taux_tva : modification comptable" on public.taux_tva for update to authenticated
  using (prive.est_compta(entreprise_id)) with check (prive.est_compta(entreprise_id));

create policy "parametres_vente : lecture" on public.parametres_vente for select to authenticated
  using (prive.est_membre(entreprise_id));
create policy "parametres_vente : modification comptable" on public.parametres_vente for update to authenticated
  using (prive.est_compta(entreprise_id)) with check (prive.est_compta(entreprise_id));

create policy "clients : lecture" on public.clients for select to authenticated
  using (prive.est_membre(entreprise_id));
create policy "clients : ajout par les vendeurs" on public.clients for insert to authenticated
  with check (prive.est_vendeur(entreprise_id));
create policy "clients : modification par les vendeurs" on public.clients for update to authenticated
  using (prive.est_vendeur(entreprise_id)) with check (prive.est_vendeur(entreprise_id));

create policy "articles : lecture" on public.articles for select to authenticated
  using (prive.est_membre(entreprise_id));
create policy "articles : ajout" on public.articles for insert to authenticated
  with check (prive.gere_catalogue(entreprise_id));
create policy "articles : modification" on public.articles for update to authenticated
  using (prive.gere_catalogue(entreprise_id)) with check (prive.gere_catalogue(entreprise_id));

create policy "documents_vente : lecture selon la boutique" on public.documents_vente for select to authenticated
  using (prive.peut_acceder_boutique(boutique_id, entreprise_id));
create policy "lignes_documents_vente : lecture selon le document" on public.lignes_documents_vente
  for select to authenticated
  using (exists (select 1 from public.documents_vente d where d.id = document_id));
create policy "reglements : lecture selon la boutique" on public.reglements for select to authenticated
  using (prive.peut_acceder_boutique(boutique_id, entreprise_id));

-- =============================================================================
-- Initialisation des ventes d'une entreprise
-- =============================================================================
create or replace function prive.initialiser_ventes(p_entreprise_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_pays text;
  v_taux numeric(5, 2);
  c record;
begin
  select pays into v_pays from public.entreprises where id = p_entreprise_id;
  -- Taux normal : 18 % (directive UEMOA), 19 % au Niger. Modifiable par l'entreprise.
  v_taux := case v_pays when 'NE' then 19 else 18 end;

  select
    (select id from public.comptes where entreprise_id = p_entreprise_id and numero = '411')  as clients,
    (select id from public.journaux where entreprise_id = p_entreprise_id and code = 'VT')    as journal,
    (select id from public.comptes where entreprise_id = p_entreprise_id and numero = '701')  as biens,
    (select id from public.comptes where entreprise_id = p_entreprise_id and numero = '706')  as services,
    (select id from public.comptes where entreprise_id = p_entreprise_id and numero = '4431') as collectee,
    (select id from public.comptes where entreprise_id = p_entreprise_id and numero = '4452') as deductible
  into c;

  if c.clients is null or c.journal is null then
    return; -- comptabilité non initialisée
  end if;

  insert into public.parametres_vente (entreprise_id, compte_clients_id, journal_ventes_id,
                                       compte_ventes_biens_id, compte_ventes_services_id)
  values (p_entreprise_id, c.clients, c.journal, c.biens, c.services)
  on conflict (entreprise_id) do nothing;

  insert into public.taux_tva (entreprise_id, libelle, taux, compte_collecte_id, compte_deductible_id, par_defaut)
  values (p_entreprise_id, 'TVA ' || replace(v_taux::integer::text, '.', ',') || ' %', v_taux, c.collectee, c.deductible, true),
         (p_entreprise_id, 'Exonéré', 0, null, null, false)
  on conflict (entreprise_id, libelle) do nothing;

  -- Client par défaut pour les ventes au comptoir
  insert into public.clients (entreprise_id, code, nom, type)
  values (p_entreprise_id, 'CL0000', 'Clients divers', 'particulier')
  on conflict (entreprise_id, code) do nothing;
end;
$$;
revoke all on function prive.initialiser_ventes(uuid) from public, anon, authenticated;

create or replace function prive.apres_creation_entreprise_ventes()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  perform prive.initialiser_ventes(new.id);
  return new;
end;
$$;

-- Nom choisi pour s'exécuter après « entreprises_initialiser_comptabilite » (ordre alphabétique)
create trigger entreprises_initialiser_ventes
  after insert on public.entreprises
  for each row execute function prive.apres_creation_entreprise_ventes();

do $$
declare
  v_id uuid;
begin
  for v_id in select id from public.entreprises loop
    perform prive.initialiser_ventes(v_id);
  end loop;
end;
$$;

-- =============================================================================
-- Écritures automatiques
-- =============================================================================

-- Lignes d'écriture : prise en charge du tiers client
create or replace function prive.ecrire_lignes(p_ecriture_id uuid, p_entreprise_id uuid, p_lignes jsonb)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_ligne jsonb;
  v_ordre smallint := 0;
  v_compte public.comptes;
  v_debit bigint;
  v_credit bigint;
  v_client uuid;
begin
  if p_lignes is null or jsonb_typeof(p_lignes) <> 'array' then
    raise exception 'Les lignes de l''écriture sont invalides.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_lignes) > 500 then
    raise exception 'Trop de lignes (500 au maximum).' using errcode = '22023';
  end if;

  delete from public.ecriture_lignes where ecriture_id = p_ecriture_id;

  for v_ligne in select * from jsonb_array_elements(p_lignes) loop
    v_ordre := v_ordre + 1;

    if v_ligne ? 'compte_id' and nullif(v_ligne ->> 'compte_id', '') is not null then
      select * into v_compte from public.comptes
      where id = (v_ligne ->> 'compte_id')::uuid and entreprise_id = p_entreprise_id;
    else
      select * into v_compte from public.comptes
      where numero = v_ligne ->> 'compte' and entreprise_id = p_entreprise_id;
    end if;

    if v_compte.id is null then
      raise exception 'Ligne % : compte introuvable.', v_ordre using errcode = '22023';
    end if;
    if not v_compte.actif then
      raise exception 'Ligne % : le compte % est désactivé.', v_ordre, v_compte.numero using errcode = '22023';
    end if;
    if not v_compte.mouvementable then
      raise exception 'Ligne % : le compte % est un compte de regroupement, utilisez un sous-compte.',
        v_ordre, v_compte.numero using errcode = '22023';
    end if;

    begin
      v_debit  := coalesce(nullif(v_ligne ->> 'debit', ''), '0')::bigint;
      v_credit := coalesce(nullif(v_ligne ->> 'credit', ''), '0')::bigint;
    exception when others then
      raise exception 'Ligne % : montant invalide (entiers en FCFA uniquement).', v_ordre using errcode = '22023';
    end;

    if v_debit < 0 or v_credit < 0 or (v_debit > 0) = (v_credit > 0) then
      raise exception 'Ligne % : saisissez un montant au débit OU au crédit.', v_ordre using errcode = '22023';
    end if;

    v_client := nullif(v_ligne ->> 'client_id', '')::uuid;
    if v_client is not null and not exists (
      select 1 from public.clients where id = v_client and entreprise_id = p_entreprise_id
    ) then
      raise exception 'Ligne % : client introuvable.', v_ordre using errcode = '22023';
    end if;

    insert into public.ecriture_lignes (ecriture_id, entreprise_id, ordre, compte_id, libelle, debit, credit, client_id)
    values (p_ecriture_id, p_entreprise_id, v_ordre, v_compte.id,
            nullif(trim(v_ligne ->> 'libelle'), ''), v_debit, v_credit, v_client);

    v_compte := null;
  end loop;
end;
$$;

-- Crée et valide une écriture générée par un module (ventes, règlements…), sans contrôle de rôle :
-- l'appelant a déjà vérifié les droits.
create or replace function prive.ecriture_automatique(
  p_entreprise_id uuid,
  p_journal_id    uuid,
  p_date          date,
  p_libelle       text,
  p_reference     text,
  p_lignes        jsonb,
  p_origine       text,
  p_boutique_id   uuid
)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.ecritures (entreprise_id, exercice_id, journal_id, date_ecriture, libelle,
                                reference, origine, boutique_id, created_by)
  values (p_entreprise_id, prive.exercice_pour_date(p_entreprise_id, p_date), p_journal_id, p_date,
          left(p_libelle, 200), left(p_reference, 60), p_origine, p_boutique_id, auth.uid())
  returning id into v_id;

  perform prive.ecrire_lignes(v_id, p_entreprise_id, p_lignes);
  perform prive.valider(v_id);
  return v_id;
end;
$$;

revoke all on function prive.ecrire_lignes(uuid, uuid, jsonb),
  prive.ecriture_automatique(uuid, uuid, date, text, text, jsonb, text, uuid) from public, anon, authenticated;

-- Contre-passation : interdite pour les écritures générées par les ventes,
-- et recopie du tiers client.
create or replace function public.contre_passer_ecriture(
  p_ecriture_id uuid,
  p_date        date default current_date,
  p_libelle     text default null
)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_e public.ecritures;
  v_id uuid;
begin
  select * into v_e from public.ecritures where id = p_ecriture_id;
  if v_e.id is null or not prive.est_compta(v_e.entreprise_id) then
    raise exception 'Écriture introuvable ou droits insuffisants.' using errcode = '42501';
  end if;
  if v_e.statut <> 'validee' then
    raise exception 'Seule une écriture validée peut être contre-passée (supprimez plutôt le brouillon).'
      using errcode = '22023';
  end if;
  if v_e.origine in ('vente', 'avoir', 'reglement') then
    raise exception 'Cette écriture provient des ventes : annulez la facture par un avoir.' using errcode = '22023';
  end if;
  if v_e.contre_passation_de is not null then
    raise exception 'Une contre-passation ne peut pas être elle-même contre-passée.' using errcode = '22023';
  end if;
  if exists (select 1 from public.ecritures where contre_passation_de = p_ecriture_id) then
    raise exception 'Cette écriture a déjà été contre-passée.' using errcode = '23505';
  end if;

  insert into public.ecritures (entreprise_id, exercice_id, journal_id, date_ecriture, libelle, reference,
                                origine, boutique_id, contre_passation_de, created_by)
  values (v_e.entreprise_id, prive.exercice_pour_date(v_e.entreprise_id, coalesce(p_date, current_date)),
          v_e.journal_id, coalesce(p_date, current_date),
          coalesce(nullif(trim(p_libelle), ''), left('Annulation ' || v_e.numero || ' — ' || v_e.libelle, 200)),
          v_e.numero, 'contre_passation', v_e.boutique_id, v_e.id, auth.uid())
  returning id into v_id;

  insert into public.ecriture_lignes (ecriture_id, entreprise_id, ordre, compte_id, libelle, debit, credit, client_id)
  select v_id, l.entreprise_id, l.ordre, l.compte_id, l.libelle, l.credit, l.debit, l.client_id
  from public.ecriture_lignes l where l.ecriture_id = p_ecriture_id;

  perform prive.valider(v_id);
  return v_id;
end;
$$;

-- =============================================================================
-- Fonctions RPC des ventes
-- =============================================================================

-- Contrôle commun : droit de vendre dans cette boutique
create or replace function prive.verifier_vendeur_boutique(p_entreprise_id uuid, p_boutique_id uuid)
returns void language plpgsql stable security definer set search_path = ''
as $$
begin
  if not prive.est_vendeur(p_entreprise_id) then
    raise exception 'Droits insuffisants pour les ventes.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.boutiques b where b.id = p_boutique_id and b.entreprise_id = p_entreprise_id and b.active)
     or not prive.peut_acceder_boutique(p_boutique_id, p_entreprise_id) then
    raise exception 'Boutique introuvable, désactivée ou non autorisée.' using errcode = '42501';
  end if;
end;
$$;
revoke all on function prive.verifier_vendeur_boutique(uuid, uuid) from public, anon, authenticated;

-- Crée ou met à jour un devis / une facture brouillon.
-- p_lignes : [{ "article_id"?, "designation", "quantite", "prix_unitaire", "remise_pct"?, "taux_tva_id"? }]
create or replace function public.enregistrer_document_vente(
  p_entreprise_id    uuid,
  p_type             text,
  p_boutique_id      uuid,
  p_client_id        uuid,
  p_date             date,
  p_lignes           jsonb,
  p_date_echeance    date default null,
  p_notes            text default null,
  p_reference_client text default null,
  p_document_id      uuid default null
)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid := p_document_id;
  v_param public.parametres_vente;
  v_client public.clients;
  v_article public.articles;
  v_taux public.taux_tva;
  v_ligne jsonb;
  v_ordre smallint := 0;
  v_qte numeric;
  v_pu bigint;
  v_remise numeric;
  v_ht bigint;
  v_tva bigint;
  v_compte uuid;
  v_designation text;
  v_echeance date;
begin
  perform prive.verifier_vendeur_boutique(p_entreprise_id, p_boutique_id);
  if p_type not in ('devis', 'facture') then
    raise exception 'Type de document invalide.' using errcode = '22023';
  end if;

  select * into v_param from public.parametres_vente where entreprise_id = p_entreprise_id;
  select * into v_client from public.clients where id = p_client_id and entreprise_id = p_entreprise_id;
  if v_client.id is null or not v_client.actif then
    raise exception 'Client introuvable ou désactivé.' using errcode = '22023';
  end if;
  if p_lignes is null or jsonb_typeof(p_lignes) <> 'array' or jsonb_array_length(p_lignes) = 0 then
    raise exception 'Ajoutez au moins une ligne.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_lignes) > 300 then
    raise exception 'Trop de lignes (300 au maximum).' using errcode = '22023';
  end if;

  v_echeance := coalesce(p_date_echeance,
    case when p_type = 'facture'
         then coalesce(p_date, current_date) + coalesce(v_client.delai_paiement_jours, v_param.delai_paiement_jours)
         else coalesce(p_date, current_date) + 30 end);

  if v_id is null then
    insert into public.documents_vente (entreprise_id, boutique_id, type, client_id, date_document,
                                        date_echeance, notes, reference_client, created_by)
    values (p_entreprise_id, p_boutique_id, p_type, p_client_id, coalesce(p_date, current_date),
            v_echeance, nullif(trim(p_notes), ''), nullif(trim(p_reference_client), ''), auth.uid())
    returning id into v_id;
  else
    update public.documents_vente
    set boutique_id = p_boutique_id, client_id = p_client_id, date_document = coalesce(p_date, current_date),
        date_echeance = v_echeance, notes = nullif(trim(p_notes), ''),
        reference_client = nullif(trim(p_reference_client), '')
    where id = v_id and entreprise_id = p_entreprise_id and type = p_type and statut = 'brouillon'
      and prive.peut_acceder_boutique(boutique_id, entreprise_id);
    if not found then
      raise exception 'Brouillon introuvable (ou document déjà validé).' using errcode = '22023';
    end if;
    delete from public.lignes_documents_vente where document_id = v_id;
  end if;

  for v_ligne in select * from jsonb_array_elements(p_lignes) loop
    v_ordre := v_ordre + 1;
    v_article := null;
    v_taux := null;

    if nullif(v_ligne ->> 'article_id', '') is not null then
      select * into v_article from public.articles
      where id = (v_ligne ->> 'article_id')::uuid and entreprise_id = p_entreprise_id;
      if v_article.id is null then
        raise exception 'Ligne % : article introuvable.', v_ordre using errcode = '22023';
      end if;
    end if;

    begin
      v_qte    := coalesce(nullif(v_ligne ->> 'quantite', ''), '1')::numeric;
      v_pu     := coalesce(nullif(v_ligne ->> 'prix_unitaire', ''), v_article.prix_vente::text, '0')::bigint;
      v_remise := coalesce(nullif(v_ligne ->> 'remise_pct', ''), '0')::numeric;
    exception when others then
      raise exception 'Ligne % : quantité, prix ou remise invalide.', v_ordre using errcode = '22023';
    end;
    if v_qte <= 0 or v_qte <> round(v_qte, 3) then
      raise exception 'Ligne % : quantité invalide (positive, 3 décimales au plus).', v_ordre using errcode = '22023';
    end if;
    if v_pu < 0 or v_remise < 0 or v_remise > 100 then
      raise exception 'Ligne % : prix ou remise invalide.', v_ordre using errcode = '22023';
    end if;

    -- Taux : celui de la ligne, sinon de l'article, sinon le taux par défaut
    select * into v_taux from public.taux_tva
    where entreprise_id = p_entreprise_id and actif and id = coalesce(
      nullif(v_ligne ->> 'taux_tva_id', '')::uuid,
      v_article.taux_tva_id,
      (select t.id from public.taux_tva t where t.entreprise_id = p_entreprise_id and t.par_defaut));
    if v_taux.id is null then
      raise exception 'Ligne % : taux de TVA introuvable.', v_ordre using errcode = '22023';
    end if;

    v_compte := coalesce(v_article.compte_vente_id,
      case when v_article.type = 'service' then v_param.compte_ventes_services_id
           else v_param.compte_ventes_biens_id end);

    v_designation := coalesce(nullif(trim(v_ligne ->> 'designation'), ''), v_article.designation);
    if v_designation is null then
      raise exception 'Ligne % : désignation obligatoire.', v_ordre using errcode = '22023';
    end if;

    -- Montants arrondis au franc : HT = quantité × prix × (1 − remise), TVA = HT × taux
    v_ht  := round(v_qte * v_pu * (1 - v_remise / 100));
    v_tva := round(v_ht * v_taux.taux / 100);

    insert into public.lignes_documents_vente (document_id, entreprise_id, ordre, article_id, designation, quantite,
      unite, prix_unitaire, remise_pct, taux_tva_id, taux_tva, compte_vente_id, montant_ht, montant_tva, montant_ttc)
    values (v_id, p_entreprise_id, v_ordre, v_article.id, left(v_designation, 300), v_qte,
      coalesce(nullif(trim(v_ligne ->> 'unite'), ''), v_article.unite), v_pu, v_remise, v_taux.id, v_taux.taux,
      v_compte, v_ht, v_tva, v_ht + v_tva);
  end loop;

  update public.documents_vente d
  set total_ht = s.ht, total_tva = s.tva, total_ttc = s.ht + s.tva
  from (select coalesce(sum(montant_ht), 0)::bigint ht, coalesce(sum(montant_tva), 0)::bigint tva
        from public.lignes_documents_vente where document_id = v_id) s
  where d.id = v_id;

  return v_id;
end;
$$;

-- Supprime un brouillon (devis ou facture)
create or replace function public.supprimer_document_vente(p_document_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_d public.documents_vente;
begin
  select * into v_d from public.documents_vente where id = p_document_id;
  if v_d.id is null then
    raise exception 'Document introuvable.' using errcode = '22023';
  end if;
  perform prive.verifier_vendeur_boutique(v_d.entreprise_id, v_d.boutique_id);
  delete from public.documents_vente where id = p_document_id; -- refusé par trigger si validé
end;
$$;

-- Enregistre un règlement sur une facture validée, avec son écriture de trésorerie.
create or replace function public.enregistrer_reglement(
  p_document_id uuid,
  p_montant     bigint,
  p_journal_id  uuid,
  p_mode        text,
  p_date        date default current_date,
  p_reference   text default null
)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_d public.documents_vente;
  v_j public.journaux;
  v_client public.clients;
  v_param public.parametres_vente;
  v_ecriture uuid;
  v_id uuid;
begin
  select * into v_d from public.documents_vente where id = p_document_id for update;
  if v_d.id is null then
    raise exception 'Facture introuvable.' using errcode = '22023';
  end if;
  perform prive.verifier_vendeur_boutique(v_d.entreprise_id, v_d.boutique_id);
  if v_d.type <> 'facture' or v_d.statut <> 'valide' then
    raise exception 'Seule une facture validée peut être réglée.' using errcode = '22023';
  end if;
  if p_montant is null or p_montant <= 0 then
    raise exception 'Le montant doit être supérieur à zéro.' using errcode = '22023';
  end if;
  if p_montant > v_d.total_ttc - v_d.montant_regle - v_d.montant_avoir then
    raise exception 'Le montant dépasse le reste à payer (% FCFA).',
      v_d.total_ttc - v_d.montant_regle - v_d.montant_avoir using errcode = '22023';
  end if;

  select * into v_j from public.journaux where id = p_journal_id and entreprise_id = v_d.entreprise_id;
  if v_j.id is null or v_j.compte_tresorerie_id is null or not v_j.actif then
    raise exception 'Choisissez une caisse, une banque ou un compte Mobile Money.' using errcode = '22023';
  end if;

  select * into v_client from public.clients where id = v_d.client_id;
  select * into v_param from public.parametres_vente where entreprise_id = v_d.entreprise_id;

  v_ecriture := prive.ecriture_automatique(
    v_d.entreprise_id, v_j.id, coalesce(p_date, current_date),
    'Règlement ' || v_d.numero || ' — ' || v_client.nom,
    coalesce(nullif(trim(p_reference), ''), v_d.numero),
    jsonb_build_array(
      jsonb_build_object('compte_id', v_j.compte_tresorerie_id, 'debit', p_montant),
      jsonb_build_object('compte_id', v_param.compte_clients_id, 'credit', p_montant, 'client_id', v_client.id)
    ),
    'reglement', v_d.boutique_id);

  insert into public.reglements (entreprise_id, boutique_id, document_id, client_id, date_reglement, montant,
                                 mode, journal_id, reference, ecriture_id, created_by)
  values (v_d.entreprise_id, v_d.boutique_id, v_d.id, v_d.client_id, coalesce(p_date, current_date), p_montant,
          p_mode, v_j.id, nullif(trim(p_reference), ''), v_ecriture, auth.uid())
  returning id into v_id;

  update public.documents_vente set montant_regle = montant_regle + p_montant where id = v_d.id;
  return v_id;
end;
$$;

-- Valide un devis (numéro DV) ou une facture (numéro FA + écriture au journal des ventes).
-- Pour une facture, p_reglement facultatif : { "montant", "journal_id", "mode", "reference" }.
create or replace function public.valider_document_vente(p_document_id uuid, p_reglement jsonb default null)
returns text language plpgsql security definer set search_path = ''
as $$
declare
  v_d public.documents_vente;
  v_client public.clients;
  v_param public.parametres_vente;
  v_numero text;
  v_lignes jsonb;
  v_ecriture uuid;
begin
  select * into v_d from public.documents_vente where id = p_document_id for update;
  if v_d.id is null then
    raise exception 'Document introuvable.' using errcode = '22023';
  end if;
  perform prive.verifier_vendeur_boutique(v_d.entreprise_id, v_d.boutique_id);
  if v_d.statut <> 'brouillon' then
    raise exception 'Ce document est déjà validé.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.lignes_documents_vente where document_id = v_d.id) then
    raise exception 'Le document ne comporte aucune ligne.' using errcode = '22023';
  end if;

  v_numero := case v_d.type when 'devis' then 'DV' else 'FA' end || '-' ||
              extract(year from v_d.date_document)::text || '-' ||
              lpad(prive.prochain_numero(v_d.entreprise_id, v_d.type,
                   extract(year from v_d.date_document)::integer)::text, 5, '0');

  if v_d.type = 'facture' then
    if v_d.total_ttc <= 0 then
      raise exception 'Une facture doit avoir un montant positif.' using errcode = '22023';
    end if;
    select * into v_client from public.clients where id = v_d.client_id;
    select * into v_param from public.parametres_vente where entreprise_id = v_d.entreprise_id;

    -- 411 au débit (TTC), ventes HT par compte, TVA collectée par compte
    select jsonb_build_array(jsonb_build_object(
             'compte_id', v_param.compte_clients_id, 'debit', v_d.total_ttc, 'client_id', v_client.id,
             'libelle', 'Facture ' || v_numero || ' — ' || v_client.nom))
           || coalesce((select jsonb_agg(jsonb_build_object('compte_id', compte_vente_id, 'credit', ht))
                        from (select compte_vente_id, sum(montant_ht)::bigint ht
                              from public.lignes_documents_vente where document_id = v_d.id
                              group by compte_vente_id having sum(montant_ht) > 0) v), '[]'::jsonb)
           || coalesce((select jsonb_agg(jsonb_build_object('compte_id', compte_collecte_id, 'credit', tva))
                        from (select t.compte_collecte_id, sum(l.montant_tva)::bigint tva
                              from public.lignes_documents_vente l
                              join public.taux_tva t on t.id = l.taux_tva_id
                              where l.document_id = v_d.id
                              group by t.compte_collecte_id having sum(l.montant_tva) > 0) t), '[]'::jsonb)
    into v_lignes;

    v_ecriture := prive.ecriture_automatique(
      v_d.entreprise_id, v_param.journal_ventes_id, v_d.date_document,
      'Facture ' || v_numero || ' — ' || v_client.nom, v_numero, v_lignes, 'vente', v_d.boutique_id);
  end if;

  update public.documents_vente
  set statut = 'valide', numero = v_numero, ecriture_id = v_ecriture, valide_le = now(), valide_par = auth.uid()
  where id = v_d.id;

  if v_d.type = 'facture' and p_reglement is not null and coalesce((p_reglement ->> 'montant')::bigint, 0) > 0 then
    perform public.enregistrer_reglement(
      v_d.id, (p_reglement ->> 'montant')::bigint, (p_reglement ->> 'journal_id')::uuid,
      coalesce(p_reglement ->> 'mode', 'especes'), v_d.date_document, p_reglement ->> 'reference');
  end if;

  return v_numero;
end;
$$;

-- Transforme un devis validé en facture brouillon (mêmes lignes)
create or replace function public.transformer_devis(p_devis_id uuid)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_d public.documents_vente;
  v_id uuid;
begin
  select * into v_d from public.documents_vente where id = p_devis_id for update;
  if v_d.id is null or v_d.type <> 'devis' then
    raise exception 'Devis introuvable.' using errcode = '22023';
  end if;
  perform prive.verifier_vendeur_boutique(v_d.entreprise_id, v_d.boutique_id);
  if v_d.statut <> 'valide' then
    raise exception 'Seul un devis validé (non transformé, non annulé) peut devenir une facture.' using errcode = '22023';
  end if;

  insert into public.documents_vente (entreprise_id, boutique_id, type, client_id, date_document, date_echeance,
    notes, reference_client, total_ht, total_tva, total_ttc, document_origine_id, created_by)
  select entreprise_id, boutique_id, 'facture', client_id, current_date,
         current_date + coalesce((select delai_paiement_jours from public.clients where id = v_d.client_id),
                                 (select delai_paiement_jours from public.parametres_vente where entreprise_id = v_d.entreprise_id)),
         notes, reference_client, total_ht, total_tva, total_ttc, id, auth.uid()
  from public.documents_vente where id = v_d.id
  returning id into v_id;

  insert into public.lignes_documents_vente (document_id, entreprise_id, ordre, article_id, designation, quantite,
    unite, prix_unitaire, remise_pct, taux_tva_id, taux_tva, compte_vente_id, montant_ht, montant_tva, montant_ttc)
  select v_id, entreprise_id, ordre, article_id, designation, quantite, unite, prix_unitaire, remise_pct,
         taux_tva_id, taux_tva, compte_vente_id, montant_ht, montant_tva, montant_ttc
  from public.lignes_documents_vente where document_id = v_d.id;

  update public.documents_vente set statut = 'transforme' where id = v_d.id;
  return v_id;
end;
$$;

create or replace function public.annuler_devis(p_devis_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_d public.documents_vente;
begin
  select * into v_d from public.documents_vente where id = p_devis_id;
  if v_d.id is null or v_d.type <> 'devis' then
    raise exception 'Devis introuvable.' using errcode = '22023';
  end if;
  perform prive.verifier_vendeur_boutique(v_d.entreprise_id, v_d.boutique_id);
  if v_d.statut <> 'valide' then
    raise exception 'Seul un devis validé peut être annulé (supprimez plutôt le brouillon).' using errcode = '22023';
  end if;
  update public.documents_vente set statut = 'annule' where id = v_d.id;
end;
$$;

-- Avoir total sur une facture non réglée : document AV + écriture inverse au journal des ventes.
create or replace function public.creer_avoir(p_facture_id uuid, p_motif text, p_date date default current_date)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_f public.documents_vente;
  v_client public.clients;
  v_param public.parametres_vente;
  v_id uuid;
  v_numero text;
  v_lignes jsonb;
  v_ecriture uuid;
  v_date date := coalesce(p_date, current_date);
begin
  select * into v_f from public.documents_vente where id = p_facture_id for update;
  if v_f.id is null or v_f.type <> 'facture' then
    raise exception 'Facture introuvable.' using errcode = '22023';
  end if;
  if not prive.a_role(v_f.entreprise_id, array['proprietaire', 'admin', 'comptable', 'gestionnaire']::public.role_membre[]) then
    raise exception 'Seuls les gestionnaires, comptables et administrateurs peuvent établir un avoir.' using errcode = '42501';
  end if;
  perform prive.verifier_vendeur_boutique(v_f.entreprise_id, v_f.boutique_id);
  if v_f.statut <> 'valide' then
    raise exception 'Seule une facture validée peut faire l''objet d''un avoir.' using errcode = '22023';
  end if;
  if v_f.montant_regle > 0 or v_f.montant_avoir > 0 then
    raise exception 'Cette facture a déjà des règlements ou un avoir : l''avoir total est impossible.' using errcode = '22023';
  end if;
  if coalesce(trim(p_motif), '') = '' then
    raise exception 'Indiquez le motif de l''avoir.' using errcode = '22023';
  end if;
  if v_date < v_f.date_document then
    raise exception 'L''avoir ne peut pas être antérieur à la facture.' using errcode = '22023';
  end if;

  select * into v_client from public.clients where id = v_f.client_id;
  select * into v_param from public.parametres_vente where entreprise_id = v_f.entreprise_id;

  v_numero := 'AV-' || extract(year from v_date)::text || '-' ||
              lpad(prive.prochain_numero(v_f.entreprise_id, 'avoir', extract(year from v_date)::integer)::text, 5, '0');

  insert into public.documents_vente (entreprise_id, boutique_id, type, client_id, date_document,
    notes, total_ht, total_tva, total_ttc, document_origine_id, created_by)
  values (v_f.entreprise_id, v_f.boutique_id, 'avoir', v_f.client_id, v_date,
    left('Avoir sur ' || v_f.numero || ' — ' || trim(p_motif), 2000), v_f.total_ht, v_f.total_tva, v_f.total_ttc,
    v_f.id, auth.uid())
  returning id into v_id;

  insert into public.lignes_documents_vente (document_id, entreprise_id, ordre, article_id, designation, quantite,
    unite, prix_unitaire, remise_pct, taux_tva_id, taux_tva, compte_vente_id, montant_ht, montant_tva, montant_ttc)
  select v_id, entreprise_id, ordre, article_id, designation, quantite, unite, prix_unitaire, remise_pct,
         taux_tva_id, taux_tva, compte_vente_id, montant_ht, montant_tva, montant_ttc
  from public.lignes_documents_vente where document_id = v_f.id;

  -- Écriture inverse de la facture : ventes et TVA au débit, client au crédit
  select coalesce((select jsonb_agg(jsonb_build_object('compte_id', compte_vente_id, 'debit', ht))
                   from (select compte_vente_id, sum(montant_ht)::bigint ht
                         from public.lignes_documents_vente where document_id = v_f.id
                         group by compte_vente_id having sum(montant_ht) > 0) v), '[]'::jsonb)
         || coalesce((select jsonb_agg(jsonb_build_object('compte_id', compte_collecte_id, 'debit', tva))
                      from (select t.compte_collecte_id, sum(l.montant_tva)::bigint tva
                            from public.lignes_documents_vente l
                            join public.taux_tva t on t.id = l.taux_tva_id
                            where l.document_id = v_f.id
                            group by t.compte_collecte_id having sum(l.montant_tva) > 0) t), '[]'::jsonb)
         || jsonb_build_array(jsonb_build_object(
              'compte_id', v_param.compte_clients_id, 'credit', v_f.total_ttc, 'client_id', v_client.id,
              'libelle', 'Avoir ' || v_numero || ' — ' || v_client.nom))
  into v_lignes;

  v_ecriture := prive.ecriture_automatique(
    v_f.entreprise_id, v_param.journal_ventes_id, v_date,
    'Avoir ' || v_numero || ' sur ' || v_f.numero || ' — ' || v_client.nom, v_numero, v_lignes, 'avoir', v_f.boutique_id);

  update public.documents_vente
  set statut = 'valide', numero = v_numero, ecriture_id = v_ecriture, valide_le = now(), valide_par = auth.uid()
  where id = v_id;

  update public.documents_vente set montant_avoir = total_ttc where id = v_f.id;
  return v_id;
end;
$$;

-- Situation des clients : facturé, réglé, avoirs, reste dû (factures validées)
create or replace function public.situation_clients(p_entreprise_id uuid)
returns table (
  client_id     uuid,
  nb_factures   integer,
  total_facture bigint,
  total_regle   bigint,
  total_avoir   bigint,
  reste_du      bigint,
  echu          bigint
)
language sql stable security invoker set search_path = ''
as $$
  select d.client_id, count(*)::integer,
         sum(d.total_ttc)::bigint, sum(d.montant_regle)::bigint, sum(d.montant_avoir)::bigint,
         sum(d.total_ttc - d.montant_regle - d.montant_avoir)::bigint,
         sum(case when d.date_echeance < current_date then d.total_ttc - d.montant_regle - d.montant_avoir else 0 end)::bigint
  from public.documents_vente d
  where d.entreprise_id = p_entreprise_id and d.type = 'facture' and d.statut = 'valide'
  group by d.client_id;
$$;

-- -----------------------------------------------------------------------------
-- Droits d'exécution
-- -----------------------------------------------------------------------------
revoke execute on function
  public.enregistrer_document_vente(uuid, text, uuid, uuid, date, jsonb, date, text, text, uuid),
  public.supprimer_document_vente(uuid),
  public.valider_document_vente(uuid, jsonb),
  public.enregistrer_reglement(uuid, bigint, uuid, text, date, text),
  public.transformer_devis(uuid),
  public.annuler_devis(uuid),
  public.creer_avoir(uuid, text, date),
  public.situation_clients(uuid)
from public, anon;

grant execute on function
  public.enregistrer_document_vente(uuid, text, uuid, uuid, date, jsonb, date, text, text, uuid),
  public.supprimer_document_vente(uuid),
  public.valider_document_vente(uuid, jsonb),
  public.enregistrer_reglement(uuid, bigint, uuid, text, date, text),
  public.transformer_devis(uuid),
  public.annuler_devis(uuid),
  public.creer_avoir(uuid, text, date),
  public.situation_clients(uuid)
to authenticated;
