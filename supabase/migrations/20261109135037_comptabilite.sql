-- =============================================================================
-- FacturAll — Comptabilité générale SYSCOHADA révisé
--
--   • prive.plan_syscohada : plan de base (référence commune, non exposée)
--   • comptes   : plan comptable propre à chaque entreprise (copié du plan de base)
--   • exercices : exercices comptables (année civile par défaut, OHADA)
--   • journaux  : achats, ventes, banque, caisse, monnaie électronique, OD, à-nouveaux
--   • ecritures + ecriture_lignes : partie double, montants entiers XOF
--
-- Règles garanties par la base :
--   • une écriture validée est équilibrée (Σ débit = Σ crédit > 0, au moins 2 lignes) ;
--   • une écriture validée ne peut plus être modifiée ni supprimée : on la contre-passe ;
--   • numérotation continue et sans trou par journal et par exercice, attribuée à la validation ;
--   • date dans un exercice ouvert ; comptes et journaux de la même entreprise ;
--   • seules les écritures validées entrent dans la balance et le grand livre ;
--   • lecture : propriétaire, admin, comptable, lecteur — écriture : propriétaire, admin, comptable.
--   • toutes les écritures passent par des fonctions (pas d'INSERT direct via l'API).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Droits comptables
-- -----------------------------------------------------------------------------
create or replace function prive.est_compta(p_entreprise_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select prive.a_role(p_entreprise_id, array['proprietaire', 'admin', 'comptable']::public.role_membre[]);
$$;

create or replace function prive.peut_lire_compta(p_entreprise_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select prive.a_role(p_entreprise_id, array['proprietaire', 'admin', 'comptable', 'lecteur']::public.role_membre[]);
$$;

revoke all on function prive.est_compta(uuid), prive.peut_lire_compta(uuid) from public, anon;
grant execute on function prive.est_compta(uuid), prive.peut_lire_compta(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Plan de base SYSCOHADA révisé (comptes principaux d'une PME commerciale)
-- Les entreprises peuvent ensuite créer leurs sous-comptes.
-- -----------------------------------------------------------------------------
create table prive.plan_syscohada (
  numero  text primary key check (numero ~ '^[1-9][0-9]{1,11}$'),
  libelle text not null
);

insert into prive.plan_syscohada (numero, libelle) values
  -- Classe 1 : ressources durables
  ('10', 'Capital'),
  ('101', 'Capital social'),
  ('103', 'Capital personnel'),
  ('104', 'Compte de l''exploitant'),
  ('105', 'Primes liées au capital social'),
  ('106', 'Écarts de réévaluation'),
  ('109', 'Apporteurs, capital souscrit non appelé'),
  ('11', 'Réserves'),
  ('111', 'Réserve légale'),
  ('112', 'Réserves statutaires ou contractuelles'),
  ('113', 'Réserves réglementées'),
  ('118', 'Autres réserves'),
  ('12', 'Report à nouveau'),
  ('121', 'Report à nouveau créditeur'),
  ('129', 'Report à nouveau débiteur'),
  ('13', 'Résultat net de l''exercice'),
  ('131', 'Résultat net : bénéfice'),
  ('139', 'Résultat net : perte'),
  ('14', 'Subventions d''investissement'),
  ('15', 'Provisions réglementées et fonds assimilés'),
  ('16', 'Emprunts et dettes assimilées'),
  ('161', 'Emprunts obligataires'),
  ('162', 'Emprunts et dettes auprès des établissements de crédit'),
  ('165', 'Dépôts et cautionnements reçus'),
  ('166', 'Intérêts courus'),
  ('168', 'Autres emprunts et dettes'),
  ('17', 'Dettes de location-acquisition'),
  ('18', 'Dettes liées à des participations et comptes de liaison des établissements'),
  ('19', 'Provisions pour risques et charges'),
  -- Classe 2 : actif immobilisé
  ('21', 'Immobilisations incorporelles'),
  ('211', 'Frais de développement'),
  ('212', 'Brevets, licences, concessions et droits similaires'),
  ('213', 'Logiciels et sites internet'),
  ('214', 'Marques'),
  ('215', 'Fonds commercial'),
  ('216', 'Droit au bail'),
  ('22', 'Terrains'),
  ('23', 'Bâtiments, installations techniques et agencements'),
  ('231', 'Bâtiments sur sol propre'),
  ('234', 'Aménagements, agencements et installations techniques'),
  ('235', 'Aménagements de bureaux'),
  ('24', 'Matériel, mobilier et actifs biologiques'),
  ('241', 'Matériel et outillage industriel et commercial'),
  ('244', 'Matériel et mobilier de bureau'),
  ('245', 'Matériel de transport'),
  ('25', 'Avances et acomptes versés sur immobilisations'),
  ('26', 'Titres de participation'),
  ('27', 'Autres immobilisations financières'),
  ('271', 'Prêts et créances'),
  ('274', 'Titres immobilisés'),
  ('275', 'Dépôts et cautionnements versés'),
  ('28', 'Amortissements'),
  ('281', 'Amortissements des immobilisations incorporelles'),
  ('283', 'Amortissements des bâtiments, installations techniques et agencements'),
  ('284', 'Amortissements du matériel'),
  ('29', 'Dépréciations des immobilisations'),
  -- Classe 3 : stocks
  ('31', 'Marchandises'),
  ('32', 'Matières premières et fournitures liées'),
  ('33', 'Autres approvisionnements'),
  ('34', 'Produits en cours'),
  ('35', 'Services en cours'),
  ('36', 'Produits finis'),
  ('37', 'Produits intermédiaires et résiduels'),
  ('38', 'Stocks en cours de route, en consignation ou en dépôt'),
  ('39', 'Dépréciations des stocks et encours de production'),
  -- Classe 4 : tiers
  ('40', 'Fournisseurs et comptes rattachés'),
  ('401', 'Fournisseurs, dettes en compte'),
  ('402', 'Fournisseurs, effets à payer'),
  ('408', 'Fournisseurs, factures non parvenues'),
  ('409', 'Fournisseurs débiteurs'),
  ('41', 'Clients et comptes rattachés'),
  ('411', 'Clients'),
  ('412', 'Clients, effets à recevoir en portefeuille'),
  ('416', 'Créances clients litigieuses ou douteuses'),
  ('418', 'Clients, produits à recevoir'),
  ('419', 'Clients créditeurs'),
  ('42', 'Personnel'),
  ('421', 'Personnel, avances et acomptes'),
  ('422', 'Personnel, rémunérations dues'),
  ('428', 'Personnel, charges à payer et produits à recevoir'),
  ('43', 'Organismes sociaux'),
  ('431', 'Sécurité sociale'),
  ('432', 'Caisses de retraite complémentaire'),
  ('438', 'Organismes sociaux, charges à payer et produits à recevoir'),
  ('44', 'État et collectivités publiques'),
  ('441', 'État, impôt sur les bénéfices'),
  ('442', 'État, autres impôts et taxes'),
  ('443', 'État, TVA facturée'),
  ('4431', 'TVA facturée sur ventes'),
  ('4432', 'TVA facturée sur prestations de services'),
  ('4433', 'TVA facturée sur travaux'),
  ('4435', 'TVA sur factures à établir'),
  ('444', 'État, TVA due ou crédit de TVA'),
  ('4441', 'État, TVA due'),
  ('4449', 'État, crédit de TVA à reporter'),
  ('445', 'État, TVA récupérable'),
  ('4451', 'TVA récupérable sur immobilisations'),
  ('4452', 'TVA récupérable sur achats'),
  ('4453', 'TVA récupérable sur transport'),
  ('4454', 'TVA récupérable sur services extérieurs et autres charges'),
  ('4455', 'TVA récupérable sur factures non parvenues'),
  ('447', 'État, impôts retenus à la source'),
  ('448', 'État, charges à payer et produits à recevoir'),
  ('449', 'État, créances et dettes diverses'),
  ('45', 'Organismes internationaux'),
  ('46', 'Apporteurs, associés et groupe'),
  ('461', 'Apporteurs, opérations sur le capital'),
  ('462', 'Associés, comptes courants'),
  ('465', 'Associés, dividendes à payer'),
  ('47', 'Débiteurs et créditeurs divers'),
  ('471', 'Débiteurs et créditeurs divers'),
  ('476', 'Charges constatées d''avance'),
  ('477', 'Produits constatés d''avance'),
  ('48', 'Créances et dettes hors activités ordinaires'),
  ('481', 'Fournisseurs d''investissements'),
  ('485', 'Créances sur cessions d''immobilisations'),
  ('49', 'Dépréciations et provisions pour risques à court terme (tiers)'),
  ('491', 'Dépréciations des comptes clients'),
  -- Classe 5 : trésorerie
  ('50', 'Titres de placement'),
  ('51', 'Valeurs à encaisser'),
  ('511', 'Effets à encaisser'),
  ('513', 'Chèques à encaisser'),
  ('514', 'Chèques à l''encaissement'),
  ('52', 'Banques'),
  ('521', 'Banques locales'),
  ('53', 'Établissements financiers et assimilés'),
  ('54', 'Instruments de trésorerie'),
  ('55', 'Instruments de monnaie électronique'),
  ('552', 'Monnaie électronique — téléphone portable (Mobile Money)'),
  ('558', 'Autres instruments de monnaie électronique'),
  ('56', 'Banques, crédits de trésorerie et d''escompte'),
  ('561', 'Crédits de trésorerie'),
  ('57', 'Caisse'),
  ('571', 'Caisse siège social'),
  ('572', 'Caisse succursales'),
  ('58', 'Régies d''avances, accréditifs et virements internes'),
  ('581', 'Régies d''avances'),
  ('585', 'Virements de fonds'),
  ('59', 'Dépréciations et provisions pour risques à court terme (trésorerie)'),
  -- Classe 6 : charges des activités ordinaires
  ('60', 'Achats et variations de stocks'),
  ('601', 'Achats de marchandises'),
  ('602', 'Achats de matières premières et fournitures liées'),
  ('603', 'Variations des stocks de biens achetés'),
  ('6031', 'Variations des stocks de marchandises'),
  ('6032', 'Variations des stocks de matières premières et fournitures liées'),
  ('6033', 'Variations des stocks d''autres approvisionnements'),
  ('604', 'Achats stockés de matières et fournitures consommables'),
  ('605', 'Autres achats'),
  ('6051', 'Fournitures non stockables — eau'),
  ('6052', 'Fournitures non stockables — électricité'),
  ('6053', 'Fournitures non stockables — autres énergies'),
  ('6054', 'Fournitures d''entretien non stockables'),
  ('6055', 'Fournitures de bureau non stockables'),
  ('6056', 'Achats de petit matériel et outillage'),
  ('6057', 'Achats d''études et prestations de services'),
  ('6058', 'Achats de travaux, matériels et équipements'),
  ('608', 'Achats d''emballages'),
  ('61', 'Transports'),
  ('612', 'Transports sur ventes'),
  ('614', 'Transports du personnel'),
  ('616', 'Transports de plis'),
  ('618', 'Autres frais de transport'),
  ('62', 'Services extérieurs'),
  ('621', 'Sous-traitance générale'),
  ('622', 'Locations et charges locatives'),
  ('623', 'Redevances de location-acquisition'),
  ('624', 'Entretien, réparations, remise en état et maintenance'),
  ('625', 'Primes d''assurance'),
  ('626', 'Études, recherches et documentation'),
  ('627', 'Publicité, publications, relations publiques'),
  ('628', 'Frais de télécommunications'),
  ('63', 'Autres services extérieurs'),
  ('631', 'Frais bancaires'),
  ('632', 'Rémunérations d''intermédiaires et de conseils'),
  ('633', 'Frais de formation du personnel'),
  ('634', 'Redevances pour brevets, licences, logiciels et droits similaires'),
  ('635', 'Cotisations'),
  ('637', 'Rémunérations de personnel extérieur à l''entité'),
  ('638', 'Autres charges externes'),
  ('64', 'Impôts et taxes'),
  ('641', 'Impôts et taxes directs'),
  ('645', 'Impôts et taxes indirects'),
  ('646', 'Droits d''enregistrement'),
  ('647', 'Pénalités et amendes fiscales'),
  ('648', 'Autres impôts et taxes'),
  ('65', 'Autres charges'),
  ('651', 'Pertes sur créances clients et autres débiteurs'),
  ('658', 'Charges diverses'),
  ('66', 'Charges de personnel'),
  ('661', 'Rémunérations directes versées au personnel national'),
  ('663', 'Indemnités forfaitaires versées au personnel'),
  ('664', 'Charges sociales'),
  ('668', 'Autres charges sociales'),
  ('67', 'Frais financiers et charges assimilées'),
  ('671', 'Intérêts des emprunts'),
  ('674', 'Autres intérêts'),
  ('676', 'Pertes de change'),
  ('68', 'Dotations aux amortissements'),
  ('681', 'Dotations aux amortissements d''exploitation'),
  ('69', 'Dotations aux provisions et aux dépréciations'),
  ('691', 'Dotations aux provisions et dépréciations d''exploitation'),
  ('697', 'Dotations aux provisions et dépréciations financières'),
  -- Classe 7 : produits des activités ordinaires
  ('70', 'Ventes'),
  ('701', 'Ventes de marchandises'),
  ('702', 'Ventes de produits finis'),
  ('703', 'Ventes de produits intermédiaires'),
  ('704', 'Ventes de produits résiduels'),
  ('705', 'Travaux facturés'),
  ('706', 'Services vendus'),
  ('707', 'Produits accessoires'),
  ('71', 'Subventions d''exploitation'),
  ('72', 'Production immobilisée'),
  ('73', 'Variations des stocks de biens et de services produits'),
  ('75', 'Autres produits'),
  ('758', 'Produits divers'),
  ('77', 'Revenus financiers et produits assimilés'),
  ('771', 'Intérêts de prêts et créances diverses'),
  ('776', 'Gains de change'),
  ('78', 'Transferts de charges'),
  ('781', 'Transferts de charges d''exploitation'),
  ('79', 'Reprises de provisions, de dépréciations et autres'),
  ('791', 'Reprises de provisions et dépréciations d''exploitation'),
  -- Classe 8 : autres charges et autres produits
  ('81', 'Valeurs comptables des cessions d''immobilisations'),
  ('82', 'Produits des cessions d''immobilisations'),
  ('83', 'Charges hors activités ordinaires'),
  ('84', 'Produits hors activités ordinaires'),
  ('85', 'Dotations hors activités ordinaires'),
  ('86', 'Reprises hors activités ordinaires'),
  ('87', 'Participation des travailleurs'),
  ('88', 'Subventions d''équilibre'),
  ('89', 'Impôts sur le résultat'),
  ('891', 'Impôts sur les bénéfices de l''exercice');

revoke all on prive.plan_syscohada from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Comptes (plan comptable de l'entreprise)
-- -----------------------------------------------------------------------------
create table public.comptes (
  id             uuid primary key default gen_random_uuid(),
  entreprise_id  uuid not null references public.entreprises (id) on delete cascade,
  numero         text not null check (numero ~ '^[1-9][0-9]{1,11}$'),
  libelle        text not null check (length(trim(libelle)) between 2 and 150),
  classe         smallint generated always as (substr(numero, 1, 1)::smallint) stored,
  -- false pour les comptes de regroupement (qui ont des sous-comptes)
  mouvementable  boolean not null default true,
  actif          boolean not null default true,
  origine        text not null default 'entreprise' check (origine in ('syscohada', 'entreprise')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (entreprise_id, numero),
  unique (id, entreprise_id)
);

create index comptes_entreprise_classe_idx on public.comptes (entreprise_id, classe, numero);

create trigger comptes_updated_at
  before update on public.comptes
  for each row execute function prive.maj_updated_at();

-- -----------------------------------------------------------------------------
-- Exercices
-- -----------------------------------------------------------------------------
create table public.exercices (
  id            uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises (id) on delete cascade,
  code          text not null check (code ~ '^[0-9A-Z-]{2,12}$'),
  date_debut    date not null,
  date_fin      date not null,
  statut        text not null default 'ouvert' check (statut in ('ouvert', 'cloture')),
  cloture_le    timestamptz,
  cloture_par   uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  check (date_fin > date_debut),
  -- OHADA : 12 mois en règle générale ; on tolère jusqu'à 24 mois (premier exercice)
  check (date_fin < date_debut + interval '24 months'),
  unique (entreprise_id, code),
  unique (id, entreprise_id)
);

create index exercices_entreprise_dates_idx on public.exercices (entreprise_id, date_debut, date_fin);
create index exercices_cloture_par_idx on public.exercices (cloture_par);

-- -----------------------------------------------------------------------------
-- Journaux
-- -----------------------------------------------------------------------------
create table public.journaux (
  id                   uuid primary key default gen_random_uuid(),
  entreprise_id        uuid not null references public.entreprises (id) on delete cascade,
  code                 text not null check (code ~ '^[A-Z0-9]{1,6}$'),
  libelle              text not null check (length(trim(libelle)) between 2 and 100),
  type                 text not null check (type in (
                         'achats', 'ventes', 'banque', 'caisse', 'monnaie_electronique',
                         'operations_diverses', 'a_nouveaux')),
  compte_tresorerie_id uuid,
  actif                boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (entreprise_id, code),
  unique (id, entreprise_id),
  foreign key (compte_tresorerie_id, entreprise_id) references public.comptes (id, entreprise_id),
  constraint journaux_tresorerie_check check (
    (type in ('banque', 'caisse', 'monnaie_electronique')) = (compte_tresorerie_id is not null)
  )
);

create index journaux_compte_tresorerie_idx on public.journaux (compte_tresorerie_id, entreprise_id);

create trigger journaux_updated_at
  before update on public.journaux
  for each row execute function prive.maj_updated_at();

-- -----------------------------------------------------------------------------
-- Écritures et lignes
-- -----------------------------------------------------------------------------
create table public.ecritures (
  id                  uuid primary key default gen_random_uuid(),
  entreprise_id       uuid not null references public.entreprises (id) on delete cascade,
  exercice_id         uuid not null,
  journal_id          uuid not null,
  numero              text,
  date_ecriture       date not null,
  libelle             text not null check (length(trim(libelle)) between 1 and 200),
  reference           text check (reference is null or length(reference) <= 60),
  statut              text not null default 'brouillon' check (statut in ('brouillon', 'validee')),
  -- manuelle, simple (recette/dépense), contre_passation ; plus tard : vente, achat…
  origine             text not null default 'manuelle',
  boutique_id         uuid,
  contre_passation_de uuid,
  total               bigint not null default 0,
  created_by          uuid references auth.users (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  validee_le          timestamptz,
  validee_par         uuid references auth.users (id) on delete set null,
  unique (id, entreprise_id),
  foreign key (exercice_id, entreprise_id) references public.exercices (id, entreprise_id),
  foreign key (journal_id, entreprise_id) references public.journaux (id, entreprise_id),
  foreign key (boutique_id, entreprise_id) references public.boutiques (id, entreprise_id),
  foreign key (contre_passation_de, entreprise_id) references public.ecritures (id, entreprise_id),
  check ((statut = 'validee') = (numero is not null and validee_le is not null))
);

create unique index ecritures_numero_unique
  on public.ecritures (journal_id, exercice_id, numero)
  where numero is not null;
-- Une écriture ne peut être contre-passée qu'une fois
create unique index ecritures_contre_passation_unique
  on public.ecritures (contre_passation_de)
  where contre_passation_de is not null;
create index ecritures_entreprise_date_idx on public.ecritures (entreprise_id, date_ecriture desc);
create index ecritures_exercice_idx on public.ecritures (exercice_id, entreprise_id);
create index ecritures_journal_idx on public.ecritures (journal_id, entreprise_id);
create index ecritures_boutique_idx on public.ecritures (boutique_id, entreprise_id);
create index ecritures_created_by_idx on public.ecritures (created_by);
create index ecritures_validee_par_idx on public.ecritures (validee_par);
create index ecritures_contre_passation_fk_idx on public.ecritures (contre_passation_de, entreprise_id);

create trigger ecritures_updated_at
  before update on public.ecritures
  for each row execute function prive.maj_updated_at();

create table public.ecriture_lignes (
  id            uuid primary key default gen_random_uuid(),
  ecriture_id   uuid not null,
  entreprise_id uuid not null,
  ordre         smallint not null,
  compte_id     uuid not null,
  libelle       text check (libelle is null or length(libelle) <= 200),
  debit         bigint not null default 0 check (debit >= 0),
  credit        bigint not null default 0 check (credit >= 0),
  foreign key (ecriture_id, entreprise_id) references public.ecritures (id, entreprise_id) on delete cascade,
  foreign key (compte_id, entreprise_id) references public.comptes (id, entreprise_id),
  -- Chaque ligne est soit au débit, soit au crédit
  check ((debit > 0) <> (credit > 0)),
  unique (ecriture_id, ordre)
);

create index ecriture_lignes_compte_idx on public.ecriture_lignes (compte_id, entreprise_id);
create index ecriture_lignes_ecriture_fk_idx on public.ecriture_lignes (ecriture_id, entreprise_id);

-- Compteurs de numérotation (non exposés)
create table prive.compteurs_ecritures (
  journal_id  uuid not null references public.journaux (id) on delete cascade,
  exercice_id uuid not null references public.exercices (id) on delete cascade,
  dernier     integer not null default 0,
  primary key (journal_id, exercice_id)
);
create index compteurs_ecritures_exercice_idx on prive.compteurs_ecritures (exercice_id);
revoke all on prive.compteurs_ecritures from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Immuabilité des écritures validées
-- (suppression en cascade d'une entreprise : uniquement par la maintenance,
--  avec SET LOCAL facturall.purge = 'on')
-- -----------------------------------------------------------------------------
create or replace function prive.proteger_ecritures()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(current_setting('facturall.purge', true), '') = 'on' then
    return coalesce(new, old);
  end if;
  if old.statut = 'validee' then
    raise exception 'Écriture validée % : elle ne peut plus être modifiée ni supprimée. Contre-passez-la.', old.numero
      using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger ecritures_immuables
  before update or delete on public.ecritures
  for each row execute function prive.proteger_ecritures();

create or replace function prive.proteger_lignes()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_statut text;
begin
  if coalesce(current_setting('facturall.purge', true), '') = 'on' then
    return coalesce(new, old);
  end if;
  select statut into v_statut from public.ecritures where id = coalesce(new.ecriture_id, old.ecriture_id);
  if v_statut = 'validee' then
    raise exception 'Les lignes d''une écriture validée ne peuvent plus être modifiées.'
      using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger ecriture_lignes_immuables
  before insert or update or delete on public.ecriture_lignes
  for each row execute function prive.proteger_lignes();

-- Un exercice clôturé est figé
create or replace function prive.proteger_exercices()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.statut = 'cloture' and coalesce(current_setting('facturall.purge', true), '') <> 'on' then
    raise exception 'Exercice % clôturé : il ne peut plus être modifié.', old.code using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger exercices_immuables
  before update or delete on public.exercices
  for each row execute function prive.proteger_exercices();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.comptes          enable row level security;
alter table public.exercices        enable row level security;
alter table public.journaux         enable row level security;
alter table public.ecritures        enable row level security;
alter table public.ecriture_lignes  enable row level security;

revoke all on public.comptes, public.exercices, public.journaux,
  public.ecritures, public.ecriture_lignes from anon, authenticated;

grant select on public.comptes, public.exercices, public.journaux,
  public.ecritures, public.ecriture_lignes to authenticated;
grant update (libelle, actif) on public.comptes to authenticated;
grant update (libelle, actif) on public.journaux to authenticated;

-- Plan comptable, exercices, journaux : visibles par tous les membres (listes de choix)
create policy "comptes : lecture par les membres"
  on public.comptes for select to authenticated
  using (prive.est_membre(entreprise_id));
create policy "comptes : modification par la comptabilité"
  on public.comptes for update to authenticated
  using (prive.est_compta(entreprise_id))
  with check (prive.est_compta(entreprise_id));

create policy "exercices : lecture par les membres"
  on public.exercices for select to authenticated
  using (prive.est_membre(entreprise_id));

create policy "journaux : lecture par les membres"
  on public.journaux for select to authenticated
  using (prive.est_membre(entreprise_id));
create policy "journaux : modification par la comptabilité"
  on public.journaux for update to authenticated
  using (prive.est_compta(entreprise_id))
  with check (prive.est_compta(entreprise_id));

-- Écritures : comptabilité et lecteurs uniquement
create policy "ecritures : lecture comptable"
  on public.ecritures for select to authenticated
  using (prive.peut_lire_compta(entreprise_id));
create policy "ecriture_lignes : lecture comptable"
  on public.ecriture_lignes for select to authenticated
  using (prive.peut_lire_compta(entreprise_id));

-- =============================================================================
-- Initialisation de la comptabilité d'une entreprise
-- =============================================================================
create or replace function prive.initialiser_comptabilite(p_entreprise_id uuid, p_annee integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_banque uuid;
  v_caisse uuid;
  v_mm uuid;
begin
  -- Plan de base : un compte est « de regroupement » s'il a des sous-comptes dans le plan
  insert into public.comptes (entreprise_id, numero, libelle, mouvementable, origine)
  select p_entreprise_id, p.numero, p.libelle,
         not exists (
           select 1 from prive.plan_syscohada f
           where f.numero like p.numero || '%' and f.numero <> p.numero
         ),
         'syscohada'
  from prive.plan_syscohada p
  on conflict (entreprise_id, numero) do nothing;

  select id into v_banque from public.comptes where entreprise_id = p_entreprise_id and numero = '521';
  select id into v_caisse from public.comptes where entreprise_id = p_entreprise_id and numero = '571';
  select id into v_mm     from public.comptes where entreprise_id = p_entreprise_id and numero = '552';

  insert into public.journaux (entreprise_id, code, libelle, type, compte_tresorerie_id) values
    (p_entreprise_id, 'AC', 'Achats', 'achats', null),
    (p_entreprise_id, 'VT', 'Ventes', 'ventes', null),
    (p_entreprise_id, 'BQ', 'Banque', 'banque', v_banque),
    (p_entreprise_id, 'CA', 'Caisse', 'caisse', v_caisse),
    (p_entreprise_id, 'MM', 'Mobile Money', 'monnaie_electronique', v_mm),
    (p_entreprise_id, 'OD', 'Opérations diverses', 'operations_diverses', null),
    (p_entreprise_id, 'AN', 'À-nouveaux', 'a_nouveaux', null)
  on conflict (entreprise_id, code) do nothing;

  -- Exercice = année civile (Acte uniforme OHADA, art. 7)
  insert into public.exercices (entreprise_id, code, date_debut, date_fin)
  values (p_entreprise_id, p_annee::text, make_date(p_annee, 1, 1), make_date(p_annee, 12, 31))
  on conflict (entreprise_id, code) do nothing;
end;
$$;

revoke all on function prive.initialiser_comptabilite(uuid, integer) from public, anon, authenticated;

-- Nouvelles entreprises : la comptabilité est initialisée automatiquement
create or replace function prive.apres_creation_entreprise()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform prive.initialiser_comptabilite(new.id, extract(year from current_date)::integer);
  return new;
end;
$$;

create trigger entreprises_initialiser_comptabilite
  after insert on public.entreprises
  for each row execute function prive.apres_creation_entreprise();

-- Entreprises déjà existantes
do $$
declare
  v_id uuid;
begin
  for v_id in select id from public.entreprises loop
    perform prive.initialiser_comptabilite(v_id, extract(year from current_date)::integer);
  end loop;
end;
$$;

-- =============================================================================
-- Fonctions internes de saisie
-- =============================================================================

-- Exercice ouvert contenant la date
create or replace function prive.exercice_pour_date(p_entreprise_id uuid, p_date date)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_statut text;
begin
  select id, statut into v_id, v_statut
  from public.exercices
  where entreprise_id = p_entreprise_id and p_date between date_debut and date_fin;

  if v_id is null then
    raise exception 'Aucun exercice comptable ne couvre la date du %.', to_char(p_date, 'DD/MM/YYYY')
      using errcode = '22023';
  end if;
  if v_statut <> 'ouvert' then
    raise exception 'L''exercice couvrant le % est clôturé.', to_char(p_date, 'DD/MM/YYYY')
      using errcode = '42501';
  end if;
  return v_id;
end;
$$;

-- Écrit les lignes d'une écriture brouillon à partir d'un tableau JSON :
-- [{ "compte_id": "…" | "compte": "601", "libelle": "…", "debit": 1000, "credit": 0 }, …]
create or replace function prive.ecrire_lignes(p_ecriture_id uuid, p_entreprise_id uuid, p_lignes jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ligne jsonb;
  v_ordre smallint := 0;
  v_compte public.comptes;
  v_debit bigint;
  v_credit bigint;
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

    insert into public.ecriture_lignes (ecriture_id, entreprise_id, ordre, compte_id, libelle, debit, credit)
    values (p_ecriture_id, p_entreprise_id, v_ordre, v_compte.id,
            nullif(trim(v_ligne ->> 'libelle'), ''), v_debit, v_credit);

    v_compte := null;
  end loop;
end;
$$;

-- Valide une écriture brouillon : contrôle d'équilibre et numérotation sans trou
create or replace function prive.valider(p_ecriture_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_e public.ecritures;
  v_code_journal text;
  v_code_exercice text;
  v_debit bigint;
  v_credit bigint;
  v_nb integer;
  v_n integer;
  v_numero text;
begin
  select * into v_e from public.ecritures where id = p_ecriture_id for update;
  if v_e.id is null then
    raise exception 'Écriture introuvable.' using errcode = '22023';
  end if;
  if v_e.statut <> 'brouillon' then
    raise exception 'Cette écriture est déjà validée.' using errcode = '22023';
  end if;

  select count(*), coalesce(sum(debit), 0), coalesce(sum(credit), 0)
  into v_nb, v_debit, v_credit
  from public.ecriture_lignes where ecriture_id = p_ecriture_id;

  if v_nb < 2 then
    raise exception 'Une écriture doit comporter au moins deux lignes.' using errcode = '22023';
  end if;
  if v_debit <> v_credit then
    raise exception 'Écriture déséquilibrée : débit % FCFA, crédit % FCFA (écart %).',
      v_debit, v_credit, abs(v_debit - v_credit) using errcode = '22023';
  end if;
  if v_debit = 0 then
    raise exception 'Écriture de montant nul.' using errcode = '22023';
  end if;

  -- L'exercice doit toujours être ouvert et couvrir la date
  perform prive.exercice_pour_date(v_e.entreprise_id, v_e.date_ecriture);

  select code into v_code_journal from public.journaux where id = v_e.journal_id;
  select code into v_code_exercice from public.exercices where id = v_e.exercice_id;

  -- Compteur verrouillé : pas de trou ni de doublon, même en accès concurrent
  insert into prive.compteurs_ecritures (journal_id, exercice_id, dernier)
  values (v_e.journal_id, v_e.exercice_id, 0)
  on conflict (journal_id, exercice_id) do nothing;

  update prive.compteurs_ecritures
  set dernier = dernier + 1
  where journal_id = v_e.journal_id and exercice_id = v_e.exercice_id
  returning dernier into v_n;

  v_numero := v_code_journal || '-' || v_code_exercice || '-' || lpad(v_n::text, 5, '0');

  update public.ecritures
  set statut = 'validee', numero = v_numero, total = v_debit,
      validee_le = now(), validee_par = auth.uid()
  where id = p_ecriture_id;

  return v_numero;
end;
$$;

revoke all on function prive.exercice_pour_date(uuid, date), prive.ecrire_lignes(uuid, uuid, jsonb),
  prive.valider(uuid) from public, anon, authenticated;

-- =============================================================================
-- Fonctions RPC
-- =============================================================================

-- Crée ou met à jour (brouillon) une écriture ; la valide si p_valider.
create or replace function public.enregistrer_ecriture(
  p_entreprise_id uuid,
  p_journal_id    uuid,
  p_date          date,
  p_libelle       text,
  p_lignes        jsonb,
  p_reference     text default null,
  p_valider       boolean default false,
  p_boutique_id   uuid default null,
  p_ecriture_id   uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := p_ecriture_id;
  v_exercice uuid;
  v_journal public.journaux;
begin
  if not prive.est_compta(p_entreprise_id) then
    raise exception 'Droits insuffisants : réservé à la comptabilité.' using errcode = '42501';
  end if;

  select * into v_journal from public.journaux where id = p_journal_id and entreprise_id = p_entreprise_id;
  if v_journal.id is null or not v_journal.actif then
    raise exception 'Journal introuvable ou désactivé.' using errcode = '22023';
  end if;
  if p_date is null then
    raise exception 'La date est obligatoire.' using errcode = '22023';
  end if;
  if coalesce(trim(p_libelle), '') = '' then
    raise exception 'Le libellé est obligatoire.' using errcode = '22023';
  end if;

  v_exercice := prive.exercice_pour_date(p_entreprise_id, p_date);

  if v_id is null then
    insert into public.ecritures (entreprise_id, exercice_id, journal_id, date_ecriture, libelle,
                                  reference, boutique_id, created_by)
    values (p_entreprise_id, v_exercice, p_journal_id, p_date, trim(p_libelle),
            nullif(trim(p_reference), ''), p_boutique_id, auth.uid())
    returning id into v_id;
  else
    update public.ecritures
    set exercice_id = v_exercice, journal_id = p_journal_id, date_ecriture = p_date,
        libelle = trim(p_libelle), reference = nullif(trim(p_reference), ''), boutique_id = p_boutique_id
    where id = v_id and entreprise_id = p_entreprise_id and statut = 'brouillon';
    if not found then
      raise exception 'Brouillon introuvable (ou écriture déjà validée).' using errcode = '22023';
    end if;
  end if;

  perform prive.ecrire_lignes(v_id, p_entreprise_id, p_lignes);

  if p_valider then
    perform prive.valider(v_id);
  end if;

  return v_id;
end;
$$;

create or replace function public.valider_ecriture(p_ecriture_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entreprise uuid;
begin
  select entreprise_id into v_entreprise from public.ecritures where id = p_ecriture_id;
  if v_entreprise is null or not prive.est_compta(v_entreprise) then
    raise exception 'Écriture introuvable ou droits insuffisants.' using errcode = '42501';
  end if;
  return prive.valider(p_ecriture_id);
end;
$$;

create or replace function public.supprimer_brouillon(p_ecriture_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entreprise uuid;
begin
  select entreprise_id into v_entreprise from public.ecritures where id = p_ecriture_id;
  if v_entreprise is null or not prive.est_compta(v_entreprise) then
    raise exception 'Écriture introuvable ou droits insuffisants.' using errcode = '42501';
  end if;
  -- Le trigger refuse la suppression d'une écriture validée
  delete from public.ecritures where id = p_ecriture_id;
end;
$$;

-- Annule une écriture validée par une écriture inverse (débit ↔ crédit), elle-même validée.
create or replace function public.contre_passer_ecriture(
  p_ecriture_id uuid,
  p_date        date default current_date,
  p_libelle     text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_e public.ecritures;
  v_id uuid;
  v_lignes jsonb;
begin
  select * into v_e from public.ecritures where id = p_ecriture_id;
  if v_e.id is null or not prive.est_compta(v_e.entreprise_id) then
    raise exception 'Écriture introuvable ou droits insuffisants.' using errcode = '42501';
  end if;
  if v_e.statut <> 'validee' then
    raise exception 'Seule une écriture validée peut être contre-passée (supprimez plutôt le brouillon).'
      using errcode = '22023';
  end if;
  if v_e.contre_passation_de is not null then
    raise exception 'Une contre-passation ne peut pas être elle-même contre-passée.' using errcode = '22023';
  end if;
  if exists (select 1 from public.ecritures where contre_passation_de = p_ecriture_id) then
    raise exception 'Cette écriture a déjà été contre-passée.' using errcode = '23505';
  end if;

  select jsonb_agg(jsonb_build_object(
           'compte_id', l.compte_id, 'libelle', l.libelle, 'debit', l.credit, 'credit', l.debit)
         order by l.ordre)
  into v_lignes
  from public.ecriture_lignes l where l.ecriture_id = p_ecriture_id;

  insert into public.ecritures (entreprise_id, exercice_id, journal_id, date_ecriture, libelle, reference,
                                origine, boutique_id, contre_passation_de, created_by)
  values (v_e.entreprise_id, prive.exercice_pour_date(v_e.entreprise_id, coalesce(p_date, current_date)),
          v_e.journal_id, coalesce(p_date, current_date),
          coalesce(nullif(trim(p_libelle), ''), left('Annulation ' || v_e.numero || ' — ' || v_e.libelle, 200)),
          v_e.numero, 'contre_passation', v_e.boutique_id, v_e.id, auth.uid())
  returning id into v_id;

  -- Les comptes d'origine peuvent avoir été désactivés depuis : on recopie sans contrôle.
  insert into public.ecriture_lignes (ecriture_id, entreprise_id, ordre, compte_id, libelle, debit, credit)
  select v_id, v_e.entreprise_id, (row_number() over (order by e.ordinality))::smallint,
         (e.value ->> 'compte_id')::uuid, e.value ->> 'libelle',
         (e.value ->> 'debit')::bigint, (e.value ->> 'credit')::bigint
  from jsonb_array_elements(v_lignes) with ordinality e;

  perform prive.valider(v_id);
  return v_id;
end;
$$;

-- Mode simplifié : une recette ou une dépense payée en caisse, banque ou Mobile Money.
--   recette : débit trésorerie / crédit contrepartie (ex. 701 Ventes)
--   dépense : débit contrepartie (ex. 6052 Électricité) / crédit trésorerie
create or replace function public.enregistrer_operation_simple(
  p_entreprise_id  uuid,
  p_sens           text,
  p_date           date,
  p_montant        bigint,
  p_journal_id     uuid,
  p_compte_id      uuid,
  p_libelle        text,
  p_reference      text default null,
  p_boutique_id    uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_journal public.journaux;
  v_compte public.comptes;
  v_id uuid;
begin
  if not prive.est_compta(p_entreprise_id) then
    raise exception 'Droits insuffisants : réservé à la comptabilité.' using errcode = '42501';
  end if;
  if p_sens not in ('recette', 'depense') then
    raise exception 'Le sens doit être « recette » ou « depense ».' using errcode = '22023';
  end if;
  if p_montant is null or p_montant <= 0 then
    raise exception 'Le montant doit être supérieur à zéro.' using errcode = '22023';
  end if;

  select * into v_journal from public.journaux where id = p_journal_id and entreprise_id = p_entreprise_id;
  if v_journal.id is null or v_journal.compte_tresorerie_id is null then
    raise exception 'Choisissez une caisse, une banque ou un compte Mobile Money.' using errcode = '22023';
  end if;

  select * into v_compte from public.comptes where id = p_compte_id and entreprise_id = p_entreprise_id;
  if v_compte.id is null then
    raise exception 'Catégorie (compte) introuvable.' using errcode = '22023';
  end if;
  if v_compte.id = v_journal.compte_tresorerie_id then
    raise exception 'La catégorie doit être différente du compte de trésorerie.' using errcode = '22023';
  end if;

  v_id := public.enregistrer_ecriture(
    p_entreprise_id, p_journal_id, p_date, p_libelle,
    jsonb_build_array(
      jsonb_build_object('compte_id', v_journal.compte_tresorerie_id,
                         'debit',  case when p_sens = 'recette' then p_montant else 0 end,
                         'credit', case when p_sens = 'depense' then p_montant else 0 end),
      jsonb_build_object('compte_id', v_compte.id,
                         'debit',  case when p_sens = 'depense' then p_montant else 0 end,
                         'credit', case when p_sens = 'recette' then p_montant else 0 end)
    ),
    p_reference, false, p_boutique_id, null
  );

  update public.ecritures set origine = 'simple' where id = v_id;
  perform prive.valider(v_id);
  return v_id;
end;
$$;

-- Ajoute un sous-compte (ex. 4111 « Clients — grossistes » sous 411)
create or replace function public.creer_compte(p_entreprise_id uuid, p_numero text, p_libelle text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parent public.comptes;
  v_id uuid;
  v_numero text := trim(p_numero);
begin
  if not prive.est_compta(p_entreprise_id) then
    raise exception 'Droits insuffisants : réservé à la comptabilité.' using errcode = '42501';
  end if;
  if v_numero !~ '^[1-9][0-9]{2,11}$' then
    raise exception 'Numéro de compte invalide (3 à 12 chiffres, sans 0 initial).' using errcode = '22023';
  end if;

  -- Parent = compte existant au préfixe le plus long
  select * into v_parent from public.comptes
  where entreprise_id = p_entreprise_id
    and v_numero like numero || '%' and numero <> v_numero
  order by length(numero) desc
  limit 1;

  if v_parent.id is null then
    raise exception 'Le compte % doit être rattaché à un compte existant du plan (ex. 411 pour 4111).', v_numero
      using errcode = '22023';
  end if;

  insert into public.comptes (entreprise_id, numero, libelle, mouvementable, origine)
  values (p_entreprise_id, v_numero, trim(p_libelle), true, 'entreprise')
  returning id into v_id;

  -- Le parent devient un compte de regroupement s'il n'a encore aucune écriture
  if v_parent.mouvementable and not exists (
    select 1 from public.ecriture_lignes where compte_id = v_parent.id
  ) then
    update public.comptes set mouvementable = false where id = v_parent.id;
  end if;

  return v_id;
end;
$$;

-- Ajoute un journal (ex. 2e compte bancaire : BQ2 lié au compte 5212)
create or replace function public.creer_journal(
  p_entreprise_id        uuid,
  p_code                 text,
  p_libelle              text,
  p_type                 text,
  p_compte_tresorerie_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_compte public.comptes;
begin
  if not prive.est_compta(p_entreprise_id) then
    raise exception 'Droits insuffisants : réservé à la comptabilité.' using errcode = '42501';
  end if;
  if p_compte_tresorerie_id is not null then
    select * into v_compte from public.comptes where id = p_compte_tresorerie_id and entreprise_id = p_entreprise_id;
    if v_compte.id is null or v_compte.classe <> 5 or not v_compte.mouvementable then
      raise exception 'Le compte de trésorerie doit être un compte de classe 5 mouvementable.' using errcode = '22023';
    end if;
  end if;
  insert into public.journaux (entreprise_id, code, libelle, type, compte_tresorerie_id)
  values (p_entreprise_id, upper(trim(p_code)), trim(p_libelle), p_type, p_compte_tresorerie_id)
  returning id into v_id;
  return v_id;
end;
$$;

-- Ouvre un nouvel exercice (sans chevauchement)
create or replace function public.creer_exercice(
  p_entreprise_id uuid,
  p_code          text,
  p_date_debut    date,
  p_date_fin      date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not prive.est_compta(p_entreprise_id) then
    raise exception 'Droits insuffisants : réservé à la comptabilité.' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.exercices
    where entreprise_id = p_entreprise_id
      and daterange(date_debut, date_fin, '[]') && daterange(p_date_debut, p_date_fin, '[]')
  ) then
    raise exception 'Cet exercice chevauche un exercice existant.' using errcode = '23P01';
  end if;
  insert into public.exercices (entreprise_id, code, date_debut, date_fin)
  values (p_entreprise_id, upper(trim(p_code)), p_date_debut, p_date_fin)
  returning id into v_id;
  return v_id;
end;
$$;

-- =============================================================================
-- États : balance générale et grand livre (écritures validées uniquement)
-- =============================================================================
create or replace function public.balance_generale(
  p_entreprise_id uuid,
  p_exercice_id   uuid,
  p_date_fin      date default null
)
returns table (
  compte_id       uuid,
  numero          text,
  libelle         text,
  classe          smallint,
  total_debit     bigint,
  total_credit    bigint,
  solde_debiteur  bigint,
  solde_crediteur bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with mouvements as (
    select l.compte_id, sum(l.debit)::bigint as d, sum(l.credit)::bigint as c
    from public.ecriture_lignes l
    join public.ecritures e on e.id = l.ecriture_id
    where e.entreprise_id = p_entreprise_id
      and e.exercice_id = p_exercice_id
      and e.statut = 'validee'
      and (p_date_fin is null or e.date_ecriture <= p_date_fin)
    group by l.compte_id
  )
  select c.id, c.numero, c.libelle, c.classe, m.d, m.c,
         greatest(m.d - m.c, 0), greatest(m.c - m.d, 0)
  from mouvements m
  join public.comptes c on c.id = m.compte_id
  order by c.numero;
$$;

create or replace function public.grand_livre(
  p_entreprise_id uuid,
  p_compte_id     uuid,
  p_exercice_id   uuid,
  p_date_fin      date default null
)
returns table (
  ecriture_id   uuid,
  numero        text,
  date_ecriture date,
  journal_code  text,
  libelle       text,
  reference     text,
  debit         bigint,
  credit        bigint,
  solde         bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select e.id, e.numero, e.date_ecriture, j.code,
         coalesce(l.libelle, e.libelle), e.reference, l.debit, l.credit,
         (sum(l.debit - l.credit) over (order by e.date_ecriture, e.numero, l.ordre))::bigint
  from public.ecriture_lignes l
  join public.ecritures e on e.id = l.ecriture_id
  join public.journaux j on j.id = e.journal_id
  where l.entreprise_id = p_entreprise_id
    and l.compte_id = p_compte_id
    and e.exercice_id = p_exercice_id
    and e.statut = 'validee'
    and (p_date_fin is null or e.date_ecriture <= p_date_fin)
  order by e.date_ecriture, e.numero, l.ordre;
$$;

-- -----------------------------------------------------------------------------
-- Droits d'exécution
-- -----------------------------------------------------------------------------
revoke execute on function
  public.enregistrer_ecriture(uuid, uuid, date, text, jsonb, text, boolean, uuid, uuid),
  public.valider_ecriture(uuid),
  public.supprimer_brouillon(uuid),
  public.contre_passer_ecriture(uuid, date, text),
  public.enregistrer_operation_simple(uuid, text, date, bigint, uuid, uuid, text, text, uuid),
  public.creer_compte(uuid, text, text),
  public.creer_journal(uuid, text, text, text, uuid),
  public.creer_exercice(uuid, text, date, date),
  public.balance_generale(uuid, uuid, date),
  public.grand_livre(uuid, uuid, uuid, date)
from public, anon;

grant execute on function
  public.enregistrer_ecriture(uuid, uuid, date, text, jsonb, text, boolean, uuid, uuid),
  public.valider_ecriture(uuid),
  public.supprimer_brouillon(uuid),
  public.contre_passer_ecriture(uuid, date, text),
  public.enregistrer_operation_simple(uuid, text, date, bigint, uuid, uuid, text, text, uuid),
  public.creer_compte(uuid, text, text),
  public.creer_journal(uuid, text, text, text, uuid),
  public.creer_exercice(uuid, text, date, date),
  public.balance_generale(uuid, uuid, date),
  public.grand_livre(uuid, uuid, uuid, date)
to authenticated;
