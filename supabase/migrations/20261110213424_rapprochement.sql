-- =============================================================================
-- FacturAll — Rapprochement bancaire
--
--   • releves_bancaires : relevé d'un compte de trésorerie (banque, caisse, Mobile Money)
--                         sur une période, avec solde initial et solde final
--   • lignes_releve     : opérations du relevé (montant signé : + entrée, − sortie),
--                         importées (CSV, Excel, PDF) ou saisies à la main
--
-- Pointage : une ligne de relevé est reliée à UNE ligne d'écriture validée passée sur
-- le compte de trésorerie du journal (521, 571, 552…), de même montant signé
-- (entrée = débit du compte, sortie = crédit). Une ligne d'écriture n'est pointée qu'une fois.
-- Une opération connue seulement de la banque (frais, agios…) peut être comptabilisée
-- depuis le relevé : l'écriture est créée et pointée en une fois.
--
-- Règles garanties par la base :
--   • montants entiers en FCFA ;
--   • validation : toutes les lignes pointées et solde initial + mouvements = solde final ;
--     le solde initial doit reprendre le solde final du relevé validé précédent du compte ;
--   • numérotation continue à la validation : RB-2026-00001 ;
--   • un relevé validé (et ses lignes) est inaltérable ;
--   • saisie : propriétaire, admin, comptable ; lecture : + lecteur.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------
create table public.releves_bancaires (
  id             uuid primary key default gen_random_uuid(),
  entreprise_id  uuid not null references public.entreprises (id) on delete cascade,
  journal_id     uuid not null,
  numero         text,
  statut         text not null default 'brouillon' check (statut in ('brouillon', 'valide')),
  date_debut     date not null,
  date_fin       date not null,
  solde_initial  bigint not null default 0,
  solde_final    bigint not null default 0,
  source         text not null default 'manuel' check (source in ('manuel', 'csv', 'excel', 'pdf')),
  fichier        text check (fichier is null or length(fichier) <= 255),
  notes          text check (notes is null or length(notes) <= 2000),
  created_by     uuid references auth.users (id) on delete set null,
  valide_le      timestamptz,
  valide_par     uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (id, entreprise_id),
  check (date_debut <= date_fin),
  check ((statut = 'brouillon') = (numero is null)),
  foreign key (journal_id, entreprise_id) references public.journaux (id, entreprise_id)
);
create unique index releves_bancaires_numero_unique on public.releves_bancaires (entreprise_id, numero) where numero is not null;
create index releves_bancaires_liste_idx on public.releves_bancaires (entreprise_id, date_fin desc);
create index releves_bancaires_journal_idx on public.releves_bancaires (journal_id, entreprise_id, date_fin desc);
create index releves_bancaires_created_by_idx on public.releves_bancaires (created_by);
create index releves_bancaires_valide_par_idx on public.releves_bancaires (valide_par);

create trigger releves_bancaires_updated_at
  before update on public.releves_bancaires
  for each row execute function prive.maj_updated_at();

create table public.lignes_releve (
  id                uuid primary key default gen_random_uuid(),
  entreprise_id     uuid not null,
  releve_id         uuid not null,
  ordre             integer not null,
  date_operation    date not null,
  libelle           text not null check (length(trim(libelle)) between 1 and 300),
  reference         text check (reference is null or length(reference) <= 100),
  montant           bigint not null check (montant <> 0),
  ecriture_ligne_id uuid references public.ecriture_lignes (id),
  pointee_le        timestamptz,
  foreign key (releve_id, entreprise_id) references public.releves_bancaires (id, entreprise_id) on delete cascade,
  check ((ecriture_ligne_id is null) = (pointee_le is null))
);
create index lignes_releve_releve_idx on public.lignes_releve (releve_id, entreprise_id, ordre);
-- Une ligne d'écriture n'est pointée qu'une seule fois
create unique index lignes_releve_ecriture_unique on public.lignes_releve (ecriture_ligne_id) where ecriture_ligne_id is not null;

-- -----------------------------------------------------------------------------
-- Inaltérabilité
-- -----------------------------------------------------------------------------
create or replace function prive.proteger_releves()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if coalesce(current_setting('facturall.purge', true), '') = 'on' or old.statut = 'brouillon' then
    return coalesce(new, old);
  end if;
  raise exception 'Le relevé % est validé : il ne peut plus être modifié ni supprimé.', old.numero
    using errcode = '42501';
end;
$$;

create trigger releves_bancaires_inalterables
  before update or delete on public.releves_bancaires
  for each row execute function prive.proteger_releves();

create or replace function prive.proteger_lignes_releve()
returns trigger language plpgsql set search_path = ''
as $$
declare
  v_statut text;
begin
  if coalesce(current_setting('facturall.purge', true), '') = 'on' then
    return coalesce(new, old);
  end if;
  select statut into v_statut from public.releves_bancaires where id = coalesce(new.releve_id, old.releve_id);
  if v_statut = 'valide' then
    raise exception 'Relevé validé : ses lignes ne peuvent plus être modifiées.' using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger lignes_releve_inalterables
  before insert or update or delete on public.lignes_releve
  for each row execute function prive.proteger_lignes_releve();

revoke all on function prive.proteger_releves(), prive.proteger_lignes_releve() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Sécurité : lecture pour la comptabilité et les lecteurs, écritures via RPC
-- -----------------------------------------------------------------------------
alter table public.releves_bancaires enable row level security;
alter table public.lignes_releve     enable row level security;

revoke all on public.releves_bancaires, public.lignes_releve from anon, authenticated;
grant select on public.releves_bancaires, public.lignes_releve to authenticated;

create policy "releves_bancaires : lecture compta" on public.releves_bancaires for select to authenticated
  using (prive.peut_lire_compta(entreprise_id));
create policy "lignes_releve : lecture compta" on public.lignes_releve for select to authenticated
  using (prive.peut_lire_compta(entreprise_id));

-- -----------------------------------------------------------------------------
-- Outils internes
-- -----------------------------------------------------------------------------

-- Relevé en brouillon modifiable par l'utilisateur courant (verrouillé)
create or replace function prive.releve_modifiable(p_releve_id uuid)
returns public.releves_bancaires language plpgsql security definer set search_path = ''
as $$
declare
  v_r public.releves_bancaires;
begin
  select * into v_r from public.releves_bancaires where id = p_releve_id for update;
  if v_r.id is null or not prive.peut_lire_compta(v_r.entreprise_id) then
    raise exception 'Relevé introuvable.' using errcode = '22023';
  end if;
  if not prive.est_compta(v_r.entreprise_id) then
    raise exception 'Droits insuffisants : réservé à la comptabilité.' using errcode = '42501';
  end if;
  if v_r.statut <> 'brouillon' then
    raise exception 'Le relevé % est validé : il ne peut plus être modifié.', v_r.numero using errcode = '42501';
  end if;
  return v_r;
end;
$$;

-- Ajoute des lignes (jsonb : [{date, libelle, reference, montant}]) à la fin du relevé
create or replace function prive.ajouter_lignes_releve(p_releve public.releves_bancaires, p_lignes jsonb)
returns integer language plpgsql security definer set search_path = ''
as $$
declare
  v_l jsonb;
  v_ordre integer;
  v_n integer := 0;
  v_montant bigint;
  v_date date;
begin
  if p_lignes is null or jsonb_typeof(p_lignes) <> 'array' then
    return 0;
  end if;
  select coalesce(max(ordre), 0) into v_ordre from public.lignes_releve where releve_id = p_releve.id;
  for v_l in select * from jsonb_array_elements(p_lignes) loop
    v_montant := nullif(v_l ->> 'montant', '')::bigint;
    v_date := nullif(v_l ->> 'date', '')::date;
    if v_montant is null or v_montant = 0 then
      raise exception 'Ligne % : montant manquant ou nul.', v_n + 1 using errcode = '22023';
    end if;
    if v_date is null then
      raise exception 'Ligne % : date manquante.', v_n + 1 using errcode = '22023';
    end if;
    if nullif(trim(v_l ->> 'libelle'), '') is null then
      raise exception 'Ligne % : libellé manquant.', v_n + 1 using errcode = '22023';
    end if;
    v_ordre := v_ordre + 1;
    v_n := v_n + 1;
    insert into public.lignes_releve (entreprise_id, releve_id, ordre, date_operation, libelle, reference, montant)
    values (p_releve.entreprise_id, p_releve.id, v_ordre, v_date, left(trim(v_l ->> 'libelle'), 300),
            left(nullif(trim(v_l ->> 'reference'), ''), 100), v_montant);
  end loop;
  return v_n;
end;
$$;

-- Relie une ligne de relevé à une ligne d'écriture, après contrôles
create or replace function prive.pointer(p_ligne public.lignes_releve, p_ecriture_ligne_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_compte uuid;
  v_el record;
begin
  select j.compte_tresorerie_id into v_compte
  from public.releves_bancaires r join public.journaux j on j.id = r.journal_id
  where r.id = p_ligne.releve_id;

  select l.id, l.compte_id, l.debit - l.credit as montant, e.statut, e.entreprise_id, j.type as type_journal
  into v_el
  from public.ecriture_lignes l join public.ecritures e on e.id = l.ecriture_id
  join public.journaux j on j.id = e.journal_id
  where l.id = p_ecriture_ligne_id;

  if v_el.id is null or v_el.entreprise_id <> p_ligne.entreprise_id then
    raise exception 'Opération comptable introuvable.' using errcode = '22023';
  end if;
  if v_el.type_journal = 'a_nouveaux' then
    raise exception 'Les à-nouveaux ne se pointent pas : ce sont des reports de solde.' using errcode = '22023';
  end if;
  if v_el.statut <> 'validee' then
    raise exception 'Seules les écritures validées peuvent être pointées.' using errcode = '22023';
  end if;
  if v_el.compte_id <> v_compte then
    raise exception 'Cette opération n''est pas passée sur le compte de trésorerie du relevé.' using errcode = '22023';
  end if;
  if v_el.montant <> p_ligne.montant then
    raise exception 'Montants différents : % au relevé, % en comptabilité.', p_ligne.montant, v_el.montant
      using errcode = '22023';
  end if;
  if exists (select 1 from public.lignes_releve where ecriture_ligne_id = p_ecriture_ligne_id and id <> p_ligne.id) then
    raise exception 'Cette opération est déjà pointée sur une autre ligne de relevé.' using errcode = '23505';
  end if;

  update public.lignes_releve set ecriture_ligne_id = p_ecriture_ligne_id, pointee_le = now() where id = p_ligne.id;
end;
$$;

-- Ligne de relevé + contrôle du relevé (brouillon, droits)
create or replace function prive.ligne_releve_modifiable(p_ligne_id uuid)
returns public.lignes_releve language plpgsql security definer set search_path = ''
as $$
declare
  v_l public.lignes_releve;
begin
  select * into v_l from public.lignes_releve where id = p_ligne_id;
  if v_l.id is null then
    raise exception 'Ligne de relevé introuvable.' using errcode = '22023';
  end if;
  perform prive.releve_modifiable(v_l.releve_id);
  return v_l;
end;
$$;

revoke all on function
  prive.releve_modifiable(uuid),
  prive.ajouter_lignes_releve(public.releves_bancaires, jsonb),
  prive.pointer(public.lignes_releve, uuid),
  prive.ligne_releve_modifiable(uuid)
from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Relevés : création, modification, lignes
-- -----------------------------------------------------------------------------

-- Crée un relevé (p_releve_id null) ou modifie l'en-tête d'un brouillon ; p_lignes est ajouté à la suite.
create or replace function public.enregistrer_releve(
  p_entreprise_id  uuid,
  p_journal_id     uuid,
  p_date_debut     date,
  p_date_fin       date,
  p_solde_initial  bigint,
  p_solde_final    bigint,
  p_lignes         jsonb default null,
  p_source         text default 'manuel',
  p_fichier        text default null,
  p_notes          text default null,
  p_releve_id      uuid default null
)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_j public.journaux;
  v_r public.releves_bancaires;
begin
  if not prive.est_compta(p_entreprise_id) then
    raise exception 'Droits insuffisants : réservé à la comptabilité.' using errcode = '42501';
  end if;
  select * into v_j from public.journaux where id = p_journal_id and entreprise_id = p_entreprise_id;
  if v_j.id is null or v_j.compte_tresorerie_id is null then
    raise exception 'Choisissez un compte de banque, de caisse ou de Mobile Money.' using errcode = '22023';
  end if;
  if p_date_debut is null or p_date_fin is null or p_date_debut > p_date_fin then
    raise exception 'Période du relevé invalide.' using errcode = '22023';
  end if;

  if p_releve_id is null then
    insert into public.releves_bancaires (entreprise_id, journal_id, date_debut, date_fin, solde_initial, solde_final,
                                          source, fichier, notes, created_by)
    values (p_entreprise_id, p_journal_id, p_date_debut, p_date_fin, coalesce(p_solde_initial, 0),
            coalesce(p_solde_final, 0), coalesce(p_source, 'manuel'), nullif(trim(p_fichier), ''),
            nullif(trim(p_notes), ''), auth.uid())
    returning * into v_r;
  else
    v_r := prive.releve_modifiable(p_releve_id);
    if v_r.entreprise_id <> p_entreprise_id then
      raise exception 'Relevé introuvable.' using errcode = '22023';
    end if;
    if v_r.journal_id <> p_journal_id and exists (
      select 1 from public.lignes_releve where releve_id = v_r.id and ecriture_ligne_id is not null) then
      raise exception 'Dépointez les opérations avant de changer de compte.' using errcode = '22023';
    end if;
    update public.releves_bancaires
    set journal_id = p_journal_id, date_debut = p_date_debut, date_fin = p_date_fin,
        solde_initial = coalesce(p_solde_initial, 0), solde_final = coalesce(p_solde_final, 0),
        notes = nullif(trim(p_notes), ''),
        source = case when p_lignes is not null and jsonb_array_length(p_lignes) > 0 then coalesce(p_source, source) else source end,
        fichier = coalesce(nullif(trim(p_fichier), ''), fichier)
    where id = v_r.id
    returning * into v_r;
  end if;

  perform prive.ajouter_lignes_releve(v_r, p_lignes);
  return v_r.id;
end;
$$;

create or replace function public.supprimer_ligne_releve(p_ligne_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  perform prive.ligne_releve_modifiable(p_ligne_id);
  delete from public.lignes_releve where id = p_ligne_id;
end;
$$;

create or replace function public.supprimer_releve(p_releve_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  perform prive.releve_modifiable(p_releve_id);
  delete from public.releves_bancaires where id = p_releve_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Pointage
-- -----------------------------------------------------------------------------
create or replace function public.pointer_ligne_releve(p_ligne_id uuid, p_ecriture_ligne_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  perform prive.pointer(prive.ligne_releve_modifiable(p_ligne_id), p_ecriture_ligne_id);
end;
$$;

create or replace function public.depointer_ligne_releve(p_ligne_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  perform prive.ligne_releve_modifiable(p_ligne_id);
  update public.lignes_releve set ecriture_ligne_id = null, pointee_le = null where id = p_ligne_id;
end;
$$;

-- Opérations comptables du compte de trésorerie pas encore pointées (toutes périodes)
create or replace function public.operations_a_pointer(p_journal_id uuid, p_date_fin date default null)
returns table (
  ecriture_ligne_id uuid,
  ecriture_id       uuid,
  date_ecriture     date,
  numero            text,
  libelle           text,
  reference         text,
  montant           bigint
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_j public.journaux;
begin
  select * into v_j from public.journaux where id = p_journal_id;
  if v_j.id is null or not prive.peut_lire_compta(v_j.entreprise_id) then
    raise exception 'Compte introuvable.' using errcode = '22023';
  end if;
  return query
    select l.id, e.id, e.date_ecriture, e.numero, coalesce(l.libelle, e.libelle), e.reference, l.debit - l.credit
    from public.ecriture_lignes l
    join public.ecritures e on e.id = l.ecriture_id
    join public.journaux je on je.id = e.journal_id
    where l.entreprise_id = v_j.entreprise_id
      and l.compte_id = v_j.compte_tresorerie_id
      and e.statut = 'validee'
      and je.type <> 'a_nouveaux'
      and (p_date_fin is null or e.date_ecriture <= p_date_fin)
      and not exists (select 1 from public.lignes_releve r where r.ecriture_ligne_id = l.id)
    order by e.date_ecriture, e.numero;
end;
$$;

-- Pointe automatiquement : même montant, date la plus proche (± p_tolerance_jours),
-- à égalité la référence identique. Renvoie le nombre de lignes pointées.
create or replace function public.rapprocher_automatiquement(p_releve_id uuid, p_tolerance_jours integer default 7)
returns integer language plpgsql security definer set search_path = ''
as $$
declare
  v_r public.releves_bancaires;
  v_compte uuid;
  v_l public.lignes_releve;
  v_el uuid;
  v_n integer := 0;
begin
  v_r := prive.releve_modifiable(p_releve_id);
  select compte_tresorerie_id into v_compte from public.journaux where id = v_r.journal_id;

  for v_l in
    select * from public.lignes_releve where releve_id = v_r.id and ecriture_ligne_id is null order by ordre
  loop
    select l.id into v_el
    from public.ecriture_lignes l
    join public.ecritures e on e.id = l.ecriture_id
    join public.journaux je on je.id = e.journal_id
    where l.entreprise_id = v_r.entreprise_id
      and l.compte_id = v_compte
      and e.statut = 'validee'
      and je.type <> 'a_nouveaux'
      and l.debit - l.credit = v_l.montant
      and abs(e.date_ecriture - v_l.date_operation) <= greatest(coalesce(p_tolerance_jours, 7), 0)
      and not exists (select 1 from public.lignes_releve r where r.ecriture_ligne_id = l.id)
    order by abs(e.date_ecriture - v_l.date_operation),
             (v_l.reference is not null and e.reference = v_l.reference) desc,
             e.date_ecriture, e.numero
    limit 1;
    if v_el is not null then
      update public.lignes_releve set ecriture_ligne_id = v_el, pointee_le = now() where id = v_l.id;
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$$;

-- Comptabilise une opération connue seulement de la banque (frais, agios, virement reçu…)
-- au compte choisi, puis la pointe. Renvoie l'id de l'écriture créée.
create or replace function public.comptabiliser_ligne_releve(p_ligne_id uuid, p_compte_id uuid, p_libelle text default null)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_l public.lignes_releve;
  v_r public.releves_bancaires;
  v_ecriture uuid;
  v_el uuid;
begin
  v_l := prive.ligne_releve_modifiable(p_ligne_id);
  if v_l.ecriture_ligne_id is not null then
    raise exception 'Cette ligne est déjà pointée.' using errcode = '22023';
  end if;
  select * into v_r from public.releves_bancaires where id = v_l.releve_id;

  v_ecriture := public.enregistrer_operation_simple(
    v_r.entreprise_id,
    case when v_l.montant > 0 then 'recette' else 'depense' end,
    v_l.date_operation,
    abs(v_l.montant),
    v_r.journal_id,
    p_compte_id,
    coalesce(nullif(trim(p_libelle), ''), v_l.libelle),
    v_l.reference,
    null
  );

  select l.id into v_el
  from public.ecriture_lignes l join public.journaux j on j.id = v_r.journal_id
  where l.ecriture_id = v_ecriture and l.compte_id = j.compte_tresorerie_id
  limit 1;
  perform prive.pointer(v_l, v_el);
  return v_ecriture;
end;
$$;

-- -----------------------------------------------------------------------------
-- Validation et état de rapprochement
-- -----------------------------------------------------------------------------
create or replace function public.valider_releve(p_releve_id uuid)
returns text language plpgsql security definer set search_path = ''
as $$
declare
  v_r public.releves_bancaires;
  v_total bigint;
  v_non_pointees integer;
  v_precedent public.releves_bancaires;
  v_numero text;
begin
  v_r := prive.releve_modifiable(p_releve_id);

  select coalesce(sum(montant), 0), count(*) filter (where ecriture_ligne_id is null)
  into v_total, v_non_pointees
  from public.lignes_releve where releve_id = v_r.id;

  if v_non_pointees > 0 then
    raise exception '% ligne(s) du relevé ne sont pas pointées.', v_non_pointees using errcode = '22023';
  end if;
  if v_r.solde_initial + v_total <> v_r.solde_final then
    raise exception 'Le relevé ne s''équilibre pas : solde initial % + mouvements % ≠ solde final %.',
      v_r.solde_initial, v_total, v_r.solde_final using errcode = '22023';
  end if;

  select * into v_precedent from public.releves_bancaires
  where journal_id = v_r.journal_id and statut = 'valide'
  order by date_fin desc, valide_le desc limit 1;
  if v_precedent.id is not null then
    if v_r.date_debut <= v_precedent.date_fin then
      raise exception 'La période chevauche le relevé % (jusqu''au %).', v_precedent.numero, v_precedent.date_fin
        using errcode = '22023';
    end if;
    if v_r.solde_initial <> v_precedent.solde_final then
      raise exception 'Le solde initial (%) doit reprendre le solde final du relevé % (%).',
        v_r.solde_initial, v_precedent.numero, v_precedent.solde_final using errcode = '22023';
    end if;
  end if;

  v_numero := 'RB-' || extract(year from v_r.date_fin)::int || '-'
    || lpad(prive.prochain_numero(v_r.entreprise_id, 'releve', extract(year from v_r.date_fin)::int)::text, 5, '0');

  update public.releves_bancaires
  set statut = 'valide', numero = v_numero, valide_le = now(), valide_par = auth.uid()
  where id = v_r.id;
  return v_numero;
end;
$$;

-- Écart entre le solde du relevé et le solde comptable à la date de fin, et ce qui l'explique.
create or replace function public.etat_rapprochement(p_releve_id uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  v_r public.releves_bancaires;
  v_compte uuid;
  v_solde_comptable bigint;
  v_ecritures_non_pointees bigint;
  v_nb_ecritures integer;
  v_releve_non_pointe bigint;
  v_nb_releve integer;
  v_mouvements bigint;
  v_exercice uuid;
  v_debut_suivi date;
begin
  select * into v_r from public.releves_bancaires where id = p_releve_id;
  if v_r.id is null or not prive.peut_lire_compta(v_r.entreprise_id) then
    raise exception 'Relevé introuvable.' using errcode = '22023';
  end if;
  select compte_tresorerie_id into v_compte from public.journaux where id = v_r.journal_id;

  -- Solde comptable à la date de fin : à-nouveaux + mouvements de l'exercice qui la contient
  -- (sans exercice correspondant : toutes les écritures validées jusqu'à cette date)
  select id into v_exercice from public.exercices
  where entreprise_id = v_r.entreprise_id and date_debut <= v_r.date_fin and v_r.date_fin <= date_fin;
  select coalesce(sum(l.debit - l.credit), 0) into v_solde_comptable
  from public.ecriture_lignes l join public.ecritures e on e.id = l.ecriture_id
  where l.entreprise_id = v_r.entreprise_id and l.compte_id = v_compte
    and e.statut = 'validee' and e.date_ecriture <= v_r.date_fin
    and (v_exercice is null or e.exercice_id = v_exercice);

  -- Opérations non pointées depuis le début du suivi (premier relevé du compte)
  select min(date_debut) into v_debut_suivi from public.releves_bancaires where journal_id = v_r.journal_id;
  select coalesce(sum(montant), 0), count(*) into v_ecritures_non_pointees, v_nb_ecritures
  from public.operations_a_pointer(v_r.journal_id, v_r.date_fin)
  where date_ecriture >= v_debut_suivi;

  select coalesce(sum(montant) filter (where ecriture_ligne_id is null), 0),
         count(*) filter (where ecriture_ligne_id is null),
         coalesce(sum(montant), 0)
  into v_releve_non_pointe, v_nb_releve, v_mouvements
  from public.lignes_releve where releve_id = v_r.id;

  return jsonb_build_object(
    'solde_releve', v_r.solde_final,
    'solde_calcule', v_r.solde_initial + v_mouvements,
    'solde_comptable', v_solde_comptable,
    'ecritures_non_pointees', v_ecritures_non_pointees,
    'nb_ecritures_non_pointees', v_nb_ecritures,
    'releve_non_pointe', v_releve_non_pointe,
    'nb_releve_non_pointe', v_nb_releve,
    -- Solde du relevé = solde comptable − opérations comptables non pointées + lignes de relevé non pointées
    'ecart', v_r.solde_final - (v_solde_comptable - v_ecritures_non_pointees + v_releve_non_pointe)
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Droits d'exécution
-- -----------------------------------------------------------------------------
revoke execute on function
  public.enregistrer_releve(uuid, uuid, date, date, bigint, bigint, jsonb, text, text, text, uuid),
  public.supprimer_ligne_releve(uuid),
  public.supprimer_releve(uuid),
  public.pointer_ligne_releve(uuid, uuid),
  public.depointer_ligne_releve(uuid),
  public.operations_a_pointer(uuid, date),
  public.rapprocher_automatiquement(uuid, integer),
  public.comptabiliser_ligne_releve(uuid, uuid, text),
  public.valider_releve(uuid),
  public.etat_rapprochement(uuid)
from public, anon;

grant execute on function
  public.enregistrer_releve(uuid, uuid, date, date, bigint, bigint, jsonb, text, text, text, uuid),
  public.supprimer_ligne_releve(uuid),
  public.supprimer_releve(uuid),
  public.pointer_ligne_releve(uuid, uuid),
  public.depointer_ligne_releve(uuid),
  public.operations_a_pointer(uuid, date),
  public.rapprocher_automatiquement(uuid, integer),
  public.comptabiliser_ligne_releve(uuid, uuid, text),
  public.valider_releve(uuid),
  public.etat_rapprochement(uuid)
to authenticated;
