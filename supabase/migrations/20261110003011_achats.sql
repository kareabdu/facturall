-- =============================================================================
-- FacturAll — Gestion commerciale : achats
--
--   • parametres_achat        : comptes et journal utilisés pour les écritures d'achat
--   • fournisseurs
--   • documents_achat         : factures et avoirs fournisseurs + lignes_documents_achat
--   • paiements_fournisseurs  : décaissements (caisse, banque, Mobile Money)
--
-- Règles garanties par la base :
--   • montants entiers FCFA calculés par la base (HT, TVA, TTC) ;
--   • numéro interne continu par type et par année : FF-2026-00001 (facture
--     fournisseur), AF-2026-00001 (avoir fournisseur), attribué à la validation ;
--     le numéro du fournisseur est obligatoire et unique par fournisseur ;
--   • une facture validée est inaltérable : on l'annule par un avoir ;
--   • la validation passe l'écriture au journal des achats (60x/2x et 4452 au
--     débit, 401 au crédit), un paiement l'écriture de trésorerie (401 / 5x) ;
--   • ces écritures automatiques ne peuvent pas être contre-passées à la main ;
--   • achats : propriétaire, admin, comptable, gestionnaire (dans leurs boutiques) ;
--     lecture : + lecteur. Les vendeurs n'y ont pas accès (prix d'achat, marges).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Droits
-- -----------------------------------------------------------------------------
create or replace function prive.est_acheteur(p_entreprise_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select prive.a_role(p_entreprise_id,
    array['proprietaire', 'admin', 'comptable', 'gestionnaire']::public.role_membre[]);
$$;

create or replace function prive.peut_lire_achats(p_entreprise_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select prive.a_role(p_entreprise_id,
    array['proprietaire', 'admin', 'comptable', 'gestionnaire', 'lecteur']::public.role_membre[]);
$$;

revoke all on function prive.est_acheteur(uuid), prive.peut_lire_achats(uuid) from public, anon;
grant execute on function prive.est_acheteur(uuid), prive.peut_lire_achats(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Paramètres d'achat
-- -----------------------------------------------------------------------------
create table public.parametres_achat (
  entreprise_id              uuid primary key references public.entreprises (id) on delete cascade,
  compte_fournisseurs_id     uuid not null,
  journal_achats_id          uuid not null,
  compte_achats_biens_id     uuid not null,
  compte_achats_services_id  uuid not null,
  delai_paiement_jours       smallint not null default 30 check (delai_paiement_jours between 0 and 365),
  updated_at                 timestamptz not null default now(),
  foreign key (compte_fournisseurs_id, entreprise_id) references public.comptes (id, entreprise_id),
  foreign key (journal_achats_id, entreprise_id) references public.journaux (id, entreprise_id),
  foreign key (compte_achats_biens_id, entreprise_id) references public.comptes (id, entreprise_id),
  foreign key (compte_achats_services_id, entreprise_id) references public.comptes (id, entreprise_id)
);
create index parametres_achat_fournisseurs_idx on public.parametres_achat (compte_fournisseurs_id, entreprise_id);
create index parametres_achat_journal_idx on public.parametres_achat (journal_achats_id, entreprise_id);
create index parametres_achat_biens_idx on public.parametres_achat (compte_achats_biens_id, entreprise_id);
create index parametres_achat_services_idx on public.parametres_achat (compte_achats_services_id, entreprise_id);

create trigger parametres_achat_updated_at
  before update on public.parametres_achat
  for each row execute function prive.maj_updated_at();

-- -----------------------------------------------------------------------------
-- Fournisseurs
-- -----------------------------------------------------------------------------
create table public.fournisseurs (
  id                   uuid primary key default gen_random_uuid(),
  entreprise_id        uuid not null references public.entreprises (id) on delete cascade,
  code                 text not null check (code ~ '^[A-Z0-9-]{2,20}$'),
  nom                  text not null check (length(trim(nom)) between 2 and 150),
  telephone            text check (telephone is null or length(telephone) <= 30),
  email                text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  adresse              text check (adresse is null or length(adresse) <= 300),
  ville                text check (ville is null or length(ville) <= 100),
  identifiant_fiscal   text check (identifiant_fiscal is null or length(identifiant_fiscal) <= 50),
  rccm                 text check (rccm is null or length(rccm) <= 50),
  delai_paiement_jours smallint check (delai_paiement_jours is null or delai_paiement_jours between 0 and 365),
  notes                text check (notes is null or length(notes) <= 2000),
  actif                boolean not null default true,
  created_by           uuid references auth.users (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (entreprise_id, code),
  unique (id, entreprise_id)
);
create index fournisseurs_entreprise_nom_idx on public.fournisseurs (entreprise_id, nom);
create index fournisseurs_created_by_idx on public.fournisseurs (created_by);

create trigger fournisseurs_updated_at
  before update on public.fournisseurs
  for each row execute function prive.maj_updated_at();

-- Code automatique FR0001, FR0002… (verrou par entreprise)
create or replace function prive.code_fournisseur()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  new.code := 'FR' || lpad(prive.prochain_numero(new.entreprise_id, 'fournisseur', 0)::text, 4, '0');
  new.created_by := auth.uid();
  return new;
end;
$$;

create trigger fournisseurs_code
  before insert on public.fournisseurs
  for each row execute function prive.code_fournisseur();

-- -----------------------------------------------------------------------------
-- Documents d'achat : factures et avoirs fournisseurs
-- -----------------------------------------------------------------------------
create table public.documents_achat (
  id                  uuid primary key default gen_random_uuid(),
  entreprise_id       uuid not null references public.entreprises (id) on delete cascade,
  boutique_id         uuid not null,
  type                text not null check (type in ('facture', 'avoir')),
  numero              text,
  numero_fournisseur  text check (numero_fournisseur is null or length(trim(numero_fournisseur)) between 1 and 60),
  statut              text not null default 'brouillon' check (statut in ('brouillon', 'valide')),
  fournisseur_id      uuid not null,
  date_document       date not null default current_date,
  date_echeance       date,
  notes               text check (notes is null or length(notes) <= 2000),
  total_ht            bigint not null default 0 check (total_ht >= 0),
  total_tva           bigint not null default 0 check (total_tva >= 0),
  total_ttc           bigint not null default 0 check (total_ttc >= 0),
  montant_paye        bigint not null default 0 check (montant_paye >= 0),
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
  foreign key (fournisseur_id, entreprise_id) references public.fournisseurs (id, entreprise_id),
  foreign key (document_origine_id, entreprise_id) references public.documents_achat (id, entreprise_id),
  foreign key (ecriture_id, entreprise_id) references public.ecritures (id, entreprise_id),
  check ((statut = 'brouillon') = (numero is null)),
  check (statut = 'brouillon' or type = 'avoir' or numero_fournisseur is not null),
  check (date_echeance is null or date_echeance >= date_document),
  check (montant_paye + montant_avoir <= total_ttc)
);
create unique index documents_achat_numero_unique
  on public.documents_achat (entreprise_id, type, numero) where numero is not null;
-- Une même facture fournisseur ne peut pas être saisie deux fois
create unique index documents_achat_numero_fournisseur_unique
  on public.documents_achat (entreprise_id, fournisseur_id, upper(trim(numero_fournisseur)))
  where type = 'facture' and statut = 'valide';
create index documents_achat_liste_idx on public.documents_achat (entreprise_id, type, date_document desc);
create index documents_achat_boutique_idx on public.documents_achat (boutique_id, entreprise_id);
create index documents_achat_fournisseur_idx on public.documents_achat (fournisseur_id, entreprise_id);
create index documents_achat_origine_idx on public.documents_achat (document_origine_id, entreprise_id);
create index documents_achat_ecriture_idx on public.documents_achat (ecriture_id, entreprise_id);
create index documents_achat_created_by_idx on public.documents_achat (created_by);
create index documents_achat_valide_par_idx on public.documents_achat (valide_par);

create trigger documents_achat_updated_at
  before update on public.documents_achat
  for each row execute function prive.maj_updated_at();

create table public.lignes_documents_achat (
  id               uuid primary key default gen_random_uuid(),
  document_id      uuid not null,
  entreprise_id    uuid not null,
  ordre            smallint not null,
  article_id       uuid,
  designation      text not null check (length(trim(designation)) between 1 and 300),
  quantite         numeric(14, 3) not null check (quantite > 0),
  unite            text,
  prix_unitaire    bigint not null check (prix_unitaire >= 0),
  remise_pct       numeric(5, 2) not null default 0 check (remise_pct >= 0 and remise_pct <= 100),
  taux_tva_id      uuid,
  taux_tva         numeric(5, 2) not null default 0,
  compte_charge_id uuid not null,
  montant_ht       bigint not null,
  montant_tva      bigint not null,
  montant_ttc      bigint not null,
  unique (document_id, ordre),
  foreign key (document_id, entreprise_id) references public.documents_achat (id, entreprise_id) on delete cascade,
  foreign key (article_id, entreprise_id) references public.articles (id, entreprise_id),
  foreign key (taux_tva_id, entreprise_id) references public.taux_tva (id, entreprise_id),
  foreign key (compte_charge_id, entreprise_id) references public.comptes (id, entreprise_id),
  check (montant_ttc = montant_ht + montant_tva)
);
create index lignes_documents_achat_document_idx on public.lignes_documents_achat (document_id, entreprise_id);
create index lignes_documents_achat_article_idx on public.lignes_documents_achat (article_id, entreprise_id);
create index lignes_documents_achat_taux_idx on public.lignes_documents_achat (taux_tva_id, entreprise_id);
create index lignes_documents_achat_compte_idx on public.lignes_documents_achat (compte_charge_id, entreprise_id);

-- -----------------------------------------------------------------------------
-- Paiements aux fournisseurs
-- -----------------------------------------------------------------------------
create table public.paiements_fournisseurs (
  id             uuid primary key default gen_random_uuid(),
  entreprise_id  uuid not null references public.entreprises (id) on delete cascade,
  boutique_id    uuid not null,
  document_id    uuid not null,
  fournisseur_id uuid not null,
  date_paiement  date not null,
  montant        bigint not null check (montant > 0),
  mode           text not null check (mode in ('especes', 'mobile_money', 'virement', 'cheque', 'carte', 'autre')),
  journal_id     uuid not null,
  reference      text check (reference is null or length(reference) <= 60),
  ecriture_id    uuid not null,
  created_by     uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  foreign key (boutique_id, entreprise_id) references public.boutiques (id, entreprise_id),
  foreign key (document_id, entreprise_id) references public.documents_achat (id, entreprise_id),
  foreign key (fournisseur_id, entreprise_id) references public.fournisseurs (id, entreprise_id),
  foreign key (journal_id, entreprise_id) references public.journaux (id, entreprise_id),
  foreign key (ecriture_id, entreprise_id) references public.ecritures (id, entreprise_id)
);
create index paiements_fournisseurs_document_idx on public.paiements_fournisseurs (document_id, entreprise_id);
create index paiements_fournisseurs_boutique_idx on public.paiements_fournisseurs (boutique_id, entreprise_id);
create index paiements_fournisseurs_fournisseur_idx on public.paiements_fournisseurs (fournisseur_id, entreprise_id);
create index paiements_fournisseurs_journal_idx on public.paiements_fournisseurs (journal_id, entreprise_id);
create index paiements_fournisseurs_ecriture_idx on public.paiements_fournisseurs (ecriture_id, entreprise_id);
create index paiements_fournisseurs_created_by_idx on public.paiements_fournisseurs (created_by);
create index paiements_fournisseurs_date_idx on public.paiements_fournisseurs (entreprise_id, date_paiement desc);

-- Tiers fournisseur sur les lignes d'écriture (compte 401)
alter table public.ecriture_lignes add column fournisseur_id uuid;
alter table public.ecriture_lignes
  add foreign key (fournisseur_id, entreprise_id) references public.fournisseurs (id, entreprise_id);
create index ecriture_lignes_fournisseur_idx on public.ecriture_lignes (fournisseur_id, entreprise_id);

-- -----------------------------------------------------------------------------
-- Inaltérabilité
-- -----------------------------------------------------------------------------
create or replace function prive.proteger_documents_achat()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if coalesce(current_setting('facturall.purge', true), '') = 'on' or old.statut = 'brouillon' then
    return coalesce(new, old);
  end if;
  if tg_op = 'DELETE' then
    raise exception 'Le document % est validé : il ne peut pas être supprimé.', old.numero using errcode = '42501';
  end if;
  if (to_jsonb(new) - array['montant_paye', 'montant_avoir', 'updated_at'])
     is distinct from (to_jsonb(old) - array['montant_paye', 'montant_avoir', 'updated_at']) then
    raise exception 'Le document % est validé : il ne peut plus être modifié (établissez un avoir).', old.numero
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger documents_achat_inalterables
  before update or delete on public.documents_achat
  for each row execute function prive.proteger_documents_achat();

create or replace function prive.proteger_lignes_achat()
returns trigger language plpgsql set search_path = ''
as $$
declare
  v_statut text;
begin
  if coalesce(current_setting('facturall.purge', true), '') = 'on' then
    return coalesce(new, old);
  end if;
  select statut into v_statut from public.documents_achat where id = coalesce(new.document_id, old.document_id);
  if v_statut is not null and v_statut <> 'brouillon' then
    raise exception 'Les lignes d''un document validé ne peuvent plus être modifiées.' using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger lignes_documents_achat_inalterables
  before insert or update or delete on public.lignes_documents_achat
  for each row execute function prive.proteger_lignes_achat();

create or replace function prive.proteger_paiements_fournisseurs()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if coalesce(current_setting('facturall.purge', true), '') = 'on' then
    return coalesce(new, old);
  end if;
  raise exception 'Un paiement enregistré ne peut être ni modifié ni supprimé.' using errcode = '42501';
end;
$$;

create trigger paiements_fournisseurs_inalterables
  before update or delete on public.paiements_fournisseurs
  for each row execute function prive.proteger_paiements_fournisseurs();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.parametres_achat       enable row level security;
alter table public.fournisseurs           enable row level security;
alter table public.documents_achat        enable row level security;
alter table public.lignes_documents_achat enable row level security;
alter table public.paiements_fournisseurs enable row level security;

revoke all on public.parametres_achat, public.fournisseurs, public.documents_achat,
  public.lignes_documents_achat, public.paiements_fournisseurs from anon, authenticated;

grant select on public.parametres_achat, public.fournisseurs, public.documents_achat,
  public.lignes_documents_achat, public.paiements_fournisseurs to authenticated;
grant update (compte_fournisseurs_id, journal_achats_id, compte_achats_biens_id, compte_achats_services_id,
              delai_paiement_jours) on public.parametres_achat to authenticated;
grant insert (entreprise_id, nom, telephone, email, adresse, ville, identifiant_fiscal, rccm,
              delai_paiement_jours, notes) on public.fournisseurs to authenticated;
grant update (nom, telephone, email, adresse, ville, identifiant_fiscal, rccm,
              delai_paiement_jours, notes, actif) on public.fournisseurs to authenticated;

create policy "parametres_achat : lecture" on public.parametres_achat for select to authenticated
  using (prive.peut_lire_achats(entreprise_id));
create policy "parametres_achat : modification comptable" on public.parametres_achat for update to authenticated
  using (prive.est_compta(entreprise_id)) with check (prive.est_compta(entreprise_id));

create policy "fournisseurs : lecture" on public.fournisseurs for select to authenticated
  using (prive.peut_lire_achats(entreprise_id));
create policy "fournisseurs : ajout" on public.fournisseurs for insert to authenticated
  with check (prive.est_acheteur(entreprise_id));
create policy "fournisseurs : modification" on public.fournisseurs for update to authenticated
  using (prive.est_acheteur(entreprise_id)) with check (prive.est_acheteur(entreprise_id));

create policy "documents_achat : lecture selon la boutique" on public.documents_achat for select to authenticated
  using (prive.peut_lire_achats(entreprise_id) and prive.peut_acceder_boutique(boutique_id, entreprise_id));
create policy "lignes_documents_achat : lecture selon le document" on public.lignes_documents_achat
  for select to authenticated
  using (exists (select 1 from public.documents_achat d where d.id = document_id));
create policy "paiements_fournisseurs : lecture selon la boutique" on public.paiements_fournisseurs
  for select to authenticated
  using (prive.peut_lire_achats(entreprise_id) and prive.peut_acceder_boutique(boutique_id, entreprise_id));

-- =============================================================================
-- Initialisation des achats d'une entreprise
-- =============================================================================
create or replace function prive.initialiser_achats(p_entreprise_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  c record;
begin
  select
    (select id from public.comptes where entreprise_id = p_entreprise_id and numero = '401')  as fournisseurs,
    (select id from public.journaux where entreprise_id = p_entreprise_id and code = 'AC')    as journal,
    (select id from public.comptes where entreprise_id = p_entreprise_id and numero = '601')  as biens,
    (select id from public.comptes where entreprise_id = p_entreprise_id and numero = '6057') as services
  into c;

  if c.fournisseurs is null or c.journal is null or c.biens is null or c.services is null then
    return; -- comptabilité non initialisée
  end if;

  insert into public.parametres_achat (entreprise_id, compte_fournisseurs_id, journal_achats_id,
                                       compte_achats_biens_id, compte_achats_services_id)
  values (p_entreprise_id, c.fournisseurs, c.journal, c.biens, c.services)
  on conflict (entreprise_id) do nothing;
end;
$$;
revoke all on function prive.initialiser_achats(uuid) from public, anon, authenticated;

create or replace function prive.apres_creation_entreprise_achats()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  perform prive.initialiser_achats(new.id);
  return new;
end;
$$;

-- Nom choisi pour s'exécuter après « entreprises_initialiser_comptabilite » (ordre alphabétique)
create trigger entreprises_initialiser_e_achats
  after insert on public.entreprises
  for each row execute function prive.apres_creation_entreprise_achats();

do $$
declare
  v_id uuid;
begin
  for v_id in select id from public.entreprises loop
    perform prive.initialiser_achats(v_id);
  end loop;
end;
$$;

-- =============================================================================
-- Écritures automatiques : prise en charge du tiers fournisseur
-- =============================================================================
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
  v_fournisseur uuid;
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

    v_fournisseur := nullif(v_ligne ->> 'fournisseur_id', '')::uuid;
    if v_fournisseur is not null and not exists (
      select 1 from public.fournisseurs where id = v_fournisseur and entreprise_id = p_entreprise_id
    ) then
      raise exception 'Ligne % : fournisseur introuvable.', v_ordre using errcode = '22023';
    end if;

    insert into public.ecriture_lignes (ecriture_id, entreprise_id, ordre, compte_id, libelle, debit, credit,
                                        client_id, fournisseur_id)
    values (p_ecriture_id, p_entreprise_id, v_ordre, v_compte.id,
            nullif(trim(v_ligne ->> 'libelle'), ''), v_debit, v_credit, v_client, v_fournisseur);

    v_compte := null;
  end loop;
end;
$$;
revoke all on function prive.ecrire_lignes(uuid, uuid, jsonb) from public, anon, authenticated;

-- Contre-passation : interdite aussi pour les écritures des achats ; recopie des tiers.
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
  if v_e.origine in ('achat', 'avoir_achat', 'paiement_fournisseur') then
    raise exception 'Cette écriture provient des achats : annulez la facture fournisseur par un avoir.'
      using errcode = '22023';
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

  insert into public.ecriture_lignes (ecriture_id, entreprise_id, ordre, compte_id, libelle, debit, credit,
                                      client_id, fournisseur_id)
  select v_id, l.entreprise_id, l.ordre, l.compte_id, l.libelle, l.credit, l.debit, l.client_id, l.fournisseur_id
  from public.ecriture_lignes l where l.ecriture_id = p_ecriture_id;

  perform prive.valider(v_id);
  return v_id;
end;
$$;

-- =============================================================================
-- Fonctions RPC des achats
-- =============================================================================

create or replace function prive.verifier_acheteur_boutique(p_entreprise_id uuid, p_boutique_id uuid)
returns void language plpgsql stable security definer set search_path = ''
as $$
begin
  if not prive.est_acheteur(p_entreprise_id) then
    raise exception 'Droits insuffisants pour les achats.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.boutiques b where b.id = p_boutique_id and b.entreprise_id = p_entreprise_id and b.active)
     or not prive.peut_acceder_boutique(p_boutique_id, p_entreprise_id) then
    raise exception 'Boutique introuvable, désactivée ou non autorisée.' using errcode = '42501';
  end if;
end;
$$;
revoke all on function prive.verifier_acheteur_boutique(uuid, uuid) from public, anon, authenticated;

-- Crée ou met à jour une facture fournisseur brouillon.
-- p_lignes : [{ "article_id"?, "designation", "quantite", "prix_unitaire", "remise_pct"?, "taux_tva_id"?,
--              "compte_charge_id"?, "unite"? }]
create or replace function public.enregistrer_document_achat(
  p_entreprise_id      uuid,
  p_boutique_id        uuid,
  p_fournisseur_id     uuid,
  p_date               date,
  p_lignes             jsonb,
  p_numero_fournisseur text default null,
  p_date_echeance      date default null,
  p_notes              text default null,
  p_document_id        uuid default null
)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid := p_document_id;
  v_param public.parametres_achat;
  v_fournisseur public.fournisseurs;
  v_article public.articles;
  v_taux public.taux_tva;
  v_compte public.comptes;
  v_ligne jsonb;
  v_ordre smallint := 0;
  v_qte numeric;
  v_pu bigint;
  v_remise numeric;
  v_ht bigint;
  v_tva bigint;
  v_compte_id uuid;
  v_designation text;
  v_echeance date;
begin
  perform prive.verifier_acheteur_boutique(p_entreprise_id, p_boutique_id);

  select * into v_param from public.parametres_achat where entreprise_id = p_entreprise_id;
  if v_param.entreprise_id is null then
    raise exception 'Les paramètres d''achat de l''entreprise sont manquants.' using errcode = '22023';
  end if;
  select * into v_fournisseur from public.fournisseurs where id = p_fournisseur_id and entreprise_id = p_entreprise_id;
  if v_fournisseur.id is null or not v_fournisseur.actif then
    raise exception 'Fournisseur introuvable ou désactivé.' using errcode = '22023';
  end if;
  if p_lignes is null or jsonb_typeof(p_lignes) <> 'array' or jsonb_array_length(p_lignes) = 0 then
    raise exception 'Ajoutez au moins une ligne.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_lignes) > 300 then
    raise exception 'Trop de lignes (300 au maximum).' using errcode = '22023';
  end if;

  v_echeance := coalesce(p_date_echeance,
    coalesce(p_date, current_date) + coalesce(v_fournisseur.delai_paiement_jours, v_param.delai_paiement_jours));

  if v_id is null then
    insert into public.documents_achat (entreprise_id, boutique_id, type, fournisseur_id, numero_fournisseur,
                                        date_document, date_echeance, notes, created_by)
    values (p_entreprise_id, p_boutique_id, 'facture', p_fournisseur_id, nullif(trim(p_numero_fournisseur), ''),
            coalesce(p_date, current_date), v_echeance, nullif(trim(p_notes), ''), auth.uid())
    returning id into v_id;
  else
    update public.documents_achat
    set boutique_id = p_boutique_id, fournisseur_id = p_fournisseur_id,
        numero_fournisseur = nullif(trim(p_numero_fournisseur), ''),
        date_document = coalesce(p_date, current_date), date_echeance = v_echeance, notes = nullif(trim(p_notes), '')
    where id = v_id and entreprise_id = p_entreprise_id and type = 'facture' and statut = 'brouillon'
      and prive.peut_acceder_boutique(boutique_id, entreprise_id);
    if not found then
      raise exception 'Brouillon introuvable (ou document déjà validé).' using errcode = '22023';
    end if;
    delete from public.lignes_documents_achat where document_id = v_id;
  end if;

  for v_ligne in select * from jsonb_array_elements(p_lignes) loop
    v_ordre := v_ordre + 1;
    v_article := null;
    v_taux := null;
    v_compte := null;

    if nullif(v_ligne ->> 'article_id', '') is not null then
      select * into v_article from public.articles
      where id = (v_ligne ->> 'article_id')::uuid and entreprise_id = p_entreprise_id;
      if v_article.id is null then
        raise exception 'Ligne % : article introuvable.', v_ordre using errcode = '22023';
      end if;
    end if;

    begin
      v_qte    := coalesce(nullif(v_ligne ->> 'quantite', ''), '1')::numeric;
      v_pu     := coalesce(nullif(v_ligne ->> 'prix_unitaire', ''), '0')::bigint;
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
    if v_taux.taux > 0 and v_taux.compte_deductible_id is null then
      raise exception 'Ligne % : le taux « % » n''a pas de compte de TVA déductible.', v_ordre, v_taux.libelle
        using errcode = '22023';
    end if;

    -- Compte : celui de la ligne, sinon selon le type d'article (biens / services)
    v_compte_id := coalesce(nullif(v_ligne ->> 'compte_charge_id', '')::uuid,
      case when v_article.type = 'service' then v_param.compte_achats_services_id
           else v_param.compte_achats_biens_id end);
    select * into v_compte from public.comptes where id = v_compte_id and entreprise_id = p_entreprise_id;
    if v_compte.id is null or not v_compte.actif or not v_compte.mouvementable or v_compte.classe not in (2, 6) then
      raise exception 'Ligne % : choisissez un compte de charge (classe 6) ou d''immobilisation (classe 2) mouvementable.',
        v_ordre using errcode = '22023';
    end if;

    v_designation := coalesce(nullif(trim(v_ligne ->> 'designation'), ''), v_article.designation);
    if v_designation is null then
      raise exception 'Ligne % : désignation obligatoire.', v_ordre using errcode = '22023';
    end if;

    v_ht  := round(v_qte * v_pu * (1 - v_remise / 100));
    v_tva := round(v_ht * v_taux.taux / 100);

    insert into public.lignes_documents_achat (document_id, entreprise_id, ordre, article_id, designation, quantite,
      unite, prix_unitaire, remise_pct, taux_tva_id, taux_tva, compte_charge_id, montant_ht, montant_tva, montant_ttc)
    values (v_id, p_entreprise_id, v_ordre, v_article.id, left(v_designation, 300), v_qte,
      coalesce(nullif(trim(v_ligne ->> 'unite'), ''), v_article.unite), v_pu, v_remise, v_taux.id, v_taux.taux,
      v_compte.id, v_ht, v_tva, v_ht + v_tva);
  end loop;

  update public.documents_achat d
  set total_ht = s.ht, total_tva = s.tva, total_ttc = s.ht + s.tva
  from (select coalesce(sum(montant_ht), 0)::bigint ht, coalesce(sum(montant_tva), 0)::bigint tva
        from public.lignes_documents_achat where document_id = v_id) s
  where d.id = v_id;

  return v_id;
end;
$$;

create or replace function public.supprimer_document_achat(p_document_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_d public.documents_achat;
begin
  select * into v_d from public.documents_achat where id = p_document_id;
  if v_d.id is null then
    raise exception 'Document introuvable.' using errcode = '22023';
  end if;
  perform prive.verifier_acheteur_boutique(v_d.entreprise_id, v_d.boutique_id);
  delete from public.documents_achat where id = p_document_id; -- refusé par trigger si validé
end;
$$;

-- Paiement d'une facture fournisseur validée, avec son écriture de trésorerie (401 / 5x).
create or replace function public.enregistrer_paiement_fournisseur(
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
  v_d public.documents_achat;
  v_j public.journaux;
  v_f public.fournisseurs;
  v_param public.parametres_achat;
  v_ecriture uuid;
  v_id uuid;
  v_date date := coalesce(p_date, current_date);
begin
  select * into v_d from public.documents_achat where id = p_document_id for update;
  if v_d.id is null then
    raise exception 'Facture introuvable.' using errcode = '22023';
  end if;
  perform prive.verifier_acheteur_boutique(v_d.entreprise_id, v_d.boutique_id);
  if v_d.type <> 'facture' or v_d.statut <> 'valide' then
    raise exception 'Seule une facture fournisseur validée peut être payée.' using errcode = '22023';
  end if;
  if p_montant is null or p_montant <= 0 then
    raise exception 'Le montant doit être supérieur à zéro.' using errcode = '22023';
  end if;
  if p_montant > v_d.total_ttc - v_d.montant_paye - v_d.montant_avoir then
    raise exception 'Le montant dépasse le reste à payer (% FCFA).',
      v_d.total_ttc - v_d.montant_paye - v_d.montant_avoir using errcode = '22023';
  end if;
  if p_mode not in ('especes', 'mobile_money', 'virement', 'cheque', 'carte', 'autre') then
    raise exception 'Mode de paiement invalide.' using errcode = '22023';
  end if;

  select * into v_j from public.journaux where id = p_journal_id and entreprise_id = v_d.entreprise_id;
  if v_j.id is null or v_j.compte_tresorerie_id is null or not v_j.actif then
    raise exception 'Choisissez une caisse, une banque ou un compte Mobile Money.' using errcode = '22023';
  end if;

  select * into v_f from public.fournisseurs where id = v_d.fournisseur_id;
  select * into v_param from public.parametres_achat where entreprise_id = v_d.entreprise_id;

  v_ecriture := prive.ecriture_automatique(
    v_d.entreprise_id, v_j.id, v_date,
    'Paiement ' || v_d.numero || ' (' || v_d.numero_fournisseur || ') — ' || v_f.nom,
    coalesce(nullif(trim(p_reference), ''), v_d.numero),
    jsonb_build_array(
      jsonb_build_object('compte_id', v_param.compte_fournisseurs_id, 'debit', p_montant, 'fournisseur_id', v_f.id),
      jsonb_build_object('compte_id', v_j.compte_tresorerie_id, 'credit', p_montant)
    ),
    'paiement_fournisseur', v_d.boutique_id);

  insert into public.paiements_fournisseurs (entreprise_id, boutique_id, document_id, fournisseur_id, date_paiement,
                                             montant, mode, journal_id, reference, ecriture_id, created_by)
  values (v_d.entreprise_id, v_d.boutique_id, v_d.id, v_d.fournisseur_id, v_date, p_montant,
          p_mode, v_j.id, nullif(trim(p_reference), ''), v_ecriture, auth.uid())
  returning id into v_id;

  update public.documents_achat set montant_paye = montant_paye + p_montant where id = v_d.id;
  return v_id;
end;
$$;

-- Valide une facture fournisseur : numéro FF + écriture au journal des achats.
-- p_paiement facultatif : { "montant", "journal_id", "mode", "reference" } (paiement comptant).
create or replace function public.valider_document_achat(p_document_id uuid, p_paiement jsonb default null)
returns text language plpgsql security definer set search_path = ''
as $$
declare
  v_d public.documents_achat;
  v_f public.fournisseurs;
  v_param public.parametres_achat;
  v_numero text;
  v_lignes jsonb;
  v_ecriture uuid;
begin
  select * into v_d from public.documents_achat where id = p_document_id for update;
  if v_d.id is null then
    raise exception 'Document introuvable.' using errcode = '22023';
  end if;
  perform prive.verifier_acheteur_boutique(v_d.entreprise_id, v_d.boutique_id);
  if v_d.statut <> 'brouillon' then
    raise exception 'Ce document est déjà validé.' using errcode = '22023';
  end if;
  if v_d.numero_fournisseur is null then
    raise exception 'Indiquez le numéro de la facture du fournisseur.' using errcode = '22023';
  end if;
  if v_d.total_ttc <= 0 then
    raise exception 'Une facture doit avoir un montant positif.' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.documents_achat
    where entreprise_id = v_d.entreprise_id and fournisseur_id = v_d.fournisseur_id and type = 'facture'
      and statut = 'valide' and upper(trim(numero_fournisseur)) = upper(trim(v_d.numero_fournisseur))
  ) then
    raise exception 'La facture n° % de ce fournisseur est déjà enregistrée.', v_d.numero_fournisseur
      using errcode = '23505';
  end if;

  select * into v_f from public.fournisseurs where id = v_d.fournisseur_id;
  select * into v_param from public.parametres_achat where entreprise_id = v_d.entreprise_id;

  v_numero := 'FF-' || extract(year from v_d.date_document)::text || '-' ||
              lpad(prive.prochain_numero(v_d.entreprise_id, 'facture_achat',
                   extract(year from v_d.date_document)::integer)::text, 5, '0');

  -- Charges HT par compte et TVA déductible au débit, 401 au crédit (TTC)
  select coalesce((select jsonb_agg(jsonb_build_object('compte_id', compte_charge_id, 'debit', ht))
                   from (select compte_charge_id, sum(montant_ht)::bigint ht
                         from public.lignes_documents_achat where document_id = v_d.id
                         group by compte_charge_id having sum(montant_ht) > 0) c), '[]'::jsonb)
         || coalesce((select jsonb_agg(jsonb_build_object('compte_id', compte_deductible_id, 'debit', tva))
                      from (select t.compte_deductible_id, sum(l.montant_tva)::bigint tva
                            from public.lignes_documents_achat l
                            join public.taux_tva t on t.id = l.taux_tva_id
                            where l.document_id = v_d.id
                            group by t.compte_deductible_id having sum(l.montant_tva) > 0) t), '[]'::jsonb)
         || jsonb_build_array(jsonb_build_object(
              'compte_id', v_param.compte_fournisseurs_id, 'credit', v_d.total_ttc, 'fournisseur_id', v_f.id,
              'libelle', 'Facture ' || v_d.numero_fournisseur || ' — ' || v_f.nom))
  into v_lignes;

  v_ecriture := prive.ecriture_automatique(
    v_d.entreprise_id, v_param.journal_achats_id, v_d.date_document,
    'Facture ' || v_d.numero_fournisseur || ' — ' || v_f.nom, v_numero, v_lignes, 'achat', v_d.boutique_id);

  update public.documents_achat
  set statut = 'valide', numero = v_numero, ecriture_id = v_ecriture, valide_le = now(), valide_par = auth.uid()
  where id = v_d.id;

  if p_paiement is not null and coalesce((p_paiement ->> 'montant')::bigint, 0) > 0 then
    perform public.enregistrer_paiement_fournisseur(
      v_d.id, (p_paiement ->> 'montant')::bigint, (p_paiement ->> 'journal_id')::uuid,
      coalesce(p_paiement ->> 'mode', 'especes'), v_d.date_document, p_paiement ->> 'reference');
  end if;

  return v_numero;
end;
$$;

-- Avoir fournisseur total sur une facture non payée : document AF + écriture inverse.
create or replace function public.creer_avoir_achat(
  p_facture_id         uuid,
  p_motif              text,
  p_date               date default current_date,
  p_numero_fournisseur text default null
)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_fa public.documents_achat;
  v_f public.fournisseurs;
  v_param public.parametres_achat;
  v_id uuid;
  v_numero text;
  v_lignes jsonb;
  v_ecriture uuid;
  v_date date := coalesce(p_date, current_date);
begin
  select * into v_fa from public.documents_achat where id = p_facture_id for update;
  if v_fa.id is null or v_fa.type <> 'facture' then
    raise exception 'Facture introuvable.' using errcode = '22023';
  end if;
  perform prive.verifier_acheteur_boutique(v_fa.entreprise_id, v_fa.boutique_id);
  if v_fa.statut <> 'valide' then
    raise exception 'Seule une facture validée peut faire l''objet d''un avoir.' using errcode = '22023';
  end if;
  if v_fa.montant_paye > 0 or v_fa.montant_avoir > 0 then
    raise exception 'Cette facture a déjà des paiements ou un avoir : l''avoir total est impossible.' using errcode = '22023';
  end if;
  if coalesce(trim(p_motif), '') = '' then
    raise exception 'Indiquez le motif de l''avoir.' using errcode = '22023';
  end if;
  if v_date < v_fa.date_document then
    raise exception 'L''avoir ne peut pas être antérieur à la facture.' using errcode = '22023';
  end if;

  select * into v_f from public.fournisseurs where id = v_fa.fournisseur_id;
  select * into v_param from public.parametres_achat where entreprise_id = v_fa.entreprise_id;

  v_numero := 'AF-' || extract(year from v_date)::text || '-' ||
              lpad(prive.prochain_numero(v_fa.entreprise_id, 'avoir_achat', extract(year from v_date)::integer)::text, 5, '0');

  insert into public.documents_achat (entreprise_id, boutique_id, type, fournisseur_id, numero_fournisseur,
    date_document, notes, total_ht, total_tva, total_ttc, document_origine_id, created_by)
  values (v_fa.entreprise_id, v_fa.boutique_id, 'avoir', v_fa.fournisseur_id, nullif(trim(p_numero_fournisseur), ''),
    v_date, left('Avoir sur ' || v_fa.numero_fournisseur || ' — ' || trim(p_motif), 2000),
    v_fa.total_ht, v_fa.total_tva, v_fa.total_ttc, v_fa.id, auth.uid())
  returning id into v_id;

  insert into public.lignes_documents_achat (document_id, entreprise_id, ordre, article_id, designation, quantite,
    unite, prix_unitaire, remise_pct, taux_tva_id, taux_tva, compte_charge_id, montant_ht, montant_tva, montant_ttc)
  select v_id, entreprise_id, ordre, article_id, designation, quantite, unite, prix_unitaire, remise_pct,
         taux_tva_id, taux_tva, compte_charge_id, montant_ht, montant_tva, montant_ttc
  from public.lignes_documents_achat where document_id = v_fa.id;

  -- Écriture inverse : 401 au débit, charges et TVA déductible au crédit
  select jsonb_build_array(jsonb_build_object(
           'compte_id', v_param.compte_fournisseurs_id, 'debit', v_fa.total_ttc, 'fournisseur_id', v_f.id,
           'libelle', 'Avoir ' || v_numero || ' — ' || v_f.nom))
         || coalesce((select jsonb_agg(jsonb_build_object('compte_id', compte_charge_id, 'credit', ht))
                      from (select compte_charge_id, sum(montant_ht)::bigint ht
                            from public.lignes_documents_achat where document_id = v_fa.id
                            group by compte_charge_id having sum(montant_ht) > 0) c), '[]'::jsonb)
         || coalesce((select jsonb_agg(jsonb_build_object('compte_id', compte_deductible_id, 'credit', tva))
                      from (select t.compte_deductible_id, sum(l.montant_tva)::bigint tva
                            from public.lignes_documents_achat l
                            join public.taux_tva t on t.id = l.taux_tva_id
                            where l.document_id = v_fa.id
                            group by t.compte_deductible_id having sum(l.montant_tva) > 0) t), '[]'::jsonb)
  into v_lignes;

  v_ecriture := prive.ecriture_automatique(
    v_fa.entreprise_id, v_param.journal_achats_id, v_date,
    'Avoir ' || v_numero || ' sur ' || v_fa.numero_fournisseur || ' — ' || v_f.nom, v_numero, v_lignes,
    'avoir_achat', v_fa.boutique_id);

  update public.documents_achat
  set statut = 'valide', numero = v_numero, ecriture_id = v_ecriture, valide_le = now(), valide_par = auth.uid()
  where id = v_id;

  update public.documents_achat set montant_avoir = total_ttc where id = v_fa.id;
  return v_id;
end;
$$;

-- Situation des fournisseurs : facturé, payé, avoirs, reste à payer
create or replace function public.situation_fournisseurs(p_entreprise_id uuid)
returns table (
  fournisseur_id uuid,
  nb_factures    integer,
  total_facture  bigint,
  total_paye     bigint,
  total_avoir    bigint,
  reste_a_payer  bigint,
  echu           bigint
)
language sql stable security invoker set search_path = ''
as $$
  select d.fournisseur_id, count(*)::integer,
         sum(d.total_ttc)::bigint, sum(d.montant_paye)::bigint, sum(d.montant_avoir)::bigint,
         sum(d.total_ttc - d.montant_paye - d.montant_avoir)::bigint,
         sum(case when d.date_echeance < current_date then d.total_ttc - d.montant_paye - d.montant_avoir else 0 end)::bigint
  from public.documents_achat d
  where d.entreprise_id = p_entreprise_id and d.type = 'facture' and d.statut = 'valide'
  group by d.fournisseur_id;
$$;

-- -----------------------------------------------------------------------------
-- Droits d'exécution
-- -----------------------------------------------------------------------------
revoke execute on function
  public.enregistrer_document_achat(uuid, uuid, uuid, date, jsonb, text, date, text, uuid),
  public.supprimer_document_achat(uuid),
  public.valider_document_achat(uuid, jsonb),
  public.enregistrer_paiement_fournisseur(uuid, bigint, uuid, text, date, text),
  public.creer_avoir_achat(uuid, text, date, text),
  public.situation_fournisseurs(uuid)
from public, anon;

grant execute on function
  public.enregistrer_document_achat(uuid, uuid, uuid, date, jsonb, text, date, text, uuid),
  public.supprimer_document_achat(uuid),
  public.valider_document_achat(uuid, jsonb),
  public.enregistrer_paiement_fournisseur(uuid, bigint, uuid, text, date, text),
  public.creer_avoir_achat(uuid, text, date, text),
  public.situation_fournisseurs(uuid)
to authenticated;
